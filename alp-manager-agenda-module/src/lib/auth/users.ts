/*
 * Collaborateurs ALP Manager (table `users`).
 * Ce module gère uniquement la lecture et la conversion des comptes.
 * La création des comptes est réservée à l'administration.
 */
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { CalendarUser, UserRef } from "@/lib/calendar/types";

type UserRow = typeof users.$inferSelect;

export function toCalendarUser(row: UserRow): CalendarUser {
  return {
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    jobTitle: row.jobTitle,
    role: row.role,
    color: row.color,
  };
}

export function toUserRef(row: UserRow): UserRef {
  return {
    id: row.id,
    fullName: row.fullName,
    color: row.color,
    role: row.role,
    jobTitle: row.jobTitle,
  };
}

/** Renvoie uniquement les collaborateurs actifs, sans créer de compte. */
export async function listActiveUsers(): Promise<CalendarUser[]> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.isActive, true))
    .orderBy(asc(users.fullName));

  return rows.map(toCalendarUser);
}

/** Tous les collaborateurs indexés par id, pour l'affichage des auteurs. */
export async function loadUserRefMap(): Promise<Map<string, UserRef>> {
  const rows = await db.select().from(users);
  return new Map(rows.map((row) => [row.id, toUserRef(row)]));
}
