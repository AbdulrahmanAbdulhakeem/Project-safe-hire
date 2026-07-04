import { Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";

//Get Companies profile
export const getMyCompanyProfile = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const companyId = req.params.companyId as string;

    // Fetch the freshest profile state directly from the database
    const companyProfile = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        // Include their user account context (e.g., to show their login email)
        user: {
          select: {
            email: true,
            createdAt: true,
          }
        },
        // Include a count summary of their jobs and reports for a quick dashboard overview
        _count: {
          select: {
            jobs: true,
            verificationLogs: true,
          }
        }
      }
    });

    if (!companyProfile) {
      return res.status(404).json({ error: "Company profile record could not be found." });
    }

    return res.status(200).json({
      message: "Company profile retrieved successfully.",
      data: companyProfile
    });

  } catch (error) {
    next(error);
  }
};

// Helper to check if the current user owns an approved company profile
const getApprovedCompanyOrThrow = async (userId: string) => {
  const company = await prisma.company.findUnique({
    where: { userId },
  });

  if (!company) {
    throw {
      status: 404,
      message: "No company profile found associated with this account.",
    };
  }
  if (!company.isVerified || company.status !== "APPROVED") {
    throw {
      status: 403,
      message:
        "Access Denied. Your company status is currently pending or restricted.",
    };
  }
  return company;
};


// CREATE JOB
export const createJob = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const company = await getApprovedCompanyOrThrow(req.user!.id);
    const { title, description, location, interviewAddress, salary } = req.body;

    if (!title || !description || !location || !interviewAddress) {
      return res.status(400).json({ error: "Missing required job fields." });
    }

    const job = await prisma.job.create({
      data: {
        companyId: company.id,
        title,
        description,
        location,
        interviewAddress,
        salary,
      },
    });

    return res.status(201).json({ message: "Job posted successfully.", job });
  } catch (error: any) {
    if (error.status)
      return res.status(error.status).json({ error: error.message });
    next(error);
  }
};

// READ COMPANY'S OWN JOBS (For Dashboard List View)
export const getMyCompanyJobs = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const company = await getApprovedCompanyOrThrow(req.user!.id);

    const jobs = await prisma.job.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
    });

    return res.status(200).json({ jobs });
  } catch (error: any) {
    if (error.status)
      return res.status(error.status).json({ error: error.message });
    next(error);
  }
};

// UPDATE JOB
export const updateJob = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const company = await getApprovedCompanyOrThrow(req.user!.id);
    const jobId = req.params.jobId as string;
    const { title, description, location, interviewAddress, salary, isActive } =
      req.body;

    const targetJob = await prisma.job.findUnique({ where: { id: jobId } });

    if (!targetJob || targetJob.companyId !== company.id) {
      return res
        .status(404)
        .json({ error: "Job record not found or unauthorized access." });
    }

    const updatedJob = await prisma.job.update({
      where: { id: jobId },
      data: {
        title,
        description,
        location,
        interviewAddress,
        salary,
        isActive,
      },
    });

    return res
      .status(200)
      .json({ message: "Job layout updated successfully.", updatedJob });
  } catch (error: any) {
    if (error.status)
      return res.status(error.status).json({ error: error.message });
    next(error);
  }
};

// DELETE JOB
export const deleteJob = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const company = await getApprovedCompanyOrThrow(req.user!.id);
    const jobId = req.params.jobId as string;

    const targetJob = await prisma.job.findUnique({ where: { id: jobId } });

    if (!targetJob || targetJob.companyId !== company.id) {
      return res
        .status(404)
        .json({ error: "Job record not found or unauthorized access." });
    }

    await prisma.job.delete({ where: { id: jobId } });

    return res
      .status(200)
      .json({ message: "Job posting permanently deleted." });
  } catch (error: any) {
    if (error.status)
      return res.status(error.status).json({ error: error.message });
    next(error);
  }
};
