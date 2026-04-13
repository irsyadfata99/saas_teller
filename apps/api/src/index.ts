import express from "express";
import helmet from "helmet";
import cors from "cors";
import { env } from "./config/env";
import { authRouter } from "./routes/auth.route";
import { storeRouter } from "./routes/store.route";
import { productRouter } from "./routes/product.route";
import { orderRouter } from "./routes/order.route";
import { paymentRouter } from "./routes/payment.route";
import { storefrontRouter } from "./routes/storefront.route";
import { adminRouter } from "./routes/admin.route";
import { errorHandler } from "./middlewares/error.middleware";

const app = express();

// ================================
// Security Middleware
// ================================
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ================================
// CORS — support wildcard subdomain
// ================================
app.use(
  cors({
    origin: (origin, callback) => {
      const allowed = new RegExp(`^https?://(.*\\.)?${env.PLATFORM_DOMAIN}$`);
      if (!origin || allowed.test(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);

// ================================
// Health Check
// ================================
app.get("/health", (_, res) => {
  res.json({ ok: true });
});

// ================================
// Routes
// ================================
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/store", storeRouter);
app.use("/api/v1/products", productRouter);
app.use("/api/v1/orders", orderRouter);
app.use("/api/v1/payments", paymentRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/storefront", storefrontRouter);

// ================================
// Error Handler — harus paling bawah
// ================================
app.use(errorHandler);

// ================================
// Start Server
// ================================
const PORT = Number(env.PORT) || 3001;

app.listen(PORT, () => {
  console.log(`✅ API running on port ${PORT}`);
  console.log(`✅ Environment: ${env.NODE_ENV}`);
});

export default app;
