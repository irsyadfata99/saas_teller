import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error.middleware";
import { sendSuccess } from "../lib/response";

// ================================
// Schemas
// ================================
const updateTenantStatusSchema = z.object({
  status: z.enum(["active", "suspended"]),
});

const overrideTenantPlanSchema = z.object({
  planId: z.string().min(1),
});

const updatePlanSchema = z.object({
  name: z.string().min(1).optional(),
  price: z.number().int().min(0).optional(),
  maxProducts: z.number().int().min(1).optional(),
  paymentGateway: z.boolean().optional(),
  customDomain: z.boolean().optional(),
  analytics: z.boolean().optional(),
  features: z.record(z.unknown()).optional(),
});

// ================================
// Types
// ================================
interface SubscriptionWithPlan {
  plan: { name: string; price: number };
}

// ================================
// Controllers
// ================================

// GET /api/v1/admin/tenants
export async function getTenants(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { page = "1", limit = "20", status, search } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, parseInt(limit as string));
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: "insensitive" } },
        { subdomain: { contains: search as string, mode: "insensitive" } },
      ];
    }

    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
        include: {
          plan: true,
          subscriptions: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          _count: { select: { users: true } },
        },
      }),
      prisma.tenant.count({ where }),
    ]);

    return sendSuccess(res, {
      tenants,
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

// GET /api/v1/admin/tenants/:id
export async function getTenantById(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
      include: {
        plan: true,
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            createdAt: true,
          },
        },
        store: true,
        subscriptions: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!tenant) throw new AppError(404, "NOT_FOUND", "Tenant tidak ditemukan");

    return sendSuccess(res, tenant);
  } catch (err) {
    next(err);
  }
}

// PUT /api/v1/admin/tenants/:id/status
export async function updateTenantStatus(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = updateTenantStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        422,
        "VALIDATION_ERROR",
        parsed.error.errors[0].message,
      );
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
    });
    if (!tenant) throw new AppError(404, "NOT_FOUND", "Tenant tidak ditemukan");

    const updated = await prisma.tenant.update({
      where: { id: req.params.id },
      data: { status: parsed.data.status },
    });

    return sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
}

// DELETE /api/v1/admin/tenants/:id
export async function deleteTenant(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
    });
    if (!tenant) throw new AppError(404, "NOT_FOUND", "Tenant tidak ditemukan");

    await prisma.tenant.delete({ where: { id: req.params.id } });

    return sendSuccess(res, { message: "Tenant berhasil dihapus" });
  } catch (err) {
    next(err);
  }
}

// PUT /api/v1/admin/tenants/:id/plan
export async function overrideTenantPlan(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = overrideTenantPlanSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        422,
        "VALIDATION_ERROR",
        parsed.error.errors[0].message,
      );
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
    });
    if (!tenant) throw new AppError(404, "NOT_FOUND", "Tenant tidak ditemukan");

    const plan = await prisma.plan.findUnique({
      where: { id: parsed.data.planId },
    });
    if (!plan) throw new AppError(404, "NOT_FOUND", "Plan tidak ditemukan");

    const now = new Date();
    const endsAt = new Date(
      now.getFullYear() + 1,
      now.getMonth(),
      now.getDate(),
    );

    const updated = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const updatedTenant = await tx.tenant.update({
          where: { id: req.params.id },
          data: { planId: parsed.data.planId, status: "active" },
        });

        await tx.subscription.create({
          data: {
            tenantId: req.params.id,
            planId: parsed.data.planId,
            status: "active",
            startsAt: now,
            endsAt,
            expiresAt: endsAt,
          },
        });

        return updatedTenant;
      },
    );

    return sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/plans
export async function getPlans(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const plans = await prisma.plan.findMany({
      orderBy: { price: "asc" },
      include: { _count: { select: { tenants: true } } },
    });

    return sendSuccess(res, plans);
  } catch (err) {
    next(err);
  }
}

// PUT /api/v1/admin/plans/:id
export async function updatePlan(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = updatePlanSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        422,
        "VALIDATION_ERROR",
        parsed.error.errors[0].message,
      );
    }

    const plan = await prisma.plan.findUnique({ where: { id: req.params.id } });
    if (!plan) throw new AppError(404, "NOT_FOUND", "Plan tidak ditemukan");

    const updated = await prisma.plan.update({
      where: { id: req.params.id },
      data: parsed.data,
    });

    return sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/revenue
export async function getRevenue(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const activeSubscriptions: SubscriptionWithPlan[] =
      await prisma.subscription.findMany({
        where: { status: "active" },
        include: { plan: true },
      });

    const mrr = activeSubscriptions.reduce(
      (sum: number, sub: SubscriptionWithPlan) => sum + sub.plan.price,
      0,
    );

    const breakdown = activeSubscriptions.reduce(
      (
        acc: Record<string, { count: number; revenue: number }>,
        sub: SubscriptionWithPlan,
      ) => {
        const planName = sub.plan.name;
        if (!acc[planName]) acc[planName] = { count: 0, revenue: 0 };
        acc[planName].count += 1;
        acc[planName].revenue += sub.plan.price;
        return acc;
      },
      {},
    );

    const tenantStats = await prisma.tenant.groupBy({
      by: ["status"],
      _count: { id: true },
    });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const newSubscriptions = await prisma.subscription.count({
      where: {
        status: "active",
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    const churnedSubscriptions = await prisma.subscription.count({
      where: {
        status: { in: ["cancelled", "suspended"] },
        updatedAt: { gte: thirtyDaysAgo },
      },
    });

    return sendSuccess(res, {
      mrr,
      breakdown,
      tenantStats,
      newSubscriptions,
      churnedSubscriptions,
    });
  } catch (err) {
    next(err);
  }
}

// GET /api/v1/admin/logs
export async function getLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const { page = "1", limit = "50" } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, parseInt(limit as string));
    const skip = (pageNum - 1) * limitNum;

    const [orders, payments, total] = await Promise.all([
      prisma.order.findMany({
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
        include: {
          store: {
            select: { title: true, tenant: { select: { subdomain: true } } },
          },
          payment: true,
        },
      }),
      prisma.payment.findMany({
        take: limitNum,
        orderBy: { createdAt: "desc" },
        include: { order: { select: { buyerName: true, totalAmount: true } } },
      }),
      prisma.order.count(),
    ]);

    return sendSuccess(res, {
      orders,
      payments,
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
