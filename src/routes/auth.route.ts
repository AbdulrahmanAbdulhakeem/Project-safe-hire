import { Router } from "express";
import {
  adminCreateCompany,
  adminUpdateCompany,
  deleteCompanyProfile,
  getAdminStats,
  getAllCompaniesAdmin,
  getCompanyProfile,
  updateCompanyProfile,
} from "../controllers/admin.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

const router = Router();
router.use(requireAuth, requireRole("ADMIN"));

// Protect this route: must be logged in, and role must match 'ADMIN'
//Testing using the adminCreateCompany,the main utility is the adminCreateCompanyFromRegistry
router.post("/companies/onboard", adminCreateCompany);
router.get("/companies", getAllCompaniesAdmin);
router.get("/stats", getAdminStats);


router.get("/companies/:userId", getCompanyProfile);
router.put("/companies/:userId", updateCompanyProfile);
router.delete("/companies/:userId", deleteCompanyProfile);


router.put("/companies/:id", adminUpdateCompany);

export default router;
