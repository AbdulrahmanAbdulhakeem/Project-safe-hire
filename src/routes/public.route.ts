import { Router } from "express";
import { getAllJobs, getCompanyByIdPublic, getRiskHeatmapData, sendMail, verifyCompanyPublic } from "../controllers/public.controller";

const router = Router();

// Public route open to web search field inputs and incoming WhatsApp bot requests
router.get("/companies/verify/:cacRc", verifyCompanyPublic);
router.get("/",getAllJobs)
router.get("/companies/:id", getCompanyByIdPublic);
router.get("/heatmap",getRiskHeatmapData)
router.post("/contact",sendMail)

export default router;
