import { and, asc, desc, eq, gte, inArray, isNotNull, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  calendarEvents,
  eventParticipants,
  eventReminders,
  users,
  type CalendarEventRow,
  type UserRow,
} from "@/db/schema";
import { ensureAgendaSeed } from "@/db/seed";
import {
  canEditEvent,
  getCategory,
} from "@/lib/agenda-config";
import type {
  AgendaReminder,
  AgendaResponse,
  AgendaStats,
  AgendaUser,
  EventOccurrence,
  ExternalSyncInfo,
  SyncStatus,
} from "@/lib/agenda-types";
import {
  eventInputSchema,
  type EventInput,
  type EventMutation,
} from "@/lib/agenda-schema";
import { expandEvent, parseRecurrence, serializeRecurrence } from "@/lib/recurrence";
import { serializeUser } from "@/lib/session";
import {
  addDaysKey,
  endOfMonthKey,
  endOfWeekKey,
  fromParisWallTime,
  parisDateKey,
  startOfMonthKey,
  startOfWeekKey,
} from "@/lib/time";

export class AgendaError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type AgendaQuery = {
  from: string;
  to: string;
  categories?: string[];
  assignee?: number | null;
  search?: string;
  scope?: "all" | "mine";
  status?: string;
  user: AgendaUser;
};

type MasterEvent = {
  row: CalendarEventRow;
  participantIds: number[];
};

function parseTimeToMinutes(time: string | undefined, fallback: number): number {
  if (!time) return fallback;
  const [hours, minutes] = time.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback;
  return Math.max(0, Math.min(hours * 60 + minutes, 23 * 60 + 59));
}

function resolveDates(input: EventInput): { startAt: Date; endAt: Date } {
  const startMinutes = input.allDay ? 0 : parseTimeToMinutes(input.startTime, 9 * 60);
  const endMinutes = input.allDay
    ? 23 * 60 + 59
    : parseTimeToMinutes(input.endTime, startMinutes + 60);

  const startAt = fromParisWallTime(input.startDate, startMinutes);
  let endAt = fromParisWallTime(input.endDate, endMinutes);

  if (input.endDate < input.startDate) {
    throw new AgendaError("La date de fin précède la date de début");
  }
  if (endAt.getTime() <= startAt.getTime()) {
    endAt = new Date(startAt.getTime() + (input.allDay ? 24 * 60 * 60_000 - 60_000 : 60 * 60_000));
  }
  return { startAt, endAt };
}

function resolveRecurrence(input: EventInput): string | null {
  const recurrence = input.recurrence;
  if (!recurrence?.freq) return null;
  const byDay =
    recurrence.freq === "WEEKLY"
      ? recurrence.byDay && recurrence.byDay.length > 0
        ? recurrence.byDay
        : [((new Date(`${input.startDate}T00:00:00Z`).getUTCDay() + 6) % 7)]
      : [];
  return serializeRecurrence({
    freq: recurrence.freq,
    interval: recurrence.interval ?? 1,
    byDay,
    until: recurrence.until ?? undefined,
    count: recurrence.count ?? undefined,
  });
}

function visibilityAllowed(
  event: CalendarEventRow,
  participantIds: number[],
  user: AgendaUser,
): boolean {
  if (event.visibility !== "prive") return true;
  if (user.role === "admin" || user.role === "manager") return true;
  if (event.createdBy === user.id || event.assignedTo === user.id) return true;
  return participantIds.includes(user.id);
}

async function loadMasters(rangeFrom: Date, rangeTo: Date): Promise<{
  masters: MasterEvent[];
  usersById: Map<number, UserRow>;
}> {
  const rows = await db
    .select()
    .from(calendarEvents)
    .where(
      or(
        and(lte(calendarEvents.startAt, rangeTo), gte(calendarEvents.endAt, rangeFrom)),
        and(isNotNull(calendarEvents.recurrenceRule), lte(calendarEvents.startAt, rangeTo)),
      ),
    )
    .orderBy(asc(calendarEvents.startAt));

  const allUsers = await db.select().from(users);
  const usersById = new Map(allUsers.map((user) => [user.id, user]));

  const ids = rows.map((row) => row.id);
  const participantMap = new Map<string, number[]>();
  if (ids.length > 0) {
    const links = await db
      .select()
      .from(eventParticipants)
      .where(inArray(eventParticipants.eventId, ids));
    for (const link of links) {
      const list = participantMap.get(link.eventId) ?? [];
      list.push(link.userId);
      participantMap.set(link.eventId, list);
    }
  }

  return {
    masters: rows.map((row) => ({
      row,
      participantIds: participantMap.get(row.id) ?? [],
    })),
    usersById,
  };
}

function toOccurrence(
  master: MasterEvent,
  slot: { occurrenceKey: string; occurrenceDate: string; startAt: Date; endAt: Date },
  usersById: Map<number, UserRow>,
  user: AgendaUser,
): EventOccurrence {
  const row = master.row;
  const assigned = row.assignedTo ? usersById.get(row.assignedTo) : null;
  const creator = row.createdBy ? usersById.get(row.createdBy) : null;
  const participants = master.participantIds
    .map((id) => serializeUser(usersById.get(id)))
    .filter((participant): participant is AgendaUser => Boolean(participant));

  return {
    occurrenceKey: slot.occurrenceKey,
    eventId: row.id,
    occurrenceDate: slot.occurrenceDate,
    title: row.title,
    description: row.description,
    category: row.category,
    startAt: slot.startAt.toISOString(),
    endAt: slot.endAt.toISOString(),
    allDay: row.allDay,
    location: row.location,
    priority: row.priority,
    status: row.status,
    visibility: row.visibility,
    reminder: row.reminder,
    recurrenceRule: row.recurrenceRule,
    isRecurring: Boolean(row.recurrenceRule),
    assignedTo: serializeUser(assigned ?? null),
    participants,
    createdBy: serializeUser(creator ?? null),
    source: row.source as EventOccurrence["source"],
    externalId: row.externalId,
    externalObjectType: row.externalObjectType,
    externalObjectId: row.externalObjectId,
    externalUrl: row.externalUrl,
    syncStatus: row.syncStatus as SyncStatus,
    syncDirection: row.syncDirection,
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    canEdit: canEditEvent(user, {
      createdBy: row.createdBy,
      assignedTo: row.assignedTo,
      participantIds: master.participantIds,
    }),
  };
}

const OPEN_STATUSES = new Set(["a_venir", "en_cours"]);

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export async function getAgendaData(query: AgendaQuery): Promise<AgendaResponse> {
  await ensureAgendaSeed();
  const { user } = query;
  const todayKey = parisDateKey(new Date());

  const displayFrom = query.from;
  const displayTo = query.to;
  const loadFromKey = [displayFrom, addDaysKey(todayKey, -45)].sort()[0];
  const loadToKey = [displayTo, addDaysKey(todayKey, 150)].sort().slice(-1)[0];

  const rangeFrom = fromParisWallTime(loadFromKey, 0);
  const loadToEnd = fromParisWallTime(addDaysKey(loadToKey, 1), 0);

  const { masters, usersById } = await loadMasters(rangeFrom, loadToEnd);

  const allOccurrences: EventOccurrence[] = [];
  for (const master of masters) {
    if (!visibilityAllowed(master.row, master.participantIds, user)) continue;
    const slots = expandEvent(
      {
        id: master.row.id,
        startAt: master.row.startAt,
        endAt: master.row.endAt,
        recurrenceRule: master.row.recurrenceRule,
        recurrenceExceptions: master.row.recurrenceExceptions,
      },
      loadFromKey,
      loadToKey,
    );
    for (const slot of slots) {
      allOccurrences.push(toOccurrence(master, slot, usersById, user));
    }
  }

  allOccurrences.sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );

  const now = new Date();
  const todayStart = fromParisWallTime(todayKey, 0);
  const todayEnd = fromParisWallTime(addDaysKey(todayKey, 1), 0);
  const weekStart = fromParisWallTime(startOfWeekKey(todayKey), 0);
  const weekEnd = fromParisWallTime(addDaysKey(endOfWeekKey(todayKey), 1), 0);
  const monthStart = fromParisWallTime(startOfMonthKey(todayKey), 0);
  const monthEnd = fromParisWallTime(addDaysKey(endOfMonthKey(todayKey), 1), 0);

  const overlaps = (occurrence: EventOccurrence, start: Date, end: Date) =>
    new Date(occurrence.startAt) < end && new Date(occurrence.endAt) > start;

  const active = allOccurrences.filter((occurrence) => occurrence.status !== "annule");

  const overdueEvents = active
    .filter(
      (occurrence) =>
        OPEN_STATUSES.has(occurrence.status) &&
        new Date(occurrence.endAt) < now &&
        (!occurrence.isRecurring || occurrence.occurrenceDate >= todayKey),
    )
    .sort((a, b) => new Date(b.endAt).getTime() - new Date(a.endAt).getTime());

  const deliveries = active.filter(
    (occurrence) =>
      occurrence.category === "livraison" &&
      OPEN_STATUSES.has(occurrence.status) &&
      new Date(occurrence.endAt) >= now,
  );
  const revisions = active.filter(
    (occurrence) =>
      occurrence.category === "revision" &&
      OPEN_STATUSES.has(occurrence.status) &&
      new Date(occurrence.endAt) >= now,
  );

  const stats: AgendaStats = {
    today: active.filter((occurrence) => overlaps(occurrence, todayStart, todayEnd)).length,
    week: active.filter((occurrence) => overlaps(occurrence, weekStart, weekEnd)).length,
    month: active.filter((occurrence) => overlaps(occurrence, monthStart, monthEnd)).length,
    overdue: overdueEvents.length,
    upcomingDeliveries: deliveries.length,
    upcomingRevisions: revisions.length,
    pendingReminders: 0,
    bySource: {
      local: active.filter((occurrence) => occurrence.source === "local").length,
      hubspot: active.filter((occurrence) => occurrence.source === "hubspot").length,
      outlook: active.filter((occurrence) => occurrence.source === "outlook").length,
    },
  };

  const upcoming = active
    .filter(
      (occurrence) =>
        OPEN_STATUSES.has(occurrence.status) &&
        new Date(occurrence.endAt) >= now,
    )
    .slice(0, 8);

  const reminders: AgendaReminder[] = [];
  for (const occurrence of active) {
    if (occurrence.reminder <= 0 || !OPEN_STATUSES.has(occurrence.status)) continue;
    const startAt = new Date(occurrence.startAt);
    const scheduledFor = new Date(startAt.getTime() - occurrence.reminder * 60_000);
    const due = scheduledFor.getTime() <= now.getTime();
    if (due && startAt.getTime() < now.getTime() - 24 * 60 * 60_000) continue;
    if (scheduledFor.getTime() > now.getTime() + 24 * 60 * 60_000) continue;
    reminders.push({
      occurrenceKey: occurrence.occurrenceKey,
      eventId: occurrence.eventId,
      title: occurrence.title,
      category: occurrence.category,
      scheduledFor: scheduledFor.toISOString(),
      startAt: occurrence.startAt,
      reminder: occurrence.reminder,
      assignedTo: occurrence.assignedTo,
      due,
    });
  }
  reminders.sort(
    (a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime(),
  );
  stats.pendingReminders = reminders.filter((reminder) => !reminder.due).length;

  const categories = query.categories ?? [];
  const search = normalize((query.search ?? "").trim());

  const displayStartMs = fromParisWallTime(displayFrom, 0).getTime();
  const displayEndMs = fromParisWallTime(addDaysKey(displayTo, 1), 0).getTime();

  const filtered = allOccurrences.filter((occurrence) => {
    const occurrenceStart = new Date(occurrence.startAt).getTime();
    const occurrenceEnd = new Date(occurrence.endAt).getTime();
    const overlapsDisplay =
      occurrenceStart < displayEndMs && occurrenceEnd > displayStartMs;
    if (!overlapsDisplay) return false;
    if (categories.length > 0 && !categories.includes(occurrence.category)) return false;
    if (query.assignee) {
      const isAssigned = occurrence.assignedTo?.id === query.assignee;
      const isParticipant = occurrence.participants.some(
        (participant) => participant.id === query.assignee,
      );
      if (!isAssigned && !isParticipant) return false;
    }
    if (query.scope === "mine") {
      const mine =
        occurrence.assignedTo?.id === user.id ||
        occurrence.createdBy?.id === user.id ||
        occurrence.participants.some((participant) => participant.id === user.id);
      if (!mine) return false;
    }
    if (query.status && query.status !== "all") {
      if (query.status === "en_retard") {
        const late =
          OPEN_STATUSES.has(occurrence.status) && new Date(occurrence.endAt) < now;
        if (!late) return false;
      } else if (occurrence.status !== query.status) {
        return false;
      }
    }
    if (search) {
      const haystack = [
        occurrence.title,
        occurrence.description ?? "",
        occurrence.location ?? "",
        occurrence.assignedTo?.name ?? "",
        getCategory(occurrence.category).label,
        ...occurrence.participants.map((participant) => participant.name),
      ]
        .join(" ");
      if (!normalize(haystack).includes(search)) return false;
    }
    return true;
  });

  const syncConfigured = Boolean(
    process.env.HUBSPOT_PRIVATE_APP_TOKEN || process.env.HUBSPOT_API_KEY,
  );

  return {
    events: filtered,
    stats,
    upcoming,
    nextDeliveries: deliveries.slice().sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()).slice(0, 4),
    nextRevisions: revisions.slice().sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()).slice(0, 4),
    overdueEvents: overdueEvents.slice(0, 6),
    reminders: reminders.slice(0, 10),
    meta: {
      from: displayFrom,
      to: displayTo,
      today: todayKey,
      timezone: "Europe/Paris",
      generatedAt: new Date().toISOString(),
      totalMatching: filtered.length,
      syncConfigured,
    },
  };
}

async function loadMaster(id: string): Promise<MasterEvent> {
  const [row] = await db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.id, id))
    .limit(1);
  if (!row) throw new AgendaError("Événement introuvable", 404);
  const links = await db
    .select()
    .from(eventParticipants)
    .where(eq(eventParticipants.eventId, id));
  return { row, participantIds: links.map((link) => link.userId) };
}

function assertCanEdit(master: MasterEvent, user: AgendaUser) {
  if (
    !canEditEvent(user, {
      createdBy: master.row.createdBy,
      assignedTo: master.row.assignedTo,
      participantIds: master.participantIds,
    })
  ) {
    throw new AgendaError(
      "Vous n'avez pas les droits pour modifier cet événement",
      403,
    );
  }
}

async function syncParticipants(eventId: string, participantIds: number[], assignedTo: number | null) {
  await db.delete(eventParticipants).where(eq(eventParticipants.eventId, eventId));
  const unique = [...new Set(participantIds)].filter((id) => id !== assignedTo);
  if (unique.length > 0) {
    await db
      .insert(eventParticipants)
      .values(unique.map((userId) => ({ eventId, userId })))
      .onConflictDoNothing();
  }
}

async function syncReminders(
  eventId: string,
  startAt: Date,
  reminder: number,
  assignedTo: number | null,
  participantIds: number[],
  status: string,
) {
  await db.delete(eventReminders).where(eq(eventReminders.eventId, eventId));
  if (reminder <= 0) return;
  const targets = [...new Set([assignedTo, ...participantIds].filter((id): id is number => Boolean(id)))];
  if (targets.length === 0) return;
  await db.insert(eventReminders).values(
    targets.map((userId) => ({
      eventId,
      userId,
      minutesBefore: reminder,
      scheduledFor: new Date(startAt.getTime() - reminder * 60_000),
      status: OPEN_STATUSES.has(status) ? "pending" : "cancelled",
    })),
  );
}

function baseValues(input: EventInput) {
  const { startAt, endAt } = resolveDates(input);
  return {
    startAt,
    endAt,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    category: input.category,
    allDay: input.allDay,
    location: input.location?.trim() || null,
    assignedTo: input.assignedTo ?? null,
    priority: input.priority,
    status: input.status,
    visibility: input.visibility,
    reminder: input.reminder,
    recurrenceRule: resolveRecurrence(input),
    updatedAt: new Date(),
  };
}

export async function createEvent(input: EventInput, user: AgendaUser): Promise<EventOccurrence> {
  if (user.role === "lecture") {
    throw new AgendaError("Votre profil est en lecture seule", 403);
  }
  const parsed = eventInputSchema.parse(input);
  const values = baseValues(parsed);
  const [created] = await db
    .insert(calendarEvents)
    .values({
      ...values,
      allDay: parsed.allDay,
      createdBy: user.id,
      source: "local",
      syncStatus: "local",
      syncDirection: "outbound",
    })
    .returning();
  if (!created) throw new AgendaError("Création impossible", 500);
  await syncParticipants(created.id, parsed.participantIds, parsed.assignedTo ?? null);
  await syncReminders(
    created.id,
    created.startAt,
    parsed.reminder,
    parsed.assignedTo ?? null,
    parsed.participantIds,
    parsed.status,
  );
  return loadOccurrence(created.id, user);
}

async function loadOccurrence(eventId: string, user: AgendaUser): Promise<EventOccurrence> {
  const master = await loadMaster(eventId);
  const slot = expandEvent(
    {
      id: master.row.id,
      startAt: master.row.startAt,
      endAt: master.row.endAt,
      recurrenceRule: master.row.recurrenceRule,
      recurrenceExceptions: master.row.recurrenceExceptions,
    },
    parisDateKey(master.row.startAt),
    addDaysKey(parisDateKey(master.row.startAt), 1),
  )[0] ?? {
    occurrenceKey: `${master.row.id}:${parisDateKey(master.row.startAt)}`,
    occurrenceDate: parisDateKey(master.row.startAt),
    startAt: master.row.startAt,
    endAt: master.row.endAt,
  };
  const allUsers = await db.select().from(users);
  const usersById = new Map(allUsers.map((row) => [row.id, row]));
  return toOccurrence(master, slot, usersById, user);
}

export async function updateEvent(
  id: string,
  input: EventInput,
  user: AgendaUser,
  scope: "series" | "occurrence",
  occurrenceDate?: string,
): Promise<EventOccurrence> {
  const master = await loadMaster(id);
  assertCanEdit(master, user);
  const parsed = eventInputSchema.parse(input);
  const values = baseValues(parsed);

  if (scope === "occurrence" && master.row.recurrenceRule && occurrenceDate) {
    const [created] = await db
      .insert(calendarEvents)
      .values({
        ...values,
        allDay: parsed.allDay,
        createdBy: master.row.createdBy ?? user.id,
        source: "local",
        syncStatus: "local",
        syncDirection: "outbound",
      })
      .returning();
    if (!created) throw new AgendaError("Modification impossible", 500);
    await syncParticipants(created.id, parsed.participantIds, parsed.assignedTo ?? null);
    await syncReminders(
      created.id,
      created.startAt,
      parsed.reminder,
      parsed.assignedTo ?? null,
      parsed.participantIds,
      parsed.status,
    );
    await addRecurrenceException(master, occurrenceDate);
    return loadOccurrence(created.id, user);
  }

  const [updated] = await db
    .update(calendarEvents)
    .set(values)
    .where(eq(calendarEvents.id, id))
    .returning();
  if (!updated) throw new AgendaError("Modification impossible", 500);
  await syncParticipants(id, parsed.participantIds, parsed.assignedTo ?? null);
  await syncReminders(
    id,
    updated.startAt,
    parsed.reminder,
    parsed.assignedTo ?? null,
    parsed.participantIds,
    parsed.status,
  );
  return loadOccurrence(id, user);
}

async function addRecurrenceException(master: MasterEvent, occurrenceDate: string) {
  const current = new Set(master.row.recurrenceExceptions ?? []);
  current.add(occurrenceDate);
  await db
    .update(calendarEvents)
    .set({ recurrenceExceptions: [...current], updatedAt: new Date() })
    .where(eq(calendarEvents.id, master.row.id));
}

export async function deleteEvent(
  id: string,
  user: AgendaUser,
  scope: "series" | "occurrence",
  occurrenceDate?: string,
): Promise<{ deleted: boolean }> {
  const master = await loadMaster(id);
  assertCanEdit(master, user);
  if (scope === "occurrence" && master.row.recurrenceRule && occurrenceDate) {
    await addRecurrenceException(master, occurrenceDate);
    return { deleted: false };
  }
  await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
  return { deleted: true };
}

export async function setEventStatus(
  id: string,
  status: string,
  user: AgendaUser,
  scope: "series" | "occurrence",
  occurrenceDate?: string,
): Promise<EventOccurrence> {
  const master = await loadMaster(id);
  assertCanEdit(master, user);
  if (scope === "occurrence" && master.row.recurrenceRule && occurrenceDate) {
    const source = master.row;
    const input = eventFromRow(source, master.participantIds, status);
    return updateEvent(id, input, user, "occurrence", occurrenceDate);
  }
  const [updated] = await db
    .update(calendarEvents)
    .set({ status, updatedAt: new Date() })
    .where(eq(calendarEvents.id, id))
    .returning();
  if (!updated) throw new AgendaError("Mise à jour impossible", 500);
  await db
    .update(eventReminders)
    .set({ status: OPEN_STATUSES.has(status) ? "pending" : "cancelled" })
    .where(eq(eventReminders.eventId, id));
  return loadOccurrence(id, user);
}

export async function rescheduleEvent(
  id: string,
  startIso: string,
  endIso: string,
  user: AgendaUser,
  scope: "series" | "occurrence",
  occurrenceDate?: string,
): Promise<EventOccurrence> {
  const master = await loadMaster(id);
  assertCanEdit(master, user);
  const startAt = new Date(startIso);
  const endAt = new Date(endIso);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    throw new AgendaError("Créneau invalide");
  }
  if (endAt <= startAt) {
    endAt.setTime(startAt.getTime() + 60 * 60_000);
  }

  if (scope === "occurrence" && master.row.recurrenceRule && occurrenceDate) {
    const input = eventFromRow(master.row, master.participantIds);
    input.startDate = parisDateKey(startAt);
    input.startTime = parisClock(startAt);
    input.endDate = parisDateKey(endAt);
    input.endTime = parisClock(endAt);
    input.recurrence = null;
    return updateEvent(id, input, user, "occurrence", occurrenceDate);
  }

  const [updated] = await db
    .update(calendarEvents)
    .set({ startAt, endAt, updatedAt: new Date() })
    .where(eq(calendarEvents.id, id))
    .returning();
  if (!updated) throw new AgendaError("Reprogrammation impossible", 500);
  if (updated.reminder > 0) {
    await db
      .update(eventReminders)
      .set({ scheduledFor: new Date(startAt.getTime() - updated.reminder * 60_000) })
      .where(eq(eventReminders.eventId, id));
  }
  return loadOccurrence(id, user);
}

export async function duplicateEvent(
  id: string,
  user: AgendaUser,
  occurrenceDate?: string,
): Promise<EventOccurrence> {
  const master = await loadMaster(id);
  if (user.role === "lecture") {
    throw new AgendaError("Votre profil est en lecture seule", 403);
  }
  const source = master.row;
  const shiftDays = 1;
  const baseStart = occurrenceDate
    ? fromParisWallTime(occurrenceDate, 0)
    : source.startAt;
  const startAt = new Date(baseStart.getTime() + shiftDays * 24 * 60 * 60_000);
  const duration = source.endAt.getTime() - source.startAt.getTime();
  const endAt = new Date(startAt.getTime() + duration);

  const input = eventFromRow(source, master.participantIds);
  input.title = `${source.title} (copie)`;
  input.startDate = parisDateKey(startAt);
  input.startTime = parisClock(startAt);
  input.endDate = parisDateKey(endAt);
  input.endTime = parisClock(endAt);
  if (occurrenceDate) input.recurrence = null;

  return createEvent(input, user);
}

function parisClock(date: Date): string {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return parts.replace("h", ":").slice(0, 5);
}

export function eventFromRow(
  row: CalendarEventRow,
  participantIds: number[],
  statusOverride?: string,
): EventInput {
  const startKey = parisDateKey(row.startAt);
  const endKey = parisDateKey(row.endAt);
  const spec = parseRecurrence(row.recurrenceRule);
  const recurrenceInput: EventInput["recurrence"] = spec
    ? {
        freq: spec.freq,
        interval: spec.interval,
        byDay: spec.byDay,
        until: spec.until ?? null,
        count: spec.count ?? null,
      }
    : null;

  return {
    title: row.title,
    description: row.description,
    category: row.category,
    startDate: startKey,
    startTime: parisClock(row.startAt),
    endDate: endKey,
    endTime: parisClock(row.endAt),
    allDay: row.allDay,
    location: row.location,
    assignedTo: row.assignedTo,
    participantIds,
    priority: row.priority as EventInput["priority"],
    status: (statusOverride ?? row.status) as EventInput["status"],
    visibility: row.visibility as EventInput["visibility"],
    reminder: row.reminder,
    recurrence: recurrenceInput,
  };
}

export async function applyMutation(
  id: string,
  mutation: EventMutation,
  user: AgendaUser,
): Promise<{ event?: EventOccurrence; deleted?: boolean }> {
  switch (mutation.action) {
    case "update":
      return {
        event: await updateEvent(
          id,
          mutation.event,
          user,
          mutation.scope,
          mutation.occurrenceDate,
        ),
      };
    case "status":
      return {
        event: await setEventStatus(
          id,
          mutation.status,
          user,
          mutation.scope,
          mutation.occurrenceDate,
        ),
      };
    case "reschedule":
      return {
        event: await rescheduleEvent(
          id,
          mutation.startAt,
          mutation.endAt,
          user,
          mutation.scope,
          mutation.occurrenceDate,
        ),
      };
    case "duplicate":
      return { event: await duplicateEvent(id, user, mutation.occurrenceDate) };
    default:
      throw new AgendaError("Action inconnue", 400);
  }
}

export async function deleteEventAndReport(
  id: string,
  user: AgendaUser,
  scope: "series" | "occurrence",
  occurrenceDate?: string,
) {
  return deleteEvent(id, user, scope, occurrenceDate);
}

export async function getEventDetail(id: string, user: AgendaUser): Promise<EventOccurrence> {
  await ensureAgendaSeed();
  const master = await loadMaster(id);
  if (!visibilityAllowed(master.row, master.participantIds, user)) {
    throw new AgendaError("Événement introuvable", 404);
  }
  return loadOccurrence(id, user);
}

export async function getExternalSyncInfo(): Promise<ExternalSyncInfo> {
  await ensureAgendaSeed();
  const [counts] = await db
    .select({
      external: sql<number>`count(*) filter (where ${calendarEvents.source} <> 'local')::int`,
      pending: sql<number>`count(*) filter (where ${calendarEvents.syncStatus} = 'pending')::int`,
      lastSynced: sql<string | null>`max(${calendarEvents.lastSyncedAt})`,
    })
    .from(calendarEvents);

  const [lastLocal] = await db
    .select({ updatedAt: calendarEvents.updatedAt })
    .from(calendarEvents)
    .orderBy(desc(calendarEvents.updatedAt))
    .limit(1);

  const configured = Boolean(
    process.env.HUBSPOT_PRIVATE_APP_TOKEN || process.env.HUBSPOT_API_KEY,
  );

  return {
    provider: "hubspot",
    configured,
    status: configured ? "ready" : "not_configured",
    missingEnvironment: configured
      ? []
      : ["HUBSPOT_PRIVATE_APP_TOKEN", "HUBSPOT_PORTAL_ID"],
    readyFields: [
      "source",
      "external_id",
      "external_object_type",
      "external_object_id",
      "external_url",
      "last_synced_at",
      "sync_status",
      "sync_direction",
    ],
    lastLocalActivity: lastLocal?.updatedAt ? lastLocal.updatedAt.toISOString() : null,
    externalEventCount: counts?.external ?? 0,
    pendingCount: counts?.pending ?? 0,
    message: configured
      ? "Un jeton HubSpot est détecté. La synchronisation reste désactivée tant que le connecteur n'est pas livré : aucune donnée n'est importée automatiquement."
      : "Aucune connexion HubSpot n'est configurée. Les événements créés dans ALP Manager sont enregistrés localement et le schéma est prêt pour une future synchronisation (aucune donnée simulée).",
  };
}
