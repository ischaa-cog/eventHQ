// Applies pending SQL migrations from ./migrations (generated with `npm run db:generate`).
// Run locally:  npm run db:migrate          (uses DATABASE_URL from .env)
// On Vercel it runs inside `npm run vercel-build` for production deploys only, so merging to main
// updates the database before the new code goes live. A failed migration fails the build, and the
// previous deployment keeps serving.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

export async function runMigrations(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is not set; cannot run migrations.");
  const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 15_000 });
  try {
    const client = await pool.connect();
    try {
      // Two deploys at once must not migrate concurrently.
      await client.query("SELECT pg_advisory_lock(727274101)");
      await migrate(drizzle(client), { migrationsFolder: "migrations" });
      console.log("[migrate] database is up to date");
    } finally {
      await client.query("SELECT pg_advisory_unlock(727274101)").catch(() => {});
      client.release();
    }
  } finally {
    await pool.end();
  }
}

const isEntry = process.argv[1]?.endsWith("migrate.ts");
if (isEntry) {
  runMigrations().then(() => process.exit(0), (err) => {
    console.error("[migrate] failed:", err);
    process.exit(1);
  });
}
