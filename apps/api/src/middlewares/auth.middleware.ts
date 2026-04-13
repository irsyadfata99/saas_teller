import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { redis } from "../config/redis";
import { AppError } from "./error.middleware";

interface JwtPayload {
  userId: string;
  tenantId: string;
  role: string;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) {
      throw new AppError(401, "AUTH_TOKEN_EXPIRED", "Token tidak ditemukan");
    }

    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;

    // Cek token blacklist (sudah logout)
    const blacklisted = await redis.get(`blacklist:${token}`);
    if (blacklisted) {
      throw new AppError(401, "AUTH_TOKEN_EXPIRED", "Token sudah tidak valid");
    }

    req.userId = payload.userId;
    req.tenantId = payload.tenantId;
    req.role = payload.role;

    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(new AppError(401, "AUTH_TOKEN_EXPIRED", "Token tidak valid"));
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.role !== "per_admin") {
    return next(new AppError(403, "FORBIDDEN", "Akses ditolak"));
  }
  next();
}
