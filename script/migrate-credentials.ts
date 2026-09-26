// One-time, idempotent: creates user_credentials and copies the existing demo passwords into it.
// Run: npx tsx --env-file=.env script/migrate-credentials.ts
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(`
    CREATE TABLE IF NOT EXISTS user_credentials (
      user_id varchar PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      password_hash text NOT NULL,
      updated_at timestamp NOT NULL DEFAULT now()
    )`);
  const copied = await client.query(`
    INSERT INTO user_credentials (user_id, password_hash)
    SELECT user_id, password_hash FROM demo_credentials
    ON CONFLICT (user_id) DO NOTHING`);
  await client.query("COMMIT");
  console.log(`user_credentials ready; copied ${copied.rowCount} demo password(s).`);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}
