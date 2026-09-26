// One-time, idempotent: adds "people at pitch" to Event Tracker events.
// Run: npx tsx --env-file=.env script/migrate-people-at-pitch.ts
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query(
    "ALTER TABLE event_performance ADD COLUMN IF NOT EXISTS people_at_pitch integer NOT NULL DEFAULT 0",
  );
  console.log("event_performance.people_at_pitch ready.");
} finally {
  await client.end();
}
