import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../middlewares/error.middleware";
import { sendSuccess } from "../lib/response";

// ================================
// Schemas
// ================================
const updateOrderStatusSchema = z.object({
  status: z.enum(["processing", "shipped", "completed", "cancelled"]),
});

// ================================
// Controllers
// ================================

// GET /api/v1/orders
export async function getOrders(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const store = await prisma.store.findUnique({
      where: { tenantId: req.tenantId },
    });
    if (!store) throw new AppError(404, "NOT_FOUND", "Toko tidak ditemukan");

    const { page = "1", limit = "20", status } = req.query;
    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.min(100, parseInt(limit as string));
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = { storeId: store.id };
    if (status) where.status = status;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: "desc" },
        include: {
          orderItems: {
            include: { product: { select: { name: true, imageUrls: true } } },
          },
          payment: true,
        },
      }),
      prisma.order.count({ where }),
    ]);

    return sendSuccess(res, {
      orders,
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

// GET /api/v1/orders/:id
export async function getOrderById(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const store = await prisma.store.findUnique({
      where: { tenantId: req.tenantId },
    });
    if (!store) throw new AppError(404, "NOT_FOUND", "Toko tidak ditemukan");

    const order = await prisma.order.findFirst({
      where: { id: req.params.id, storeId: store.id },
      include: {
        orderItems: {
          include: { product: { select: { name: true, imageUrls: true } } },
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

// PUT /api/v1/orders/:id/status
export async function updateOrderStatus(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const store = await prisma.store.findUnique({
      where: { tenantId: req.tenantId },
    });
    if (!store) throw new AppError(404, "NOT_FOUND", "Toko tidak ditemukan");

    const existing = await prisma.order.findFirst({
      where: { id: req.params.id, storeId: store.id },
    });
    if (!existing)
      throw new AppError(404, "NOT_FOUND", "Order tidak ditemukan");

    const parsed = updateOrderStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(
        422,
        "VALIDATION_ERROR",
        parsed.error.errors[0].message,
      );
    }

    const { status } = parsed.data;

    // Validasi transisi status
    const allowedTransitions: Record<string, string[]> = {
      pending: ["cancelled"],
      paid: ["processing", "cancelled"],
      processing: ["shipped", "cancelled"],
      shipped: ["completed"],
      completed: [],
      cancelled: [],
    };

    if (!allowedTransitions[existing.status]?.includes(status)) {
      throw new AppError(
        422,
        "VALIDATION_ERROR",
        `Status tidak bisa diubah dari ${existing.status} ke ${status}`,
      );
    }

    // Jika cancelled — kembalikan stok
    if (status === "cancelled" && existing.status !== "cancelled") {
      const orderItems = await prisma.orderItem.findMany({
        where: { orderId: existing.id },
      });

      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        for (const item of orderItems) {
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: item.quantity } },
          });
        }

        await tx.order.update({
          where: { id: existing.id },
          data: { status },
        });
      });
    } else {
      await prisma.order.update({
        where: { id: existing.id },
        data: { status },
      });
    }

    const updated = await prisma.order.findUnique({
      where: { id: existing.id },
      include: { orderItems: true, payment: true },
    });

    return sendSuccess(res, updated);
  } catch (err) {
    next(err);
  }
}
