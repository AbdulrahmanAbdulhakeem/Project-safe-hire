import { Router } from "express";
import {
  createJob,
  getMyCompanyJobs,
  updateJob,
  deleteJob,
  getMyCompanyProfile,
} from "../controllers/job.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

const router = Router();

// All resource variants here strictly require full Company Authentication privileges
router.use(requireAuth, requireRole("COMPANY"));

router.post("/", createJob);
router.get("/myjobs", getMyCompanyJobs);
router.put("/:jobId", updateJob);
router.delete("/:jobId", deleteJob);
router.get("/:companyId", getMyCompanyProfile);

export default router;
