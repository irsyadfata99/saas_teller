import { Router } from "express";
import {
  getStorefront,
  getStorefrontProducts,
  getStorefrontProductById,
  createOrder,
  getOrderStatus,
} from "../controllers/storefront.controller";
import { resolveTenant } from "../middlewares/tenant.middleware";
import {
  storefrontRateLimit,
  orderRateLimit,
} from "../middlewares/rateLimit.middleware";

export const storefrontRouter = Router();

// Semua route storefront pakai tenant resolver & rate limit
storefrontRouter.use(resolveTenant, storefrontRateLimit);

// GET /storefront/:subdomain
storefrontRouter.get("/:subdomain", getStorefront);

// GET /storefront/:subdomain/products
storefrontRouter.get("/:subdomain/products", getStorefrontProducts);

// GET /storefront/:subdomain/products/:id
storefrontRouter.get("/:subdomain/products/:id", getStorefrontProductById);

// POST /storefront/:subdomain/orders
storefrontRouter.post("/:subdomain/orders", orderRateLimit, createOrder);

// GET /storefront/:subdomain/orders/:id
storefrontRouter.get("/:subdomain/orders/:id", getOrderStatus);
