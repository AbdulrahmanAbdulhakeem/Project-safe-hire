import { Router } from "express";
import { adminCreateCompany, deleteCompanyProfile, getAllCompaniesAdmin } from "../controllers/admin.controller";
import { requireAuth, requireRole } from "../middleware/auth.middleware";

const router = Router();

// Protect this route: must be logged in, and role must match 'ADMIN'
//Testing using the adminCreateCompany,the main utility is the adminCreateCompanyFromRegistry
router.post("/companies/onboard", requireAuth, requireRole("ADMIN"), adminCreateCompany);
router.get("/companies", requireAuth, requireRole("ADMIN"), getAllCompaniesAdmin);
router.delete("/companies/:userId" ,deleteCompanyProfile)

export default router;