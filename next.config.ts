import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep native / Prisma packages out of the bundler so better-sqlite3's
  // native addon loads correctly at runtime.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-better-sqlite3", "better-sqlite3"],
};

export default nextConfig;
