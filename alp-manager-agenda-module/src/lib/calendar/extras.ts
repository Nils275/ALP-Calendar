/*
 * Opérations de l'assistant sur les événements : champs, participants, liens CRM, compte rendu, suivi.
 * Chaque opération passe par les mêmes contrôles de droits que l'agenda (getEditableRow).
 */
import { and, desc, eq, gte, inArray, isNull, lt, ne } from "drizzle-orm";
import { db } from "@/db";
import { calendarEventParticipants, calendarEvents, users } from "@/db/schema";
import * as crm from "@/lib/crm/service";
import type { CategoryKey } from "./constants";
import { CalendarError, createEvent, getEditableRow, visibilityCondition } from "./service";
import { addDays, instantFromKey } from "./time";
import type { CalendarUser, EventPriority, EventStatus } from "./types";
import type { ParsedEvent } from "./validation";

export async function patchEventFields(
  viewer: CalendarUser,
  id: string,
  changes: {
    title?: string;
    description?: string | null;
    location?: string | null;
    category?: CategoryKey;
    priority?: EventPriority;
    status?: EventStatus;
  },
): Promise<void> {
  await getEditableRow(viewer, id);
  await db
    .update(calendarEvents)
    .set({ ...changes, updatedBy: viewer.id, updatedAt: new Date() })
    .where(eq(calendarEvents.id, id));
}

export async function addParticipants(viewer: CalendarUser, id: string, userIds: string[]): Promise<void> {
  await getEditableRow(viewer, id);
  const unique = [...new Set(userIds)];
  const found = await db.select({ id: users.id }).from(users).where(inArray(users.id, unique));
  if (found.length !== unique.length) throw new CalendarError("Un collaborateur sélectionné est introuvable.", 400);
  await db
    .insert(calendarEventParticipants)
    .values(unique.map((userId) => ({ eventId: id, userId })))
    .onConflictDoNothing();
}

export async function setCrmLinks(
  viewer: CalendarUser,
  id: string,
  links: { companyId?: string | null; contactId?: string | null; dealId?: string | null },
): Promise<void> {
  await getEditableRow(viewer, id);
  if (links.companyId && !(await crm.getCompanyName(links.companyId))) {
    throw new CalendarError("Entreprise introuvable dans ALP Manager.", 404);
  }
  if (links.contactId && !(await crm.getContact(links.contactId))) {
    throw new CalendarError("Contact introuvable dans ALP Manager.", 404);
  }
  if (links.dealId && !(await crm.getDeal(links.dealId))) {
    throw new CalendarError("Affaire introuvable dans ALP Manager.", 404);
  }

  const patch: {
    crmCompanyId?: string | null;
    crmContactId?: string | null;
    crmDealId?: string | null;
    updatedBy: string;
    updatedAt: Date;
  } = { updatedBy: viewer.id, updatedAt: new Date() };
  if (links.companyId !== undefined) patch.crmCompanyId = links.companyId;
  if (links.contactId !== undefined) patch.crmContactId = links.contactId;
  if (links.dealId !== undefined) patch.crmDealId = links.dealId;
  await db.update(calendarEvents).set(patch).where(eq(calendarEvents.id, id));
}

export async function setReport(viewer: CalendarUser, id: string, report: string): Promise<void> {
  await getEditableRow(viewer, id);
  await db
    .update(calendarEvents)
    .set({ report, reportAt: new Date(), updatedBy: viewer.id, updatedAt: new Date() })
    .where(eq(calendarEvents.id, id));
}

/** Transforme une demande en tâche de suivi commerciale (événement journée entière, catégorie Commercial). */
export async function createFollowUp(
  viewer: CalendarUser,
  input: {
    title: string;
    dueDate: string;
    description?: string | null;
    companyId?: string | null;
    dealId?: string | null;
    assigneeId?: string | null;
  },
): Promise<string> {
  const parsed: ParsedEvent = {
    title: input.title,
    description: input.description ?? null,
    category: "commercial",
    allDay: true,
    location: null,
    assignedToId: input.assigneeId ?? viewer.id,
    participantIds: [],
    priority: "high",
    status: "upcoming",
    visibility: "shared",
    reminderMinutes: 1440,
    recurrenceRule: null,
    startAt: instantFromKey(input.dueDate),
    endAt: instantFromKey(addDays(input.dueDate, 1)),
  };
  const id = await createEvent(viewer, parsed);
  if (input.companyId || input.dealId) {
    await setCrmLinks(viewer, id, {
      companyId: input.companyId ?? undefined,
      dealId: input.dealId ?? undefined,
    });
  }
  return id;
}

/** Rendez-vous passés (non récurrents) sans compte rendu, visibles par l'utilisateur. */
export async function listPastWithoutReport(viewer: CalendarUser, from: Date, to: Date) {
  return db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      startAt: calendarEvents.startAt,
      endAt: calendarEvents.endAt,
      category: calendarEvents.category,
      crmCompanyId: calendarEvents.crmCompanyId,
    })
    .from(calendarEvents)
    .where(
      and(
        visibilityCondition(viewer),
        isNull(calendarEvents.report),
        isNull(calendarEvents.recurrenceRule),
        ne(calendarEvents.status, "cancelled"),
        gte(calendarEvents.endAt, from),
        lt(calendarEvents.endAt, to),
        inArray(calendarEvents.category, ["rendez_vous", "commercial", "reunion_interne", "projet"]),
      ),
    )
    .orderBy(desc(calendarEvents.endAt))
    .limit(30);
}

export async function linkedCompanyIds(eventIds: string[]): Promise<Map<string, string | null>> {
  if (eventIds.length === 0) return new Map();
  const rows = await db
    .select({ id: calendarEvents.id, companyId: calendarEvents.crmCompanyId })
    .from(calendarEvents)
    .where(inArray(calendarEvents.id, eventIds));
  return new Map(rows.map((r) => [r.id, r.companyId]));
}
