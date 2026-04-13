import { z } from "zod";

const envSchema = z.object({
  // Server
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.string().default("3001"),

  // Database & Cache
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("7d"),

  // Platform
  FRONTEND_URL: z.string(),
  PLATFORM_DOMAIN: z.string(),

  // Cloudflare R2
  R2_ACCOUNT_ID: z.string(),
  R2_ACCESS_KEY_ID: z.string(),
  R2_SECRET_ACCESS_KEY: z.string(),
  R2_BUCKET_NAME: z.string(),
  R2_PUBLIC_URL: z.string(),

  // Payment
  MIDTRANS_SERVER_KEY: z.string(),
  MIDTRANS_IS_PRODUCTION: z.string().default("false"),
  XENDIT_WEBHOOK_TOKEN: z.string(),

  // Email
  RESEND_API_KEY: z.string(),
  EMAIL_FROM: z.string(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
