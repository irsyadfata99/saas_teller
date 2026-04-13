import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "../config/prisma";
import { r2 } from "../config/r2";
import { env } from "../config/env";
import { AppError } from "../middlewares/error.middleware";
import { sendSuccess } from "../lib/response";

// ================================
// Schemas
// ================================
const createProductSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  price: z.coerce.number().int().min(0),
  stock: z.coerce.number().int().min(0).default(0),
  isActive: z.coerce.boolean().default(true),
});

const updateProductSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  price: z.coerce.number().int().min(0).optional(),
  stock: z.coerce.number().int().min(0).optional(),
  isActive: z.coerce.boolean().optional(),
});

// ================================
// Helpers
// ================================
async function uploadToR2(buffer: Buffer, folder: string): Promise<string> {
  const key = `${folder}/${randomUUID()}.webp`;
  const webp = await sharp(buffer).webp({ quality: 85 }).toBuffer();

  await r2.send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      Body: webp,
      ContentType: "image/webp",
    }),
  );

  return `${env.R2_PUBLIC_URL}/${key}`;
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

async function getStore(tenantId: string) {
  const store = await prisma.store.findUnique({ where: { tenantId } });
  if (!store) throw new AppError(404, "NOT_FOUND", "Toko tidak ditemukan");
  return store;
}

// ================================
// Controllers
// ================================

// GET /api/v1/products
export async function getProducts(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const store = await getStore(req.tenantId);

    const { page = "1", limit = "20", search, isActive } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, parseInt(limit as string));
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = { storeId: store.id };
    if (search) {
      where.name = { contains: search as string, mode: "insensitive" };
    }
    if (isActive !== undefined) {
      where.isActive = isActive === "true";
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
      }),
      prisma.product.count({ where }),
    ]);

    return sendSuccess(res, {
      products,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/products
export async function createProduct(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const store = await getStore(req.tenantId);

    // Cek batas produk sesuai plan
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId },
      include: { plan: true },
    });

    if (!tenant) throw new AppError(404, "NOT_FOUND", "Tenant tidak ditemukan");

    const productCount = await prisma.product.count({
      where: { storeId: store.id },
    });

    if (productCount >= tenant.plan.maxProducts) {
      throw new AppError(
        403,
        "PLAN_LIMIT_EXCEEDED",
        `Paket ${tenant.plan.name} hanya mendukung maksimal ${tenant.plan.maxProducts} produk`,
      );
    }

    const parsed = createProductSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        422,
        "VALIDATION_ERROR",
        parsed.error.errors[0].message,
      );
    }

    const { name, description, price, stock, isActive } = parsed.data;

    // Upload foto produk
    const files = req.files as Express.Multer.File[];
    const imageUrls: string[] = [];

    if (files && files.length > 0) {
      for (const file of files) {
        const url = await uploadToR2(file.buffer, "products");
        imageUrls.push(url);
      }
    }

    // Generate unique slug
    let slug = generateSlug(name);
    const existing = await prisma.product.findUnique({
      where: { storeId_slug: { storeId: store.id, slug } },
    });
    if (existing) {
      slug = `${slug}-${randomUUID().slice(0, 6)}`;
    }

    const product = await prisma.product.create({
      data: {
        storeId: store.id,
        name,
        slug,
        description,
        price,
        stock,
        imageUrls,
        isActive,
      },
    });

    return sendSuccess(res, product, 201);
  } catch (err) {
    next(err);
  }
}

// PUT /api/v1/products/:id
export async function updateProduct(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const store = await getStore(req.tenantId);

    // Pastikan produk milik toko ini
    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, storeId: store.id },
    });

    if (!existing) {
      throw new AppError(404, "NOT_FOUND", "Produk tidak ditemukan");
    }

    const parsed = updateProductSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        422,
        "VALIDATION_ERROR",
        parsed.error.errors[0].message,
      );
    }

    const data: Record<string, unknown> = { ...parsed.data };

    // Upload foto baru jika ada — replace semua foto lama
    const files = req.files as Express.Multer.File[];
    if (files && files.length > 0) {
      const imageUrls: string[] = [];
      for (const file of files) {
        const url = await uploadToR2(file.buffer, "products");
        imageUrls.push(url);
      }
      data.imageUrls = imageUrls;
    }

    // Update slug jika nama berubah
    if (parsed.data.name) {
      let slug = generateSlug(parsed.data.name);
      const slugExists = await prisma.product.findFirst({
        where: {
          storeId: store.id,
          slug,
          NOT: { id: existing.id },
        },
      });
      if (slugExists) {
        slug = `${slug}-${randomUUID().slice(0, 6)}`;
      }
      data.slug = slug;
    }

    const product = await prisma.product.update({
      where: { id: existing.id },
      data,
    });

    return sendSuccess(res, product);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/products/:id
export async function deleteProduct(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const store = await getStore(req.tenantId);

    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, storeId: store.id },
    });

    if (!existing) {
      throw new AppError(404, "NOT_FOUND", "Produk tidak ditemukan");
    }

    await prisma.product.delete({ where: { id: existing.id } });

    return sendSuccess(res, { message: "Produk berhasil dihapus" });
  } catch (err) {
    next(err);
  }
}
