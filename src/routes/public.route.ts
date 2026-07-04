import { Router } from "express";
import { getAllJobs, getRiskHeatmapData, verifyCompanyPublic } from "../controllers/public.controller";

const router = Router();

// Public route open to web search field inputs and incoming WhatsApp bot requests
router.get("/companies/verify/:cacRc", verifyCompanyPublic);
router.get("/",getAllJobs)
router.get("/heatmap",getRiskHeatmapData)

export default router;
