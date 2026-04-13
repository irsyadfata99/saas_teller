import { Router } from "express";
import {
  register,
  login,
  logout,
  forgotPassword,
  resetPassword,
} from "../controllers/auth.controller";
import {
  loginRateLimit,
  registerRateLimit,
  forgotPasswordRateLimit,
} from "../middlewares/rateLimit.middleware";
import { requireAuth } from "../middlewares/auth.middleware";

export const authRouter = Router();

// POST /api/v1/auth/register
authRouter.post("/register", registerRateLimit, register);

// POST /api/v1/auth/login
authRouter.post("/login", loginRateLimit, login);

// POST /api/v1/auth/logout
authRouter.post("/logout", requireAuth, logout);

// POST /api/v1/auth/forgot-password
authRouter.post("/forgot-password", forgotPasswordRateLimit, forgotPassword);

// POST /api/v1/auth/reset-password
authRouter.post("/reset-password", resetPassword);
