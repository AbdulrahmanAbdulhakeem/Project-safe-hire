import { Request, Response } from "express";
import twilio from "twilio";
import axios from "axios";
import { prisma } from "../lib/prisma.js";

const { MessagingResponse } = twilio.twiml;

function reply(res: Response, message: string) {
  const twiml = new MessagingResponse();
  twiml.message(message.slice(0, 1500)); // WhatsApp practical limit
  res.type("text/xml").status(200).send(twiml.toString());
}

function normalizeBody(body: string) {
  return (body || "").trim();
}

function extractCacRc(text: string): string | null {
  const cleaned = text.replace(/\s+/g, "").toUpperCase();
  // VERIFY RC123456 or RC123456 or 123456
  const withPrefix = cleaned.match(/(?:VERIFY)?(RC?\d{5,})/);
  if (withPrefix) {
    let rc = withPrefix[1];
    if (!rc.startsWith("RC")) rc = `RC${rc.replace(/^RC?/, "")}`;
    return rc;
  }
  return null;
}

async function handleVerify(cacRc: string): Promise<string> {
  const sanitizedRc = cacRc.replace(/\s+/g, "").toUpperCase();

  const localCompany = await prisma.company.findUnique({
    where: { cacRc: sanitizedRc },
    include: {
      jobs: {
        where: { isActive: true },
        select: { title: true, location: true, salary: true },
        take: 5,
      },
    },
  });

  if (localCompany) {
    await prisma.verificationLog.create({
      data: {
        cacRcNumber: sanitizedRc,
        queriedBy: "WHATSAPP",
        companyId: localCompany.id,
        rawResponse: { source: "LOCAL_DATABASE", status: localCompany.status },
      },
    });

    const jobsList =
      localCompany.jobs.length > 0
        ? localCompany.jobs
            .map((j, i) => `${i + 1}. ${j.title} — ${j.location}${j.salary ? ` (${j.salary})` : ""}`)
            .join("\n")
        : "No active jobs listed.";

    const badge =
      localCompany.status === "APPROVED" && localCompany.isVerified
        ? "✅ VERIFIED on SafeHire"
        : localCompany.status === "PENDING"
          ? "⏳ PENDING review on SafeHire"
          : "⚠️ Not fully verified";

    return (
      `*SafeHire Verification*\n\n` +
      `Company: *${localCompany.name}*\n` +
      `CAC RC: ${localCompany.cacRc}\n` +
      `Status: ${badge}\n` +
      (localCompany.address ? `Address: ${localCompany.address}\n` : "") +
      `\nActive jobs (${localCompany.jobs.length}):\n${jobsList}\n\n` +
      `Reply *menu* for more options.`
    );
  }

  // Fallback: Dojah
  try {
    const response = await axios.get("https://api.dojah.io/api/v1/kyc/cac", {
      params: { rc_number: sanitizedRc.replace(/^RC/, ""), company_type: "COMPANY" },
      headers: {
        Authorization: process.env.DOJAH_SECRET_KEY || "",
        AppId: process.env.DOJAH_APP_ID || "",
      },
      timeout: 15000,
    });

    const data = response.data?.entity || response.data;
    const name = data?.company_name || data?.name;

    await prisma.verificationLog.create({
      data: {
        cacRcNumber: sanitizedRc,
        queriedBy: "WHATSAPP",
        rawResponse: data || response.data,
      },
    });

    if (!name) {
      return (
        `*SafeHire Verification*\n\n` +
        `No company found for *${sanitizedRc}* on SafeHire or CAC registry.\n\n` +
        `Be careful — this may be a fake listing.\nReply *menu* for options.`
      );
    }

    return (
      `*SafeHire Verification*\n\n` +
      `Found on CAC registry (not yet onboarded on SafeHire):\n` +
      `Name: *${name}*\n` +
      `RC: ${sanitizedRc}\n` +
      (data?.address ? `Address: ${data.address}\n` : "") +
      `\n⚠️ Not registered/verified on SafeHire yet.\n` +
      `Reply *menu* for options.`
    );
  } catch {
    return (
      `Could not verify *${sanitizedRc}* right now (registry lookup failed).\n` +
      `Try again later or reply *menu*.`
    );
  }
}

async function handleJobs(): Promise<string> {
  const jobs = await prisma.job.findMany({
    where: { isActive: true },
    select: {
      title: true,
      location: true,
      salary: true,
      company: { select: { name: true, isVerified: true, cacRc: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  if (jobs.length === 0) {
    return "No active jobs on SafeHire right now.\nReply *menu* for options.";
  }

  const lines = jobs.map((j, i) => {
    const v = j.company.isVerified ? "✅" : "⚠️";
    return (
      `${i + 1}. *${j.title}*\n` +
      `   ${v} ${j.company.name} (${j.company.cacRc})\n` +
      `   📍 ${j.location}${j.salary ? ` · ${j.salary}` : ""}`
    );
  });

  return (
    `*Active jobs on SafeHire* (showing ${jobs.length})\n\n` +
    lines.join("\n\n") +
    `\n\nReply *verify RC...* to check a company.\n*menu* for options.`
  );
}

async function handleCompany(id: string): Promise<string> {
  const company = await prisma.company.findUnique({
    where: { id },
    select: {
      name: true,
      cacRc: true,
      address: true,
      isVerified: true,
      status: true,
      jobs: {
        where: { isActive: true },
        select: { title: true, location: true, salary: true },
        take: 5,
      },
    },
  });

  if (!company) {
    return `No company found for that ID.\nReply *menu* for options.`;
  }

  const badge = company.isVerified && company.status === "APPROVED" ? "✅ Verified" : `Status: ${company.status}`;
  const jobs =
    company.jobs.length > 0
      ? company.jobs.map((j, i) => `${i + 1}. ${j.title} — ${j.location}`).join("\n")
      : "No active jobs.";

  return (
    `*${company.name}*\n` +
    `RC: ${company.cacRc}\n` +
    `${badge}\n` +
    (company.address ? `Address: ${company.address}\n` : "") +
    `\nJobs:\n${jobs}\n\n*menu* for options.`
  );
}

async function handleRisk(): Promise<string> {
  const jobs = await prisma.job.findMany({
    where: { isActive: true },
    select: {
      location: true,
      reports: { select: { id: true } },
      company: { select: { isVerified: true } },
    },
  });

  const regions: Record<string, { jobs: number; reports: number; verified: number }> = {
    Lagos: { jobs: 0, reports: 0, verified: 0 },
    Abuja: { jobs: 0, reports: 0, verified: 0 },
    Kano: { jobs: 0, reports: 0, verified: 0 },
    "Port Harcourt": { jobs: 0, reports: 0, verified: 0 },
    Other: { jobs: 0, reports: 0, verified: 0 },
  };

  for (const job of jobs) {
    const loc = job.location.toLowerCase();
    let key = "Other";
    if (loc.includes("lagos")) key = "Lagos";
    else if (loc.includes("abuja")) key = "Abuja";
    else if (loc.includes("kano")) key = "Kano";
    else if (loc.includes("port")) key = "Port Harcourt";

    regions[key].jobs++;
    regions[key].reports += job.reports.length;
    if (job.company.isVerified) regions[key].verified++;
  }

  const lines = Object.entries(regions).map(([name, d]) => {
    const risk =
      d.jobs > 0
        ? Math.min(100, (d.reports / d.jobs) * 40 + (d.verified / d.jobs < 0.7 ? 40 : 0))
        : 20;
    const level = risk >= 60 ? "🔴 High" : risk >= 35 ? "🟡 Medium" : "🟢 Low";
    return (
      `*${name}* — ${level} (${Math.round(risk)})\n` +
      `  Jobs: ${d.jobs} · Reports: ${d.reports} · Verified rate: ${
        d.jobs ? Math.round((d.verified / d.jobs) * 100) : 0
      }%`
    );
  });

  return (
    `*SafeHire Risk overview*\n\n` +
    lines.join("\n\n") +
    `\n\nReply *menu* for options.`
  );
}

const MENU =
  `*SafeHire WhatsApp* 🛡️\n\n` +
  `Verify companies & check job risk.\n\n` +
  `*Commands:*\n` +
  `• *verify RC123456* — check a CAC RC\n` +
  `• *jobs* — list active jobs\n` +
  `• *company <id>* — company details\n` +
  `• *risk* — regional risk summary\n` +
  `• *menu* — show this help\n\n` +
  `Example: verify RC123456`;

export const whatsappWebhook = async (req: Request, res: Response) => {
  try {
    const body = normalizeBody(String(req.body.Body || req.body.body || ""));
    const lower = body.toLowerCase();

    if (!body || ["hi", "hello", "hey", "help", "menu", "start"].includes(lower)) {
      return reply(res, MENU);
    }

    if (lower === "jobs" || lower === "job") {
      return reply(res, await handleJobs());
    }

    if (lower === "risk" || lower === "heatmap") {
      return reply(res, await handleRisk());
    }

    if (lower.startsWith("company ")) {
      const id = body.slice(8).trim();
      if (!id) return reply(res, "Usage: *company <id>*\nReply *menu* for options.");
      return reply(res, await handleCompany(id));
    }

    const rc = extractCacRc(body);
    if (rc || lower.startsWith("verify")) {
      if (!rc) {
        return reply(res, "Send a valid RC number.\nExample: *verify RC123456*");
      }
      return reply(res, await handleVerify(rc));
    }

    return reply(
      res,
      `I didn't understand that.\n\n${MENU}`
    );
  } catch (err) {
    console.error("WhatsApp webhook error:", err);
    return reply(res, "Something went wrong. Please try again or reply *menu*.");
  }
};