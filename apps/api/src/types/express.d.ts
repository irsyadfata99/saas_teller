declare namespace Express {
  interface Request {
    userId: string;
    tenantId: string;
    role: string;
  }
}
