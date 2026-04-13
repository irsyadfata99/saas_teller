import { Router } from "express";
import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
} from "../controllers/product.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { sellerRateLimit } from "../middlewares/rateLimit.middleware";
import { uploadProduct } from "../middlewares/upload.middleware";

export const productRouter = Router();

// Semua route product wajib autentikasi
productRouter.use(requireAuth, sellerRateLimit);

// GET /api/v1/products
productRouter.get("/", getProducts);

// POST /api/v1/products
productRouter.post("/", uploadProduct.array("images", 8), createProduct);

// PUT /api/v1/products/:id
productRouter.put("/:id", uploadProduct.array("images", 8), updateProduct);

// DELETE /api/v1/products/:id
productRouter.delete("/:id", deleteProduct);
