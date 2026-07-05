import { Request, Response, NextFunction } from "express";
import { auth } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import axios from "axios";

export const adminCreateCompany = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const { email, password, name, cacRc, address } = req.body;

  if (!email || !password || !name || !cacRc) {
    return res.status(400).json({
      error: "Missing required fields (email, password, name, cacRc).",
    });
  }

  try {
    // 1. Check if the RC number or email is already registered to avoid duplication conflict
    const existingCompany = await prisma.company.findUnique({
      where: { cacRc },
    });
    if (existingCompany) {
      return res
        .status(409)
        .json({ error: "A company with this CAC RC Number already exists." });
    }

    // 2. Use Better-Auth's API helper to securely create the system user account
    const newUser = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name,
      },
    });

    if (!newUser || !newUser.user) {
      return res
        .status(500)
        .json({ error: "Failed to initialize authentication credentials." });
    }

    // 3. Construct the linked company profile with pre-approved states
    //note:.replace(/\s+/g, "")
    // .replace() is a built-in tool used to find text and swap it with something else.
    // /\s+/g is a search pattern (called a Regular Expression or Regex):
    // \s means any whitespace character (spaces, tabs, or line breaks).
    // + means "one or more" spaces in a row.
    // g means "global" (find and change every space in the text, not just the first one).
    // "" is an empty string. Replacing spaces with an empty string effectively erases them.
    const newCompany = await prisma.company.create({
      data: {
        userId: newUser.user.id,
        cacRc: cacRc.replace(/\s+/g, "").toUpperCase(),
        name,
        address,
        isVerified: true,
        status: "APPROVED",
        verificationDate: new Date(),
      },
    });

    return res.status(201).json({
      message: "Company account successfully onboarded by Admin.",
      companyId: newCompany.id,
      userId: newUser.user.id,
      cacRc: newCompany.cacRc,
      user: newUser,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/admin/companies
 * @desc    Retrieve a comprehensive roster of all registered corporate entities
 * @access  Private (Admin Only)
 */
export const getAllCompaniesAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const companies = await prisma.company.findMany({
      include: {
        // Pull authentication identity credentials
        user: {
          select: {
            email: true,
            emailVerified: true,
          },
        },
        // Count relational metrics dynamically to gauge platform engagement
        _count: {
          select: {
            jobs: true, // How many job invites they have created
            verificationLogs: true, // System demand metrics / platform check traffic
          },
        },
      },
      orderBy: {
        createdAt: "desc", // Keep newly registered companies at the top of the queue
      },
    });

    return res.status(200).json({
      message: "Corporate registration inventory successfully compiled.",
      count: companies.length,
      data: companies,
    });
  } catch (error) {
    next(error);
  }
};

// export const adminCreateCompanyProfile = async (
//   req: Request,
//   res: Response,
//   next: NextFunction,
// ) => {
//   // 1. Accept cacRc, companyType, and registration authentication data
//   // We drop 'name' and 'address' from req.body since Dojah provides them deterministically.
//   const { email, password, cacRc, companyType } = req.body;

//   if (!email || !password || !cacRc || !companyType) {
//     return res.status(400).json({
//       error: "Missing required fields (email, password, cacRc, companyType).",
//     });
//   }

//   // Sanitize RC space patterns immediately
//   const sanitizedRc = cacRc.replace(/\s+/g, "").toUpperCase();

//   try {
//     // 2. Prevent duplication conflicts
//     const existingCompany = await prisma.company.findUnique({
//       where: { cacRc: sanitizedRc },
//     });
//     if (existingCompany) {
//       return res
//         .status(409)
//         .json({ error: "A company with this CAC RC Number already exists." });
//     }

//     // 3. Make real-time investigative call to Dojah's CAC lookup endpoint
//     let dojahData;
//     try {
//       const response = await axios.get("https://api.dojah.io/api/v1/kyc/cac", {
//         params: {
//           rc_number: sanitizedRc,
//           company_type: companyType, // Expected values: 'COMPANY', 'BUSINESS_NAME', etc.
//         },
//         headers: {
//           Authorization: process.env.DOJAH_SECRET_KEY,
//           "AppId": process.env.DOJAH_APP_ID,
//         },
//       });

//       dojahData = response.data?.entity;
//     } catch (apiError: any) {
//       console.error("Dojah Verification Failure:", apiError?.response?.data || apiError.message);
//       return res.status(422).json({
//         error: "Failed to verify registration metrics via Dojah infrastructure.",
//         details: apiError?.response?.data?.error || "Invalid RC number or mismatching company type.",
//       });
//     }

//     if (!dojahData || !dojahData.company_name) {
//       return res.status(404).json({ error: "No matching corporate record discovered on the national registry." });
//     }

//     // Extract deterministic metadata straight from Dojah's official payload
//     const officialName = dojahData.company_name;
//     const officialAddress = dojahData.address || null;
//     const officialRegDate = dojahData.date_of_registration
//       ? new Date(dojahData.date_of_registration)
//       : null;

//     // 4. Instantiate Better-Auth user model mapping using the deterministic corporate name
//     const newUser = await auth.api.signUpEmail({
//       body: {
//         email,
//         password,
//         name: officialName,
//       },
//     });

//     if (!newUser || !newUser.user) {
//       return res
//         .status(500)
//         .json({ error: "Failed to initialize authentication credentials." });
//     }

//     // 5. Commit record to PostgreSQL while archiving the raw response into verification logs
//     const newCompany = await prisma.$transaction(async (tx) => {
//       const company = await tx.company.create({
//         data: {
//           userId: newUser.user.id,
//           cacRc: sanitizedRc,
//           name: officialName,
//           address: officialAddress,
//           registrationDate: officialRegDate,
//           isVerified: true,
//           status: "APPROVED",
//           verificationDate: new Date(),
//         },
//       });

//       await tx.verificationLog.create({
//         data: {
//           companyId: company.id,
//           cacRcNumber: sanitizedRc,
//           queriedBy: "WEB",
//           rawResponse: dojahData,
//         },
//       });

//       return company;
//     });

//     return res.status(201).json({
//       message: "Company account successfully onboarded using official registry credentials.",
//       companyId: newCompany.id,
//       userId: newUser.user.id,
//       registeredName: newCompany.name,
//       cacRc: newCompany.cacRc,
//     });
//   } catch (error) {
//     next(error);
//   }
// };

/**
 Dummy function
 * Creates a pre-approved company profile derived STRICTLY from Dojah's registry payload.
 * Email, password, and corporate name are automatically handled using default/deterministic variables.
 */
export const adminCreateCompanyFromRegistry = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // The request body now ONLY expects identity references required to run the lookup
  const { cacRc, companyType } = req.body;

  if (!cacRc || !companyType) {
    return res.status(400).json({
      error: "Missing parameters. Please provide 'cacRc' and 'companyType'.",
    });
  }

  // Enforce structural cleanup immediately
  const sanitizedRc = cacRc.replace(/\s+/g, "").toUpperCase();

  try {
    // 1. Pre-emptively verify database states to block redundant API requests
    const existingCompany = await prisma.company.findUnique({
      where: { cacRc: sanitizedRc },
    });
    if (existingCompany) {
      return res
        .status(409)
        .json({
          error: "A company matching this CAC RC Number is already registered.",
        });
    }

    // 2. Fetch official corporate data from Dojah's registry layer
    let dojahEntity;
    try {
      const response = await axios.get("https://api.dojah.io/api/v1/kyc/cac", {
        params: {
          rc_number: sanitizedRc,
          company_type: companyType.toUpperCase(), // e.g., 'COMPANY' or 'BUSINESS_NAME'
        },
        headers: {
          Authorization: process.env.DOJAH_SECRET_KEY,
          AppId: process.env.DOJAH_APP_ID,
        },
      });

      dojahEntity = response.data?.entity;
      console.log(response.data);
    } catch (apiError: any) {
      console.error(
        "Dojah Registry Communication Error:",
        apiError?.response?.data || apiError.message,
      );
      return res.status(422).json({
        error: "Failed to pull verifying metadata from the Dojah network.",
        details:
          apiError?.response?.data?.error ||
          "Invalid RC number or unmatching company type structural check.",
      });
    }

    if (!dojahEntity || !dojahEntity.company_name) {
      return res
        .status(404)
        .json({
          error: "No matching record found on the live corporate registry.",
        });
    }

    // 3. Extract deterministic values directly from the API response
    const officialCompanyName = dojahEntity.company_name;
    const officialAddress = dojahEntity.address || null;
    const officialRegDate = dojahEntity.date_of_registration
      ? new Date(dojahEntity.date_of_registration)
      : null;

    // 4. Generate Default Credentials for the account fallback
    // Converts "Dangote Holdings PLC" -> "dangoteholdingsplc_rc123456@safehire.local"
    const slugifiedName = officialCompanyName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const defaultEmail = `${slugifiedName}_${sanitizedRc.toLowerCase()}@safehire.local`;

    // Global fallback password for initial system onboarding testing
    const defaultPassword = "ChangeThisPassword123!";

    // 5. Initialize the User model within Better-Auth using default configurations
    const newUser = await auth.api.signUpEmail({
      body: {
        email: defaultEmail,
        password: defaultPassword,
        name: officialCompanyName,
      },
    });

    if (!newUser || !newUser.user) {
      return res
        .status(500)
        .json({
          error:
            "Failed to construct system authentication schema placeholders.",
        });
    }

    // 6. Atomically write the profile and save the audit proof in your logs
    const newCompany = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          userId: newUser.user.id,
          cacRc: sanitizedRc,
          name: officialCompanyName,
          address: officialAddress,
          registrationDate: officialRegDate,
          isVerified: true,
          status: "APPROVED",
          verificationDate: new Date(),
        },
      });

      await tx.verificationLog.create({
        data: {
          companyId: company.id,
          cacRcNumber: sanitizedRc,
          queriedBy: "WEB",
          rawResponse: dojahEntity,
        },
      });

      return company;
    });

    // 7. Hand back the successfully completed entity along with the default access keys
    return res.status(201).json({
      message:
        "Company profile cleanly constructed using official registry data.",
      companyId: newCompany.id,
      userId: newUser.user.id,
      credentialsPlaceholder: {
        generatedEmail: defaultEmail,
        temporaryPassword: defaultPassword,
        notice:
          "Corporate name and address data were locked strictly from official registry records.",
      },
      dataSummary: {
        name: newCompany.name,
        cacRc: newCompany.cacRc,
        address: newCompany.address,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getCompanyProfile = async (req: Request, res: Response) => {
  try {
    const id = req.params.userId as string;

    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        jobs: true,
        verificationLogs: true,
        _count: { select: { jobs: true } },
      },
    });

    if (!company) return res.status(404).json({ error: "Company not found" });

    res.json({ success: true, data: company });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch company profile" });
  }
};

export const updateCompanyProfile = async (req: Request, res: Response) => {
  try {
    const id  = req.params.userId as string;
    const { name, email, address, status } = req.body;

    const company = await prisma.company.update({
      where: { id },
      data: { name, email, address, status },
    });

    res.json({ success: true, data: company });
  } catch (error) {
    res.status(500).json({ error: "Failed to update company" });
  }
};

export const deleteCompanyProfile = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const id = req.params.userId as string;

  console.log(id);
  try {
    const deleted = await prisma.user.delete({
      where: { id },
    });
    res.json({
      message: `Company with ID ${id} and all active sessions deleted.`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PUT /api/admin/companies/:id
 * @desc    Comprehensively update a corporate entity and its matching user parameters
 * @access  Private (Admin Only)
 */
export const adminUpdateCompany = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id  = req.params.id as string;
    const { name, cacRc, address, status, isVerified } = req.body;

    // 1. Double check the core entity exists before applying transaction locks
    const targetCompany = await prisma.company.findUnique({
      where: { id },
    });

    if (!targetCompany) {
      return res.status(404).json({ error: "The targeted company record does not exist." });
    }

    // 2. Pre-process and sanitize strings if an RC number modification is requested
    let sanitizedRc: string | undefined;
    if (cacRc) {
      sanitizedRc = cacRc.replace(/\s+/g, "").toUpperCase();

      // Ensure the new RC doesn't collide with another existing company record
      const duplicateRc = await prisma.company.findFirst({
        where: {
          cacRc: sanitizedRc,
          NOT: { id },
        },
      });
      if (duplicateRc) {
        return res.status(409).json({ error: "Another corporate record is already utilizing this CAC RC details." });
      }
    }

    // 3. Atomically synchronize modifications across User and Company schemas
    const updatedCompany = await prisma.$transaction(async (tx) => {
      // If the administrative body changes the company name, update the corresponding User profile text
      if (name) {
        await tx.user.update({
          where: { id: targetCompany.userId },
          data: { name },
        });
      }

      // Compute dynamic fields based on verification switches
      let verificationDateUpdate = targetCompany.verificationDate;
      if (isVerified === true && !targetCompany.isVerified) {
        verificationDateUpdate = new Date();
      } else if (isVerified === false) {
        verificationDateUpdate = null;
      }

      // Commit the secondary adjustments to the core database node
      return await tx.company.update({
        where: { id },
        data: {
          name: name ?? undefined,
          cacRc: sanitizedRc ?? undefined,
          address: address !== undefined ? address : undefined,
          status: status ?? undefined,
          isVerified: isVerified !== undefined ? isVerified : undefined,
          verificationDate: verificationDateUpdate,
        },
        include: {
          user: {
            select: {
              email: true,
              name: true,
            },
          },
        },
      });
    });

    return res.status(200).json({
      message: "Corporate entity and associated user profiles updated successfully.",
      data: updatedCompany,
    });
  } catch (error) {
    next(error);
  }
};


export const getAdminStats = async (req: Request, res: Response) => {
  try {
    const totalCompanies = await prisma.company.count();
    const totalJobs = await prisma.job.count();
    const totalAdmins = await prisma.user.count({
      where: { role: 'ADMIN' }
    });

    const pendingCompanies = await prisma.company.count({
      where: { status: 'PENDING' }
    });

    res.json({
      success: true,
      data: {
        totalCompanies,
        totalJobs,
        totalAdmins,
        pendingCompanies,
      }
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
};