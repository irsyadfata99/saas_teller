import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma";
import { redis } from "../config/redis";
import { env } from "../config/env";
import { AppError } from "./error.middleware";

export async function resolveTenant(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const hostname = req.hostname;
    const subdomain = hostname.replace(`.${env.PLATFORM_DOMAIN}`, "");

    if (!subdomain || subdomain === hostname) {
      return next();
    }

    // Cek Redis cache dulu
    const cached = await redis.get(`subdomain:${subdomain}`);
    if (cached) {
      const tenant = JSON.parse(cached);
      req.tenantId = tenant.id;
      return next();
    }

    // Cache miss — query database
    const tenant = await prisma.tenant.findFirst({
      where: {
        subdomain,
        status: { not: "suspended" },
      },
    });

    if (!tenant) {
      throw new AppError(404, "NOT_FOUND", "Toko tidak ditemukan");
    }

    // Simpan ke Redis dengan TTL 5 menit
    await redis.setex(`subdomain:${subdomain}`, 300, JSON.stringify(tenant));

    req.tenantId = tenant.id;
    next();
  } catch (err) {
    next(err);
  }
}
