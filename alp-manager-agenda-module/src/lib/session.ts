import { cookies } from "next/headers";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { users, type UserRow } from "@/db/schema";
import { ensureAgendaSeed } from "@/db/seed";
import type { AgendaUser } from "@/lib/agenda-types";

export const SESSION_COOKIE = "alp_user_id";

export function serializeUser(user: UserRow | null | undefined): AgendaUser | null {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    initials: user.initials,
    role: user.role,
    jobTitle: user.jobTitle,
    color: user.color,
  };
}

/** Collaborateur courant (session légère, réutilise la table users). */
export async function getCurrentUser(): Promise<AgendaUser> {
  await ensureAgendaSeed();
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  const candidate = raw ? Number.parseInt(raw, 10) : Number.NaN;

  if (Number.isFinite(candidate)) {
    const [found] = await db
      .select()
      .from(users)
      .where(eq(users.id, candidate))
      .limit(1);
    if (found?.isActive) {
      return serializeUser(found) as AgendaUser;
    }
  }

  const [fallback] = await db
    .select()
    .from(users)
    .where(eq(users.isActive, true))
    .orderBy(asc(users.id))
    .limit(1);

  if (!fallback) {
    throw new Error("Aucun collaborateur disponible");
  }
  return serializeUser(fallback) as AgendaUser;
}

export async function listCollaborators(): Promise<AgendaUser[]> {
  await ensureAgendaSeed();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.isActive, true))
    .orderBy(asc(users.id));
  return rows.map((row) => serializeUser(row) as AgendaUser);
}

export async function setSessionUser(userId: number) {
  const store = await cookies();
  store.set(SESSION_COOKIE, String(userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
