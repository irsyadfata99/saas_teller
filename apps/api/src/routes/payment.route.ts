import { Router } from "express";
import {
  midtransWebhook,
  xenditWebhook,
} from "../controllers/payment.controller";

export const paymentRouter = Router();

// POST /api/v1/payments/webhook/midtrans
// Tidak pakai requireAuth — request dari Midtrans server
paymentRouter.post("/webhook/midtrans", midtransWebhook);

// POST /api/v1/payments/webhook/xendit
// Tidak pakai requireAuth — request dari Xendit server
paymentRouter.post("/webhook/xendit", xenditWebhook);
