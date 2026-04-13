import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { AppError } from "../middlewares/error.middleware";
import { emailQueue } from "../lib/queue";

// ================================
// Helpers
// ================================
async function handlePaymentSuccess(
  tx: Prisma.TransactionClient,
  orderId: string,
  gatewayTxId: string,
  amount: number,
  gateway: string,
) {
  // Update order status ke paid
  const order = await tx.order.update({
    where: { id: orderId },
    data: { status: "paid" },
    include: { orderItems: true },
  });

  // Update payment status
  await tx.payment.update({
    where: { gatewayTxId },
    data: { status: "paid", paidAt: new Date() },
  });

  // Kurangi stok produk
  for (const item of order.orderItems) {
    await tx.product.update({
      where: { id: item.productId },
      data: { stock: { decrement: item.quantity } },
    });
  }

  return order;
}

async function handlePaymentFailed(
  tx: Prisma.TransactionClient,
  orderId: string,
  gatewayTxId: string,
) {
  // Update order status ke cancelled — stok dikembalikan
  const order = await tx.order.update({
    where: { id: orderId },
    data: { status: "cancelled" },
    include: { orderItems: true },
  });

  // Kembalikan stok
  for (const item of order.orderItems) {
    await tx.product.update({
      where: { id: item.productId },
      data: { stock: { increment: item.quantity } },
    });
  }

  // Update payment status
  await tx.payment.update({
    where: { gatewayTxId },
    data: { status: "failed" },
  });

  return order;
}

// ================================
// Controllers
// ================================

// POST /api/v1/payments/webhook/midtrans
export async function midtransWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const {
      order_id,
      status_code,
      gross_amount,
      signature_key,
      transaction_status,
      fraud_status,
    } = req.body;

    if (!order_id || !status_code || !gross_amount || !signature_key) {
      throw new AppError(400, "VALIDATION_ERROR", "Payload tidak valid");
    }

    // Verifikasi signature SHA512
    const expected = crypto
      .createHash("sha512")
      .update(
        `${order_id}${status_code}${gross_amount}${env.MIDTRANS_SERVER_KEY}`,
      )
      .digest("hex");

    if (expected !== signature_key) {
      throw new AppError(
        400,
        "WEBHOOK_INVALID_SIGNATURE",
        "Signature tidak valid",
      );
    }

    // Cek idempotency — cegah double processing
    const existingPayment = await prisma.payment.findUnique({
      where: { gatewayTxId: order_id },
    });

    if (existingPayment?.status === "paid") {
      return res.json({ ok: true }); // Already processed
    }

    // Tentukan status dari Midtrans
    const isSuccess =
      transaction_status === "capture" ||
      transaction_status === "settlement" ||
      (transaction_status === "capture" && fraud_status === "accept");

    const isFailed =
      transaction_status === "deny" ||
      transaction_status === "cancel" ||
      transaction_status === "expire";

    if (isSuccess) {
      const order = await prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          return handlePaymentSuccess(
            tx,
            existingPayment?.orderId ?? order_id,
            order_id,
            parseInt(gross_amount),
            "midtrans",
          );
        },
      );

      // Kirim email konfirmasi ke buyer
      await emailQueue.add("send-order-confirmation", {
        orderId: order.id,
        buyerEmail: order.buyerEmail,
        buyerName: order.buyerName,
      });
    } else if (isFailed) {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        return handlePaymentFailed(
          tx,
          existingPayment?.orderId ?? order_id,
          order_id,
        );
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/payments/webhook/xendit
export async function xenditWebhook(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    // Validasi callback token
    const callbackToken = req.headers["x-callback-token"];
    if (callbackToken !== env.XENDIT_WEBHOOK_TOKEN) {
      throw new AppError(
        400,
        "WEBHOOK_INVALID_SIGNATURE",
        "Callback token tidak valid",
      );
    }

    const { id: gatewayTxId, external_id: orderId, status, amount } = req.body;

    if (!gatewayTxId || !orderId || !status) {
      throw new AppError(400, "VALIDATION_ERROR", "Payload tidak valid");
    }

    // Cek idempotency
    const existingPayment = await prisma.payment.findUnique({
      where: { gatewayTxId },
    });

    if (existingPayment?.status === "paid") {
      return res.json({ ok: true }); // Already processed
    }

    const isSuccess = status === "PAID" || status === "SETTLED";
    const isFailed = status === "EXPIRED";

    if (isSuccess) {
      const order = await prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          return handlePaymentSuccess(
            tx,
            orderId,
            gatewayTxId,
            amount,
            "xendit",
          );
        },
      );

      await emailQueue.add("send-order-confirmation", {
        orderId: order.id,
        buyerEmail: order.buyerEmail,
        buyerName: order.buyerName,
      });
    } else if (isFailed) {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        return handlePaymentFailed(tx, orderId, gatewayTxId);
      });
    }

    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
