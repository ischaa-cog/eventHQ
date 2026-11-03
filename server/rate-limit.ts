// Attempt counters stored in Postgres, so every Vercel instance enforces the same limit.
// Each call counts one attempt; the window restarts once it has passed.
import { sql } from "drizzle-orm";
import { loginAttempts } from "@shared/schema";
import { db } from "./storage";

export async function countAttempt(key: string, windowMs: number): Promise<number> {
  const windowSql = sql`now() + make_interval(secs => ${windowMs / 1000})`;
  const [row] = await db.insert(loginAttempts)
    .values({ key, count: 1, resetAt: sql`${windowSql}` as any })
    .onConflictDoUpdate({
      target: loginAttempts.key,
      set: {
        count: sql`case when ${loginAttempts.resetAt} <= now() then 1 else ${loginAttempts.count} + 1 end`,
        resetAt: sql`case when ${loginAttempts.resetAt} <= now() then ${windowSql} else ${loginAttempts.resetAt} end`,
      },
    })
    .returning({ count: loginAttempts.count });
  // Old counters are only clutter; sweep them now and then.
  if (Math.random() < 0.02) {
    await db.delete(loginAttempts).where(sql`${loginAttempts.resetAt} < now() - interval '1 day'`).catch(() => undefined);
  }
  return row.count;
}

export async function clearAttempts(...keys: string[]): Promise<void> {
  if (!keys.length) return;
  await db.delete(loginAttempts).where(sql`${loginAttempts.key} in (${sql.join(keys.map((k) => sql`${k}`), sql`, `)})`);
}
