import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  outDir: "dist",
  target: "node20",
  clean: true,
  // DO NOT bundle any npm packages; keep everything in native node_modules
  bundle: true,
  skipNodeModulesBundle: true,
  // Specifically prevent Prisma from being bundled into dist/index.js
  noExternal: [],
  external: [
    "@prisma/client",
    "@prisma/adapter-pg",
    "express",
    "better-auth",
    "pg",
    "nodemailer",
  ],
});