import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Prisma and its driver out of the bundler so they resolve normally at
  // runtime rather than being traced into the serverless output.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
};

export default nextConfig;
