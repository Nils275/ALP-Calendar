import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { userSessions, users } from "@/db/schema";
import type { CalendarUser } from "@/lib/calendar/types";
import { toCalendarUser } from "./users";

export const SESSION_COOKIE_NAME = "alp_manager_session";

const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  };
}

export async function getCurrentUser(): Promise<CalendarUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;

  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return null;
  }

  const tokenHash = hashToken(token);
  const now = new Date();

  const [session] = await db
    .select({ user: users })
    .from(userSessions)
    .innerJoin(users, eq(userSessions.userId, users.id))
    .where(
      and(
        eq(userSessions.tokenHash, tokenHash),
        isNull(userSessions.revokedAt),
        gt(userSessions.expiresAt, now),
        eq(users.isActive, true),
      ),
    )
    .limit(1);

  if (!session) return null;

  return toCalendarUser(session.user);
}

export async function createSession(userId: string): Promise<boolean> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.isActive, true)))
    .limit(1);

  if (!user) return false;

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);

  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_SECONDS * 1000,
  );

  await db.insert(userSessions).values({
    userId,
    tokenHash,
    expiresAt,
  });

  const store = await cookies();

  store.set(SESSION_COOKIE_NAME, token, cookieOptions());

  return true;
}

export async function revokeCurrentSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;

  if (token && /^[A-Za-z0-9_-]{43}$/.test(token)) {
    await db
      .update(userSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(userSessions.tokenHash, hashToken(token)),
          isNull(userSessions.revokedAt),
        ),
      );
  }

  store.delete(SESSION_COOKIE_NAME);
}
