import { Router } from "express";
import {
  getTenants,
  getTenantById,
  updateTenantStatus,
  deleteTenant,
  overrideTenantPlan,
  getPlans,
  updatePlan,
  getRevenue,
  getLogs,
} from "../controllers/admin.controller";
import { requireAuth, requireAdmin } from "../middlewares/auth.middleware";
import { adminRateLimit } from "../middlewares/rateLimit.middleware";

export const adminRouter = Router();

// Semua route admin wajib autentikasi + role per_admin
adminRouter.use(requireAuth, requireAdmin, adminRateLimit);

// GET /api/v1/admin/tenants
adminRouter.get("/tenants", getTenants);

// GET /api/v1/admin/tenants/:id
adminRouter.get("/tenants/:id", getTenantById);

// PUT /api/v1/admin/tenants/:id/status
adminRouter.put("/tenants/:id/status", updateTenantStatus);

// DELETE /api/v1/admin/tenants/:id
adminRouter.delete("/tenants/:id", deleteTenant);

// PUT /api/v1/admin/tenants/:id/plan
adminRouter.put("/tenants/:id/plan", overrideTenantPlan);

// GET /api/v1/admin/plans
adminRouter.get("/plans", getPlans);

// PUT /api/v1/admin/plans/:id
adminRouter.put("/plans/:id", updatePlan);

// GET /api/v1/admin/revenue
adminRouter.get("/revenue", getRevenue);

// GET /api/v1/admin/logs
adminRouter.get("/logs", getLogs);
