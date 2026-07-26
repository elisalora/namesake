// Same reason as prisma.config.ts, which already does this: the guard below
// reads DATABASE_URL itself, before Prisma gets a chance to load .env, so
// without this `npm run build` fails locally on a variable that is in fact set.
// On Vercel there's no .env and the real values come from the environment.
import "dotenv/config";
import { execFileSync } from "node:child_process";

// Apply migrations before the build.
//
// Pooled Postgres connections (Neon's pooler, PgBouncer in transaction mode)
// don't reliably support the session-level advisory locks Prisma Migrate uses.
// The app wants the pooled endpoint — serverless opens a lot of connections —
// but migrations want a direct one, so they're allowed to differ.
//
// Set MIGRATE_DATABASE_URL to the direct connection string. Without it we fall
// back to DATABASE_URL, which is correct for any database that isn't behind a
// transaction-mode pooler.
const url = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL;

if (!url) {
  console.error(
    "\n  No DATABASE_URL — cannot apply migrations.\n" +
      "  Set it in your environment (in Vercel: Settings → Environment Variables).\n",
  );
  process.exit(1);
}

if (process.env.MIGRATE_DATABASE_URL) {
  console.log("Applying migrations over the direct connection.");
}

execFileSync("npx", ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
});
