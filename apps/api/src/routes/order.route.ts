import { Router } from "express";
import {
  getOrders,
  getOrderById,
  updateOrderStatus,
} from "../controllers/order.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { sellerRateLimit } from "../middlewares/rateLimit.middleware";

export const orderRouter = Router();

// Semua route order wajib autentikasi
orderRouter.use(requireAuth, sellerRateLimit);

// GET /api/v1/orders
orderRouter.get("/", getOrders);

// GET /api/v1/orders/:id
orderRouter.get("/:id", getOrderById);

// PUT /api/v1/orders/:id/status
orderRouter.put("/:id/status", updateOrderStatus);
