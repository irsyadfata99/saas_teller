import { Response } from "express";

export function sendSuccess(
  res: Response,
  data: unknown,
  statusCode: number = 200,
) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

export function sendError(
  res: Response,
  code: string,
  message: string,
  statusCode: number = 400,
) {
  return res.status(statusCode).json({
    success: false,
    code,
    message,
  });
}
