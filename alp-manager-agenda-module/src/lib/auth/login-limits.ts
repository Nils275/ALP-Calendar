import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;

function hashKey(scope: "email" | "ip", value: string): string {
  return createHash("sha256")
    .update(`alp-auth:${scope}:${value}`)
    .digest("hex");
}

function getKeys(email: string, ip: string | null): string[] {
  const keys = [hashKey("email", email.trim().toLowerCase())];

  if (ip && ip !== "unknown") {
    keys.push(hashKey("ip", ip));
  }

  return keys;
}

export async function isLoginBlocked(
  email: string,
  ip: string | null,
): Promise<boolean> {
  const keys = getKeys(email, ip);
  const now = new Date();

  const result = await db.execute(sql`
    SELECT 1
    FROM auth_login_limits
    WHERE key_hash IN (${sql.join(keys.map((key) => sql`${key}`), sql`, `)})
      AND locked_until > ${now}
    LIMIT 1
  `);

  return result.rows.length > 0;
}

export async function recordLoginFailure(
  email: string,
  ip: string | null,
): Promise<void> {
  const keys = getKeys(email, ip);
  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_MS);

  for (const key of keys) {
    await db.execute(sql`
      INSERT INTO auth_login_limits (
        key_hash,
        window_started_at,
        attempts,
        locked_until,
        updated_at
      )
      VALUES (
        ${key},
        ${now},
        1,
        NULL,
        ${now}
      )
      ON CONFLICT (key_hash)
      DO UPDATE SET
        window_started_at = CASE
          WHEN auth_login_limits.window_started_at < ${windowStart}
          THEN ${now}
          ELSE auth_login_limits.window_started_at
        END,
        attempts = CASE
          WHEN auth_login_limits.window_started_at < ${windowStart}
          THEN 1
          ELSE auth_login_limits.attempts + 1
        END,
        locked_until = CASE
          WHEN auth_login_limits.window_started_at < ${windowStart}
          THEN NULL
          WHEN auth_login_limits.attempts + 1 >= ${MAX_ATTEMPTS}
          THEN ${new Date(now.getTime() + LOCK_MS)}
          ELSE auth_login_limits.locked_until
        END,
        updated_at = ${now}
    `);
  }
}

export async function clearLoginFailures(
  email: string,
  ip: string | null,
): Promise<void> {
  const keys = getKeys(email, ip);

  await db.execute(sql`
    DELETE FROM auth_login_limits
    WHERE key_hash IN (${sql.join(keys.map((key) => sql`${key}`), sql`, `)})
  `);
}
