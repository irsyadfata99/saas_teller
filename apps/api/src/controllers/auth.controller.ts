import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { redis } from "../config/redis";
import { env } from "../config/env";
import { AppError } from "../middlewares/error.middleware";
import { sendSuccess } from "../lib/response";

// ================================
// Schemas
// ================================
const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/, "Minimal 1 huruf kapital")
    .regex(/[0-9]/, "Minimal 1 angka"),
  storeName: z.string().min(2),
  subdomain: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-z0-9-]+$/, "Hanya huruf kecil, angka, dan tanda hubung"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/, "Minimal 1 huruf kapital")
    .regex(/[0-9]/, "Minimal 1 angka"),
});

// ================================
// Helpers
// ================================
function generateToken(userId: string, tenantId: string, role: string) {
  return jwt.sign({ userId, tenantId, role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

// ================================
// Controllers
// ================================

// POST /api/v1/auth/register
export async function register(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        422,
        "VALIDATION_ERROR",
        parsed.error.errors[0].message,
      );
    }

    const { name, email, password, storeName, subdomain } = parsed.data;

    // Cek email sudah terdaftar
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new AppError(422, "VALIDATION_ERROR", "Email sudah terdaftar");
    }

    // Cek subdomain sudah dipakai
    const existingTenant = await prisma.tenant.findUnique({
      where: { subdomain },
    });
    if (existingTenant) {
      throw new AppError(422, "VALIDATION_ERROR", "Subdomain sudah digunakan");
    }

    // Ambil plan Free
    const freePlan = await prisma.plan.findUnique({ where: { name: "Free" } });
    if (!freePlan) {
      throw new AppError(500, "INTERNAL_ERROR", "Plan tidak ditemukan");
    }

    const passwordHash = await bcrypt.hash(password, 12);

    // Buat tenant + user + store + subscription dalam satu transaction
    const { user, tenant } = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const tenant = await tx.tenant.create({
          data: {
            planId: freePlan.id,
            name: storeName,
            subdomain,
          },
        });

        const user = await tx.user.create({
          data: {
            tenantId: tenant.id,
            name,
            email,
            passwordHash,
            role: "seller",
          },
        });

        await tx.store.create({
          data: {
            tenantId: tenant.id,
            title: storeName,
          },
        });

        const now = new Date();
        const endsAt = new Date(
          now.getFullYear() + 100,
          now.getMonth(),
          now.getDate(),
        );

        await tx.subscription.create({
          data: {
            tenantId: tenant.id,
            planId: freePlan.id,
            status: "active",
            startsAt: now,
            endsAt,
            expiresAt: endsAt,
          },
        });

        return { user, tenant };
      },
    );

    const token = generateToken(user.id, tenant.id, user.role);

    return sendSuccess(
      res,
      {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        tenant: { id: tenant.id, subdomain: tenant.subdomain },
      },
      201,
    );
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/login
export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        422,
        "VALIDATION_ERROR",
        parsed.error.errors[0].message,
      );
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { tenant: true },
    });

    if (!user) {
      throw new AppError(
        401,
        "AUTH_INVALID_CREDENTIALS",
        "Email atau password salah",
      );
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new AppError(
        401,
        "AUTH_INVALID_CREDENTIALS",
        "Email atau password salah",
      );
    }

    if (user.tenant.status === "suspended") {
      throw new AppError(403, "FORBIDDEN", "Akun Anda telah disuspend");
    }

    const token = generateToken(user.id, user.tenantId, user.role);

    return sendSuccess(res, {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      tenant: {
        id: user.tenant.id,
        subdomain: user.tenant.subdomain,
        status: user.tenant.status,
      },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/logout
export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (token) {
      // Blacklist token di Redis sampai expired (7 hari)
      await redis.setex(`blacklist:${token}`, 7 * 24 * 60 * 60, "1");
    }

    return sendSuccess(res, { message: "Logout berhasil" });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/forgot-password
export async function forgotPassword(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        422,
        "VALIDATION_ERROR",
        parsed.error.errors[0].message,
      );
    }

    const { email } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });

    // Selalu return success meskipun email tidak ditemukan (security)
    if (!user) {
      return sendSuccess(res, {
        message: "Jika email terdaftar, link reset password akan dikirim",
      });
    }

    // Generate reset token
    const resetToken = randomUUID();
    const expiresAt = 60 * 60; // 1 jam dalam detik

    await redis.setex(`reset:${resetToken}`, expiresAt, user.id);

    // TODO: kirim email via Resend dengan link reset password
    // await sendResetPasswordEmail(user.email, resetToken);

    return sendSuccess(res, {
      message: "Jika email terdaftar, link reset password akan dikirim",
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/auth/reset-password
export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        422,
        "VALIDATION_ERROR",
        parsed.error.errors[0].message,
      );
    }

    const { token, password } = parsed.data;

    // Cek token di Redis
    const userId = await redis.get(`reset:${token}`);
    if (!userId) {
      throw new AppError(
        400,
        "VALIDATION_ERROR",
        "Token tidak valid atau sudah kedaluwarsa",
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // Hapus token setelah dipakai
    await redis.del(`reset:${token}`);

    return sendSuccess(res, { message: "Password berhasil direset" });
  } catch (err) {
    next(err);
  }
}
