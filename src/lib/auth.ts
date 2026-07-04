import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";
import { bearer } from "better-auth/plugins";


export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true, // Enables standard credentials for Admins and Onboarded Companies
  },
//   baseURL: process.env.BETTER_AUTH_URL,
  advanced: {
    // Allows cookie transmissions across local dev environments safely
    disableOriginCheck: true, 
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "COMPANY",
      },
    },
  },
  plugins:[bearer()]
});