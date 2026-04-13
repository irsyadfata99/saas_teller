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
const updateStoreSchema = z.object({
  title: z.string().min(2).optional(),
  description: z.string().optional(),
  theme: z.string().optional(),
  seoMeta: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      keywords: z.string().optional(),
    })
    .optional(),
});

const updateLandingPageSchema = z.object({
  primaryColor: z.string().optional(),
  backgroundColor: z.string().optional(),
  fontPreset: z.string().optional(),
  hero: z
    .object({
      headline: z.string().optional(),
      subheadline: z.string().optional(),
      bannerUrl: z.string().optional(),
    })
    .optional(),
  valueProposition: z.string().optional(),
  howItWorks: z.array(z.string()).optional(),
  testimonials: z
    .array(
      z.object({
        name: z.string(),
        content: z.string(),
      }),
    )
    .optional(),
  faq: z
    .array(
      z.object({
        question: z.string(),
        answer: z.string(),
      }),
    )
    .optional(),
  contact: z
    .object({
      phone: z.string().optional(),
      address: z.string().optional(),
      email: z.string().optional(),
    })
    .optional(),
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

// ================================
// Controllers
// ================================

// GET /api/v1/store
export async function getStore(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const store = await prisma.store.findUnique({
      where: { tenantId: req.tenantId },
      include: {
        tenant: {
          include: {
            plan: true,
            subscriptions: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
      },
    });

    if (!store) {
      throw new AppError(404, "NOT_FOUND", "Toko tidak ditemukan");
    }

    return sendSuccess(res, store);
  } catch (err) {
    next(err);
  }
}

// PUT /api/v1/store
export async function updateStore(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = updateStoreSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        422,
        "VALIDATION_ERROR",
        parsed.error.errors[0].message,
      );
    }

    const data: Record<string, unknown> = { ...parsed.data };

    // Upload logo jika ada
    if (req.file) {
      data.logoUrl = await uploadToR2(req.file.buffer, "logos");
    }

    const store = await prisma.store.update({
      where: { tenantId: req.tenantId },
      data,
    });

    return sendSuccess(res, store);
  } catch (err) {
    next(err);
  }
}

// PUT /api/v1/store/landing-page
export async function updateLandingPage(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    // Parse body — bisa datang sebagai JSON string atau object
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        throw new AppError(422, "VALIDATION_ERROR", "Body tidak valid");
      }
    }

    const parsed = updateLandingPageSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(
        422,
        "VALIDATION_ERROR",
        parsed.error.errors[0].message,
      );
    }

    const landingPageConfig = { ...parsed.data };

    // Upload banner jika ada
    if (req.file) {
      if (!landingPageConfig.hero) {
        landingPageConfig.hero = {};
      }
      landingPageConfig.hero.bannerUrl = await uploadToR2(
        req.file.buffer,
        "banners",
      );
    }

    // Ambil config lama dan merge
    const existing = await prisma.store.findUnique({
      where: { tenantId: req.tenantId },
      select: { landingPageConfig: true },
    });

    const mergedConfig = {
      ...((existing?.landingPageConfig as object) ?? {}),
      ...landingPageConfig,
    };

    const store = await prisma.store.update({
      where: { tenantId: req.tenantId },
      data: { landingPageConfig: mergedConfig },
    });

    return sendSuccess(res, store);
  } catch (err) {
    next(err);
  }
}
