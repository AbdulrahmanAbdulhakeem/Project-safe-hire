import { Request, Response, NextFunction } from "express";
import axios from "axios";
import { prisma } from "../lib/prisma.js";

export const verifyCompanyPublic = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const cacRc = req.params.cacRc as string;
    const { source, companyType } = req.query; // Dojah lookup requires a company type (defaults to 'COMPANY')

    if (!cacRc) {
      return res.status(400).json({ error: "CAC RC Number is required for validation." });
    }

    // Clean formatting variations (e.g., "RC 123456" -> "RC123456")
    const sanitizedRc = cacRc.replace(/\s+/g, "").toUpperCase();
    const querySource = source === "WHATSAPP" ? "WHATSAPP" : "WEB";
    const selectedType = (companyType as string) || "COMPANY";

    // 1. First check if they already exist in the internal Safe-Hire database
    const localCompany = await prisma.company.findUnique({
      where: { cacRc: sanitizedRc },
      include: {
        jobs: {
          where: { isActive: true },
          select: {
            id: true,
            title: true,
            description: true,
            location: true,
            interviewAddress: true,
            salary: true,
            createdAt: true
          }
        }
      }
    });

    // Case A: The company exists internally on your platform
    if (localCompany) {
      // Async write to audit verification trail logs
      await prisma.verificationLog.create({
        data: {
          cacRcNumber: sanitizedRc,
          queriedBy: querySource,
          companyId: localCompany.id,
          rawResponse: { source: "LOCAL_DATABASE", status: localCompany.status }
        }
      });

      return res.status(200).json({
        isRegisteredOnSafeHire: true,
        isVerifiedRegistry: localCompany.isVerified,
        status: localCompany.status,
        company: {
          name: localCompany.name,
          cacRc: localCompany.cacRc,
          address: localCompany.address,
          verificationDate: localCompany.verificationDate,
          activeJobsCount: localCompany.jobs.length,
          jobs: localCompany.jobs
        }
      });
    }

    // Case B: Company not found internally. Fallback to real-time Dojah verification layer
    let dojahEntity = null;
    try {
      const response = await axios.get("https://api.dojah.io/api/v1/kyc/cac", {
        params: {
          rc_number: sanitizedRc,
          company_type: selectedType.toUpperCase(),
        },
        headers: {
          Authorization: process.env.DOJAH_SECRET_KEY,
          "AppId": process.env.DOJAH_APP_ID,
        },
      });

      dojahEntity = response.data?.entity;
    } catch (apiError: any) {
      console.error("Public Verification Dojah Error:", apiError?.response?.data || apiError.message);
      // We don't crash here; we proceed to log it as an unverified/failed check
    }

    // Write an audit log entry documenting the external verification effort
    await prisma.verificationLog.create({
      data: {
        cacRcNumber: sanitizedRc,
        queriedBy: querySource,
        companyId: null,
        rawResponse: dojahEntity || { error: "Failed or empty registry response" }
      }
    });

    // If Dojah also yields nothing, this is highly likely an illegitimate scam setup
    if (!dojahEntity || !dojahEntity.company_name) {
      return res.status(404).json({
        isRegisteredOnSafeHire: false,
        isVerifiedRegistry: false,
        message: "No matching record discovered in the national corporate registry. Extreme caution is advised."
      });
    }

    // Return the verified live registry details back to the user/WhatsApp interface
    return res.status(200).json({
      isRegisteredOnSafeHire: false,
      isVerifiedRegistry: true, // Confirmed existing by official registry
      status: "UNBOARDED_BY_ADMIN", 
      message: "Company is registered on the corporate registry but has not claimed its Safe-Hire profile yet.",
      company: {
        name: dojahEntity.company_name,
        cacRc: sanitizedRc,
        address: dojahEntity.address || "Address not provided in registry public records",
        registrationDate: dojahEntity.date_of_registration || null,
        activeJobsCount: 0,
        jobs: []
      }
    });

  } catch (error) {
    next(error);
  }
};

//Get all jobs
export const getAllJobs = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Fetch only active job listings to maintain system integrity
    const jobs = await prisma.job.findMany({
      where: {
        isActive: true,
      },
      select: {
        id: true,
        title: true,
        description: true,
        location: true,
        interviewAddress: true,
        salary: true,
        createdAt: true,
        // Include verified corporate data so job seekers know who posted it
        company: {
          select: {
            name: true,
            cacRc: true,
            isVerified: true,
          },
        },
        // Aggregate report counts dynamically to catch active scam trends
        _count: {
          select: { reports: true },
        },
      },
      orderBy: {
        createdAt: "desc", // Keep freshest job details at the top
      },
    });

    return res.status(200).json({
      message: "Active verified job invitations successfully retrieved.",
      count: jobs.length,
      jobs,
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * @route   GET /api/public/companies/:id
 * @desc    Fetch public-facing corporate data and active job positions by ID
 * @access  Public
 */
export const getCompanyByIdPublic = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;

    const company = await prisma.company.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        cacRc: true,
        address: true,
        isVerified: true,
        status: true,
        verificationDate: true,
        createdAt: true,
        // Only fetch active job opportunities for public transparency
        jobs: {
          where: { isActive: true },
          select: {
            id: true,
            title: true,
            description: true,
            location: true,
            interviewAddress: true,
            salary: true,
            createdAt: true,
          },
        },
      },
    });

    if (!company) {
      return res.status(404).json({ error: "No registered corporate entity matches this identifier." });
    }

    return res.status(200).json({
      message: "Corporate public profile compiled successfully.",
      data: company,
    });
  } catch (error) {
    next(error);
  }
};

export const getRiskHeatmapData = async (req: Request, res: Response) => {
  try {
    const jobs = await prisma.job.findMany({
      where: { isActive: true },
      select: {
        id: true,
        title: true,
        location: true,
        interviewAddress: true,
        latitude: true,
        longitude: true,
        company: {
          select: { name: true, isVerified: true }
        },
        _count: {
          select: { reports: true }
        }
      }
    });

    // Calculate simple risk score
    const heatmapData = jobs
      .filter(job => job.latitude && job.longitude)
      .map(job => ({
        lat: job.latitude,
        lng: job.longitude,
        intensity: Math.min(100, (job._count.reports * 25) + (job.company.isVerified ? 0 : 30)), 
        jobId: job.id,
        title: job.title,
        company: job.company.name,
        reportCount: job._count.reports,
        verified: job.company.isVerified
      }));

    res.json({
      success: true,
      data: heatmapData,
      totalPoints: heatmapData.length
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch heatmap data" });
  }
};