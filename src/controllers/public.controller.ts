import { Request, Response, NextFunction } from "express";
import axios from "axios";
import { prisma } from "../lib/prisma.js";
import nodemailer from "nodemailer"

export const verifyCompanyPublic = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const cacRc = req.params.cacRc as string;
    const { source, companyType } = req.query; // Dojah lookup requires a company type (defaults to 'COMPANY')

    if (!cacRc) {
      return res
        .status(400)
        .json({ error: "CAC RC Number is required for validation." });
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
            createdAt: true,
          },
        },
      },
    });

    // Case A: The company exists internally on your platform
    if (localCompany) {
      // Async write to audit verification trail logs
      await prisma.verificationLog.create({
        data: {
          cacRcNumber: sanitizedRc,
          queriedBy: querySource,
          companyId: localCompany.id,
          rawResponse: {
            source: "LOCAL_DATABASE",
            status: localCompany.status,
          },
        },
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
          jobs: localCompany.jobs,
        },
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
          AppId: process.env.DOJAH_APP_ID,
        },
      });

      dojahEntity = response.data?.entity;
    } catch (apiError: any) {
      console.error(
        "Public Verification Dojah Error:",
        apiError?.response?.data || apiError.message,
      );
      // We don't crash here; we proceed to log it as an unverified/failed check
    }

    // Write an audit log entry documenting the external verification effort
    await prisma.verificationLog.create({
      data: {
        cacRcNumber: sanitizedRc,
        queriedBy: querySource,
        companyId: null,
        rawResponse: dojahEntity || {
          error: "Failed or empty registry response",
        },
      },
    });

    // If Dojah also yields nothing, this is highly likely an illegitimate scam setup
    if (!dojahEntity || !dojahEntity.company_name) {
      return res.status(404).json({
        isRegisteredOnSafeHire: false,
        isVerifiedRegistry: false,
        message:
          "No matching record discovered in the national corporate registry. Extreme caution is advised.",
      });
    }

    // Return the verified live registry details back to the user/WhatsApp interface
    return res.status(200).json({
      isRegisteredOnSafeHire: false,
      isVerifiedRegistry: true, // Confirmed existing by official registry
      status: "UNBOARDED_BY_ADMIN",
      message:
        "Company is registered on the corporate registry but has not claimed its Safe-Hire profile yet.",
      company: {
        name: dojahEntity.company_name,
        cacRc: sanitizedRc,
        address:
          dojahEntity.address ||
          "Address not provided in registry public records",
        registrationDate: dojahEntity.date_of_registration || null,
        activeJobsCount: 0,
        jobs: [],
      },
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
        // Include detailed verified corporate data so job seekers have full context
        company: {
          select: {
            id: true,
            name: true,
            cacRc: true,
            address: true,
            isVerified: true,
            status: true,
            verificationDate: true,
            createdAt: true,
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
export const getCompanyByIdPublic = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
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
    console.log(company);

    if (!company) {
      return res
        .status(404)
        .json({
          error: "No registered corporate entity matches this identifier.",
        });
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
    // Group by approximate region (you can improve this with real geo data later)
    const jobs = await prisma.job.findMany({
      where: { isActive: true },
      include: {
        company: true,
        reports: true,
      },
    });

    // Simple region bucketing (expand this later)
    const regions = {
      "Lagos": { lat: 6.5244, lng: 3.3792, jobs: 0, reports: 0, verified: 0 },
      "Abuja": { lat: 9.0765, lng: 7.3986, jobs: 0, reports: 0, verified: 0 },
      "Kano": { lat: 12.0022, lng: 8.5919, jobs: 0, reports: 0, verified: 0 },
      "Port Harcourt": { lat: 4.8156, lng: 7.0493, jobs: 0, reports: 0, verified: 0 },
      "Other": { lat: 8.0, lng: 7.5, jobs: 0, reports: 0, verified: 0 },
    };

    jobs.forEach(job => {
      let regionKey = "Other";
      if (job.location.toLowerCase().includes("lagos")) regionKey = "Lagos";
      else if (job.location.toLowerCase().includes("abuja")) regionKey = "Abuja";
      else if (job.location.toLowerCase().includes("kano")) regionKey = "Kano";
      else if (job.location.toLowerCase().includes("port")) regionKey = "Port Harcourt";

      const r = regions[regionKey as keyof typeof regions];
      r.jobs++;
      r.reports += job.reports.length;
      if (job.company.isVerified) r.verified++;
    });

    const heatmapData = Object.entries(regions).map(([name, data]) => {
      const risk = data.jobs > 0 
        ? Math.min(100, (data.reports / data.jobs) * 40 + (data.verified / data.jobs < 0.7 ? 40 : 0))
        : 20;

      return {
        lat: data.lat,
        lng: data.lng,
        intensity: Math.round(risk),
        name,
        totalJobs: data.jobs,
        totalReports: data.reports,
        verificationRate: data.jobs > 0 ? Math.round((data.verified / data.jobs) * 100) : 0,
      };
    });

    res.json({
      success: true,
      data: heatmapData,
      totalRegions: heatmapData.length,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to generate risk heatmap" });
  }
};


/**
 * @route   POST /api/public/contact
 * @desc    Handles inbound verification inquiries and forwards them to Admin Gmail
 * @access  Public
 */
export const sendMail = async (req: Request, res: Response, next: NextFunction) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: "All fields are required." });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"${name}" <${process.env.SMTP_USER}>`,
      to: process.env.SMTP_USER,
      replyTo: email,
      subject: `[SafeHire Contact] ${subject}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <hr>
        <p>${message}</p>
      `,
    });

    res.status(200).json({ message: "Message sent successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to send email" });
  }
};