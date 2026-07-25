import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 requires a driver adapter at runtime.
//
// Postgres rather than SQLite because this deploys serverless, where the
// filesystem is ephemeral — a SQLite file would be discarded on every deploy
// and every cold start, taking every journey with it.
const connectionString = process.env.DATABASE_URL;

function makeClient() {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — the app can't reach its database.");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

// Reuse the client across hot reloads in dev, and across warm invocations in
// serverless — a fresh pool per request would exhaust Postgres connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
