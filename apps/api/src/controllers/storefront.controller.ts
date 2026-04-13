import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error.middleware";
import { sendSuccess } from "../lib/response";
import { emailQueue } from "../lib/queue";

// ================================
// Schemas
// ================================
const createOrderSchema = z.object({
  buyerName: z.string().min(2),
  buyerEmail: z.string().email(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.coerce.number().int().min(1),
      }),
    )
    .min(1),
});

// ================================
// Types
// ================================
interface ProductRow {
  id: string;
  name: string;
  slug: string;
  price: number;
  stock: number;
  storeId: string;
  isActive: boolean;
  description: string | null;
  imageUrls: string[];
  createdAt: Date;
  updatedAt: Date;
}

// ================================
// Helpers
// ================================
async function getTenantStore(tenantId: string) {
  const store = await prisma.store.findUnique({
    where: { tenantId },
    include: { tenant: { include: { plan: true } } },
  });
  if (!store) throw new AppError(404, "NOT_FOUND", "Toko tidak ditemukan");
  return store;
}

// ================================
// Controllers
// ================================

// GET /storefront/:subdomain
export async function getStorefront(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const store = await prisma.store.findUnique({
      where: { tenantId: req.tenantId },
      include: {
        tenant: {
          include: { plan: true },
        },
        products: {
          where: { isActive: true },
          take: 8,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!store) throw new AppError(404, "NOT_FOUND", "Toko tidak ditemukan");

    return sendSuccess(res, store);
  } catch (err) {
    next(err);
  }
}

// GET /storefront/:subdomain/products
export async function getStorefrontProducts(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const store = await getTenantStore(req.tenantId);

    const { page = "1", limit = "20", search } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, parseInt(limit as string));
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = {
      storeId: store.id,
      isActive: true,
    };

    if (search) {
      where.name = { contains: search as string, mode: "insensitive" };
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

// GET /storefront/:subdomain/products/:id
export async function getStorefrontProductById(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const store = await getTenantStore(req.tenantId);

    // Support lookup by id atau slug
    const product = await prisma.product.findFirst({
      where: {
        storeId: store.id,
        isActive: true,
        OR: [{ id: req.params.id }, { slug: req.params.id }],
      },
    });

    if (!product)
      throw new AppError(404, "NOT_FOUND", "Produk tidak ditemukan");

    return sendSuccess(res, product);
  } catch (err) {
    next(err);
  }
}

// POST /storefront/:subdomain/orders
export async function createOrder(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const store = await getTenantStore(req.tenantId);

    // Cek storefront aktif
    if (
      store.tenant.status === "suspended" ||
      store.tenant.status === "cancelled"
    ) {
      throw new AppError(403, "FORBIDDEN", "Toko sedang tidak aktif");
    }

    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        422,
        "VALIDATION_ERROR",
        parsed.error.errors[0].message,
      );
    }

    const { buyerName, buyerEmail, items } = parsed.data;

    // Validasi semua produk & stok dalam satu query
    const productIds = items.map((i) => i.productId);
    const products: ProductRow[] = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        storeId: store.id,
        isActive: true,
      },
    });

    if (products.length !== items.length) {
      throw new AppError(
        404,
        "NOT_FOUND",
        "Satu atau lebih produk tidak ditemukan",
      );
    }

    // Cek stok & hitung total
    let totalAmount = 0;
    const orderItemsData: {
      productId: string;
      quantity: number;
      unitPrice: number;
    }[] = [];

    for (const item of items) {
      const product = products.find((p: ProductRow) => p.id === item.productId);
      if (!product) {
        throw new AppError(404, "NOT_FOUND", "Produk tidak ditemukan");
      }

      if (product.stock < item.quantity) {
        throw new AppError(
          422,
          "VALIDATION_ERROR",
          `Stok ${product.name} tidak mencukupi (tersisa ${product.stock})`,
        );
      }

      totalAmount += product.price * item.quantity;
      orderItemsData.push({
        productId: product.id,
        quantity: item.quantity,
        unitPrice: product.price,
      });
    }

    // Buat order + kurangi stok secara atomik
    const order = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const newOrder = await tx.order.create({
          data: {
            storeId: store.id,
            buyerName,
            buyerEmail,
            totalAmount,
            status: "pending",
            orderItems: {
              create: orderItemsData,
            },
          },
          include: { orderItems: true },
        });

        // Kurangi stok tiap produk
        for (const item of orderItemsData) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: item.quantity } },
          });
        }

        return newOrder;
      },
    );

    // Notifikasi ke seller
    await emailQueue.add("send-order-confirmation", {
      orderId: order.id,
      buyerEmail: order.buyerEmail,
      buyerName: order.buyerName,
      storeTitle: store.title,
    });

    return sendSuccess(res, order, 201);
  } catch (err) {
    next(err);
  }
}

// GET /storefront/:subdomain/orders/:id
export async function getOrderStatus(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const store = await getTenantStore(req.tenantId);

    const order = await prisma.order.findFirst({
      where: { id: req.params.id, storeId: store.id },
      include: {
        orderItems: {
          include: {
            product: { select: { name: true, imageUrls: true } },
          },
        },
        payment: true,
      },
    });

    if (!order) throw new AppError(404, "NOT_FOUND", "Order tidak ditemukan");

    return sendSuccess(res, order);
  } catch (err) {
    next(err);
  }
}
