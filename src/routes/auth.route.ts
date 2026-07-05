import { Router } from "express";
import { adminCreateCompany, adminUpdateCompany, deleteCompanyProfile, getAdminStats, getAllCompaniesAdmin, getCompanyProfile, updateCompanyProfile } from "../controllers/admin.controller";
import { requireAuth, requireRole } from "../middleware/auth.middleware";

const router = Router();
router.use(requireAuth,requireRole("ADMIN"))

// Protect this route: must be logged in, and role must match 'ADMIN'
//Testing using the adminCreateCompany,the main utility is the adminCreateCompanyFromRegistry
router.post("/companies/onboard", adminCreateCompany);
router.get("/companies", getAllCompaniesAdmin);
router.route('/companies/:userId').get(getCompanyProfile).put(updateCompanyProfile).delete(deleteCompanyProfile)
router.get("/stats", getAdminStats);
router.put("/companies/:id", adminUpdateCompany);

export default router;