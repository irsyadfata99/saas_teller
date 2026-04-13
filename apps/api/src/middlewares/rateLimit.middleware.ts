import rateLimit from "express-rate-limit";

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 10,
  message: {
    success: false,
    code: "RATE_LIMIT_EXCEEDED",
    message: "Terlalu banyak percobaan login, coba lagi dalam 15 menit",
  },
});

export const registerRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 jam
  max: 5,
  message: {
    success: false,
    code: "RATE_LIMIT_EXCEEDED",
    message: "Terlalu banyak percobaan registrasi",
  },
});

export const forgotPasswordRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 jam
  max: 5,
  message: {
    success: false,
    code: "RATE_LIMIT_EXCEEDED",
    message: "Terlalu banyak permintaan reset password",
  },
});

export const storefrontRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 menit
  max: 200,
  message: {
    success: false,
    code: "RATE_LIMIT_EXCEEDED",
    message: "Terlalu banyak request",
  },
});

export const orderRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 menit
  max: 20,
  message: {
    success: false,
    code: "RATE_LIMIT_EXCEEDED",
    message: "Terlalu banyak order dalam waktu singkat",
  },
});

export const sellerRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 menit
  max: 300,
  message: {
    success: false,
    code: "RATE_LIMIT_EXCEEDED",
    message: "Terlalu banyak request",
  },
});

export const adminRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 menit
  max: 500,
  message: {
    success: false,
    code: "RATE_LIMIT_EXCEEDED",
    message: "Terlalu banyak request",
  },
});
