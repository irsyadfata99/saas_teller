import { Router } from "express";
import {
  getStore,
  updateStore,
  updateLandingPage,
} from "../controllers/store.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { sellerRateLimit } from "../middlewares/rateLimit.middleware";
import { uploadLogo, uploadBanner } from "../middlewares/upload.middleware";

export const storeRouter = Router();

// Semua route store wajib autentikasi
storeRouter.use(requireAuth, sellerRateLimit);

// GET /api/v1/store
storeRouter.get("/", getStore);

// PUT /api/v1/store
storeRouter.put("/", uploadLogo.single("logo"), updateStore);

// PUT /api/v1/store/landing-page
storeRouter.put(
  "/landing-page",
  uploadBanner.single("banner"),
  updateLandingPage,
);
