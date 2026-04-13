import multer from "multer";
import { AppError } from "./error.middleware";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const storage = multer.memoryStorage();

const fileFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    return cb(
      new AppError(
        422,
        "VALIDATION_ERROR",
        "Format file tidak didukung. Gunakan JPG, PNG, atau WebP",
      ),
    );
  }
  cb(null, true);
};

export const uploadProduct = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 8, // maksimal 8 foto per produk
  },
});

export const uploadLogo = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
    files: 1,
  },
});

export const uploadBanner = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
});
