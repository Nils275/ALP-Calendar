/* Service métier de l'agenda (serveur uniquement) : requêtes, occurrences, écriture, résumé, rappels. */
import { and, asc, eq, gt, inArray, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";

import {
  calendarCategories,
  calendarCategoryFields,
  calendarEventExceptions,
  calendarEventParticipants,
  calendarEvents,
  workflowSubcategories,
  workflowTaskTypes,
  workflowTaskTypeFields,
} from "@/db/schema";

import { loadUserRefMap } from "@/lib/auth/users";
import { canEditEvent, concernsUser } from "./permissions";
import { expandOccurrences, parseRule } from "./recurrence";
import { addDays, instantFromKey, startOfWeekKey, todayKey } from "./time";
import type {
  AgendaItemDto,
  AgendaSummaryDto,
  CalendarRangeDto,
  CalendarUser,
  EventDetailDto,
  EventDto,
  EventStatus,
  OccurrenceDto,
  ReminderDto,
  UserRef,
} from "./types";
import type { ParsedEvent } from "./validation";

type EventRow = typeof calendarEvents.$inferSelect;
type ExceptionRow = typeof calendarEventExceptions.$inferSelect;
type UserRefMap = Map<string, UserRef>;

const MS_DAY = 86_400_000;
const MS_MINUTE = 60_000;
const OPEN_STATUSES = ["upcoming", "in_progress"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CalendarError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "CalendarError";
    this.status = status;
  }
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
async function assertCategoryAvailable(
  categoryKey: string,
  allowInactive = false,
): Promise<void> {
  const [category] = await db
    .select({
      key: calendarCategories.key,
      isActive: calendarCategories.isActive,
    })
    .from(calendarCategories)
    .where(eq(calendarCategories.key, categoryKey))
    .limit(1);

  if (!category) {
    throw new CalendarError("Cette catégorie n'existe pas.", 400);
  }

  if (!category.isActive && !allowInactive) {
    throw new CalendarError("Cette catégorie est désactivée.", 400);
  }
}

async function assertWorkflowSelection(
  categoryKey: string,
  subcategoryId: string | null,
  taskTypeId: string | null,
  allowInactive = false,
): Promise<void> {
  if (!subcategoryId && !taskTypeId) return;

  if (!subcategoryId && taskTypeId) {
    throw new CalendarError(
      "Un type de tâche nécessite une sous-catégorie.",
      400,
    );
  }

  const [subcategory] = await db
    .select({
      id: workflowSubcategories.id,
      categoryKey: workflowSubcategories.categoryKey,
      isActive: workflowSubcategories.isActive,
    })
    .from(workflowSubcategories)
    .where(eq(workflowSubcategories.id, subcategoryId!))
    .limit(1);

  if (!subcategory) {
    throw new CalendarError("Cette sous-catégorie n'existe pas.", 400);
  }

  if (subcategory.categoryKey !== categoryKey) {
    throw new CalendarError(
      "Cette sous-catégorie ne correspond pas à la catégorie sélectionnée.",
      400,
    );
  }

  if (!subcategory.isActive && !allowInactive) {
    throw new CalendarError("Cette sous-catégorie est désactivée.", 400);
  }

  if (!taskTypeId) return;

  const [taskType] = await db
    .select({
      id: workflowTaskTypes.id,
      subcategoryId: workflowTaskTypes.subcategoryId,
      isActive: workflowTaskTypes.isActive,
    })
    .from(workflowTaskTypes)
    .where(eq(workflowTaskTypes.id, taskTypeId))
    .limit(1);

  if (!taskType) {
    throw new CalendarError("Ce type de tâche n'existe pas.", 400);
  }

  if (taskType.subcategoryId !== subcategoryId) {
    throw new CalendarError(
      "Ce type de tâche ne correspond pas à la sous-catégorie sélectionnée.",
      400,
    );
  }

  if (!taskType.isActive && !allowInactive) {
    throw new CalendarError("Ce type de tâche est désactivé.", 400);
  }
}

type FieldDefinition = {
  label: string;
  fieldType: string;
  isRequired: boolean;
  options: Array<{ label: string; value: string }>;
};

function isEmptyValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (typeof value === "string" && !value.trim())
  );
}

function assertFieldValue(field: FieldDefinition, value: unknown): void {
  const label = `« ${field.label} »`;

  switch (field.fieldType) {
    case "checkbox":
      if (typeof value !== "boolean") {
        throw new CalendarError(`Le champ ${label} doit être une case à cocher.`, 400);
      }
      return;
    case "number":
    case "amount": {
      const valid =
        (typeof value === "number" && Number.isFinite(value)) ||
        (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)));
      if (!valid) {
        throw new CalendarError(`Le champ ${label} doit contenir un nombre valide.`, 400);
      }
      return;
    }
    case "date":
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new CalendarError(`Le champ ${label} doit contenir une date valide.`, 400);
      }
      return;
    case "select":
      if (typeof value !== "string") {
        throw new CalendarError(`Le champ ${label} doit contenir du texte.`, 400);
      }
      if (!field.options.some((option) => option.value === value)) {
        throw new CalendarError(`La valeur du champ ${label} est invalide.`, 400);
      }
      return;
    default:
      // text, user, et tout autre type texte
      if (typeof value !== "string") {
        throw new CalendarError(`Le champ ${label} doit contenir du texte.`, 400);
      }
      if (value.length > 5000) {
        throw new CalendarError(`Le champ ${label} est trop long.`, 400);
      }
  }
}

/**
 * Valide les champs personnalisés d'un événement :
 * - champs de la catégorie (clé = UUID du champ) ;
 * - champs du workflow du type de tâche sélectionné (clé = field.key, inchangée).
 * Seuls les champs ACTIFS de la catégorie / du type de tâche courants sont validés
 * (obligatoire + type + options). Les valeurs historiques (champs désactivés, autre
 * catégorie, autre type de tâche, valeurs déjà présentes sur l'événement) sont conservées
 * sans validation afin de ne jamais perdre de données.
 */
async function validateCustomFields(
  category: string,
  taskTypeId: string | null,
  customFields: Record<string, unknown>,
  existingCustomFields: Record<string, unknown> = {},
): Promise<void> {
  const [categoryDefinitions, workflowDefinitions] = await Promise.all([
    db.select().from(calendarCategoryFields),
    db.select().from(workflowTaskTypeFields),
  ]);

  const knownKeys = new Set<string>([
    ...categoryDefinitions.map((field) => field.id),
    ...workflowDefinitions.map((field) => field.key),
    ...Object.keys(existingCustomFields ?? {}),
  ]);

  for (const key of Object.keys(customFields)) {
    if (!knownKeys.has(key)) {
      throw new CalendarError(
        `Le champ personnalisé « ${key} » n'est pas autorisé.`,
        400,
      );
    }
  }

  const activeCategoryFields = categoryDefinitions.filter(
    (field) => field.categoryKey === category && field.isActive,
  );
  const activeWorkflowFields = taskTypeId
    ? workflowDefinitions.filter(
        (field) => field.taskTypeId === taskTypeId && field.isActive,
      )
    : [];

  const checks: Array<{ key: string; field: FieldDefinition }> = [
    ...activeCategoryFields.map((field) => ({ key: field.id, field })),
    ...activeWorkflowFields.map((field) => ({ key: field.key, field })),
  ];

  for (const { key, field } of checks) {
    const value = customFields[key];

    if (field.isRequired && isEmptyValue(value)) {
      throw new CalendarError(`Le champ « ${field.label} » est obligatoire.`, 400);
    }

    if (value === undefined || value === null || value === "") continue;

    assertFieldValue(field, value);
  }
}

/* ------------------------------------------------------------------ */
/* Accès et lecture                                                    */
/* ------------------------------------------------------------------ */

/** Filtre SQL reprenant les règles de canViewEvent (permissions.ts). */
export function visibilityCondition(viewer: CalendarUser): SQL | undefined {
  if (viewer.role === "direction") return undefined;
  return or(
    eq(calendarEvents.visibility, "shared"),
    eq(calendarEvents.createdBy, viewer.id),
    eq(calendarEvents.assignedTo, viewer.id),
    sql`exists (select 1 from calendar_event_participants p where p.event_id = ${calendarEvents.id} and p.user_id = ${viewer.id})`,
  );
}

async function fetchEventRows(viewer: CalendarUser, conditions: Array<SQL | undefined>): Promise<EventRow[]> {
  return db
    .select()
    .from(calendarEvents)
    .where(and(visibilityCondition(viewer), ...conditions))
    .orderBy(asc(calendarEvents.startAt));
}

export async function getVisibleRow(viewer: CalendarUser, id: string): Promise<EventRow | null> {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select()
    .from(calendarEvents)
    .where(and(eq(calendarEvents.id, id), visibilityCondition(viewer)))
    .limit(1);
  return row ?? null;
}

async function loadParticipantIds(ids: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (ids.length === 0) return map;
  const rows = await db
    .select()
    .from(calendarEventParticipants)
    .where(inArray(calendarEventParticipants.eventId, ids));
  for (const r of rows) {
    const list = map.get(r.eventId) ?? [];
    list.push(r.userId);
    map.set(r.eventId, list);
  }
  return map;
}

async function loadExceptions(ids: string[]): Promise<Map<string, ExceptionRow[]>> {
  const map = new Map<string, ExceptionRow[]>();
  if (ids.length === 0) return map;
  const rows = await db
    .select()
    .from(calendarEventExceptions)
    .where(inArray(calendarEventExceptions.eventId, ids));
  for (const r of rows) {
    const list = map.get(r.eventId) ?? [];
    list.push(r);
    map.set(r.eventId, list);
  }
  return map;
}

function accessOf(row: EventRow, participantIds: string[]) {
  return {
    visibility: row.visibility,
    createdById: row.createdBy,
    assignedToId: row.assignedTo,
    participantIds,
  };
}

function toEventDto(row: EventRow, userMap: UserRefMap, participantIds: string[], viewer: CalendarUser): EventDto {
  const canEdit = canEditEvent(viewer, accessOf(row, participantIds));
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    subcategoryId: row.subcategoryId,
    taskTypeId: row.taskTypeId,
    customFields: row.customFields ?? {},
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    allDay: row.allDay,
    location: row.location,
    assignedTo: row.assignedTo ? (userMap.get(row.assignedTo) ?? null) : null,
    createdBy: userMap.get(row.createdBy) ?? null,
    updatedBy: row.updatedBy ? (userMap.get(row.updatedBy) ?? null) : null,
    priority: row.priority,
    status: row.status,
    visibility: row.visibility,
    reminderMinutes: row.reminderMinutes,
    recurrenceRule: row.recurrenceRule,
    participants: participantIds.map((id) => userMap.get(id)).filter((u): u is UserRef => Boolean(u)),
    source: row.source,
    externalId: row.externalId,
    externalObjectType: row.externalObjectType,
    externalObjectId: row.externalObjectId,
    externalUrl: row.externalUrl,
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    syncStatus: row.syncStatus,
    syncDirection: row.syncDirection,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    canEdit,
    canDelete: canEdit,
  };
}

/**
 * Occurrences d'un événement dans [from, to) :
 * - événement unique : une occurrence ;
 * - série : expansion de la règle, puis application des exceptions (supprimée, déplacée, statut).
 */
function buildOccurrences(row: EventRow, exceptions: ExceptionRow[], from: Date, to: Date): OccurrenceDto[] {
  const rule = row.recurrenceRule ? parseRule(row.recurrenceRule) : null;
  const inRange = (s: Date, e: Date) => s.getTime() < to.getTime() && e.getTime() > from.getTime();

  const toDto = (
    original: Date,
    start: Date,
    end: Date,
    status: EventStatus,
    modified: boolean,
  ): OccurrenceDto => ({
    key: `${row.id}|${original.toISOString()}`,
    eventId: row.id,
    occurrenceStart: original.toISOString(),
    start: start.toISOString(),
    end: end.toISOString(),
    status,
    isRecurring: Boolean(rule),
    isModified: modified,
  });

  if (!rule) {
    if (!inRange(row.startAt, row.endAt)) return [];
    return [toDto(row.startAt, row.startAt, row.endAt, row.status, false)];
  }

  const exByOriginal = new Map(exceptions.map((ex) => [ex.originalStartAt.getTime(), ex]));
  const expandedOriginals = new Set<number>();
  const out: OccurrenceDto[] = [];

  const spans = expandOccurrences({
    start: row.startAt,
    end: row.endAt,
    allDay: row.allDay,
    rule,
    rangeStart: from,
    rangeEnd: to,
  });

  for (const span of spans) {
    const ms = span.start.getTime();
    expandedOriginals.add(ms);
    const ex = exByOriginal.get(ms);
    if (ex?.isDeleted) continue;
    const start = ex?.startAt ?? span.start;
    const end = ex?.endAt ?? span.end;
    if (!inRange(start, end)) continue;
    out.push(toDto(span.start, start, end, ex?.status ?? row.status, Boolean(ex)));
  }

  // Occurrences d'origine hors plage, déplacées à l'intérieur de la plage.
  for (const ex of exceptions) {
    if (expandedOriginals.has(ex.originalStartAt.getTime())) continue;
    if (ex.isDeleted || !ex.startAt || !ex.endAt) continue;
    if (!inRange(ex.startAt, ex.endAt)) continue;
    out.push(toDto(ex.originalStartAt, ex.startAt, ex.endAt, ex.status ?? row.status, true));
  }

  return out;
}

/** Événements visibles et occurrences dans l'intervalle [from, to). */
export async function listCalendarRange(viewer: CalendarUser, from: Date, to: Date): Promise<CalendarRangeDto> {
  const rows = await fetchEventRows(viewer, [
    or(
      and(isNotNull(calendarEvents.recurrenceRule), lt(calendarEvents.startAt, to)),
      and(lt(calendarEvents.startAt, to), gt(calendarEvents.endAt, from)),
    ),
  ]);

  const ids = rows.map((r) => r.id);
  const [userMap, participantMap, exceptionMap] = await Promise.all([
    loadUserRefMap(),
    loadParticipantIds(ids),
    loadExceptions(ids),
  ]);

  const events: EventDto[] = [];
  const occurrences: OccurrenceDto[] = [];
  for (const row of rows) {
    const participantIds = participantMap.get(row.id) ?? [];
    events.push(toEventDto(row, userMap, participantIds, viewer));
    occurrences.push(...buildOccurrences(row, exceptionMap.get(row.id) ?? [], from, to));
  }
  occurrences.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  return { events, occurrences };
}

export async function getEventDetail(
  viewer: CalendarUser,
  id: string,
  occurrenceStart?: string | null,
): Promise<EventDetailDto | null> {
  const row = await getVisibleRow(viewer, id);
  if (!row) return null;

  const [userMap, participantMap, exceptionMap] = await Promise.all([
    loadUserRefMap(),
    loadParticipantIds([id]),
    loadExceptions([id]),
  ]);
  const participantIds = participantMap.get(id) ?? [];
  const event = toEventDto(row, userMap, participantIds, viewer);
  const exceptions = exceptionMap.get(id) ?? [];

  if (!row.recurrenceRule) {
    return {
      event,
      occurrence: {
        key: `${id}|${row.startAt.toISOString()}`,
        occurrenceStart: row.startAt.toISOString(),
        start: row.startAt.toISOString(),
        end: row.endAt.toISOString(),
        status: row.status,
        isRecurring: false,
        isModified: false,
      },
    };
  }

  const original = occurrenceStart ? new Date(occurrenceStart) : row.startAt;
  const ex = exceptions.find((e) => e.originalStartAt.getTime() === original.getTime());
  const duration = row.endAt.getTime() - row.startAt.getTime();
  const start = ex?.startAt ?? original;
  const end = ex?.endAt ?? new Date(original.getTime() + duration);

  return {
    event,
    occurrence: {
      key: `${id}|${original.toISOString()}`,
      occurrenceStart: original.toISOString(),
      start: start.toISOString(),
      end: end.toISOString(),
      status: ex?.status ?? row.status,
      isRecurring: true,
      isModified: Boolean(ex),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Écriture                                                            */
/* ------------------------------------------------------------------ */

export async function getEditableRow(viewer: CalendarUser, id: string): Promise<{ row: EventRow; participantIds: string[] }> {
  const row = await getVisibleRow(viewer, id);
  if (!row) throw new CalendarError("Événement introuvable.", 404);
  const participantIds = (await loadParticipantIds([id])).get(id) ?? [];
  if (!canEditEvent(viewer, accessOf(row, participantIds))) {
    throw new CalendarError("Vous n'avez pas les droits pour modifier cet événement.", 403);
  }
  return { row, participantIds };
}

async function assertUsersExist(ids: Array<string | null | undefined>): Promise<void> {
  const wanted = ids.filter((v): v is string => Boolean(v));
  if (wanted.length === 0) return;
  const userMap = await loadUserRefMap();
  if (wanted.some((id) => !userMap.has(id))) {
    throw new CalendarError("Un collaborateur sélectionné est introuvable.", 400);
  }
}

async function upsertException(
  eventId: string,
  originalStart: Date,
  patch: Partial<typeof calendarEventExceptions.$inferInsert>,
): Promise<void> {
  await db
    .insert(calendarEventExceptions)
    .values({ eventId, originalStartAt: originalStart, ...patch })
    .onConflictDoUpdate({
      target: [calendarEventExceptions.eventId, calendarEventExceptions.originalStartAt],
      set: { ...patch, updatedAt: new Date() },
    });
}

export async function createEvent(viewer: CalendarUser, data: ParsedEvent): Promise<string> {
  await assertCategoryAvailable(data.category);
  await assertWorkflowSelection(data.category, data.subcategoryId, data.taskTypeId);
  await validateCustomFields(data.category, data.taskTypeId, data.customFields);
  await assertUsersExist([data.assignedToId, ...data.participantIds]);

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(calendarEvents)
      .values({
        title: data.title,
        description: data.description,
        category: data.category,
        subcategoryId: data.subcategoryId,
        taskTypeId: data.taskTypeId,
        customFields: data.customFields,
        startAt: data.startAt,
        endAt: data.endAt,
        allDay: data.allDay,
        location: data.location,
        assignedTo: data.assignedToId,
        createdBy: viewer.id,
        updatedBy: viewer.id,
        priority: data.priority,
        status: data.status,
        visibility: data.visibility,
        reminderMinutes: data.reminderMinutes,
        recurrenceRule: data.recurrenceRule,
        source: "local",
        syncStatus: "local",
      })
      .returning({ id: calendarEvents.id });

    if (data.participantIds.length > 0) {
      await tx.insert(calendarEventParticipants).values(
        data.participantIds.map((userId) => ({ eventId: created.id, userId })),
      );
    }
    return created.id;
  });
}

/** Modification complète (formulaire) : s'applique à l'événement ou à toute la série. */
export async function updateEvent(viewer: CalendarUser, id: string, data: ParsedEvent): Promise<void> {
  const { row } = await getEditableRow(viewer, id);
  await assertCategoryAvailable(data.category, row.category === data.category);
  await assertWorkflowSelection(
  data.category,
  data.subcategoryId,
  data.taskTypeId,
  row.subcategoryId === data.subcategoryId &&
    row.taskTypeId === data.taskTypeId,
);

await validateCustomFields(
    data.category,
    data.taskTypeId,
    data.customFields,
    (row.customFields ?? {}) as Record<string, unknown>,
  );
  await assertUsersExist([data.assignedToId, ...data.participantIds]);

  const scheduleChanged =
    row.startAt.getTime() !== data.startAt.getTime() ||
    row.endAt.getTime() !== data.endAt.getTime() ||
    row.allDay !== data.allDay ||
    (row.recurrenceRule ?? null) !== data.recurrenceRule;

  await db.transaction(async (tx) => {
    await tx
      .update(calendarEvents)
      .set({
        title: data.title,
        description: data.description,
        category: data.category,
        subcategoryId: data.subcategoryId,
        taskTypeId: data.taskTypeId,
        customFields: data.customFields,
        startAt: data.startAt,
        endAt: data.endAt,
        allDay: data.allDay,
        location: data.location,
        assignedTo: data.assignedToId,
        updatedBy: viewer.id,
        priority: data.priority,
        status: data.status,
        visibility: data.visibility,
        reminderMinutes: data.reminderMinutes,
        recurrenceRule: data.recurrenceRule,
        updatedAt: new Date(),
      })
      .where(eq(calendarEvents.id, id));

    await tx.delete(calendarEventParticipants).where(eq(calendarEventParticipants.eventId, id));
    if (data.participantIds.length > 0) {
      await tx.insert(calendarEventParticipants).values(
        data.participantIds.map((userId) => ({ eventId: id, userId })),
      );
    }

    // Une modification du calendrier invalide les exceptions de la série.
    if (scheduleChanged) {
      await tx.delete(calendarEventExceptions).where(eq(calendarEventExceptions.eventId, id));
    }
  });
}

/** Reprogrammation (glisser-déposer ou fiche) d'une occurrence, ou de toute la série par décalage. */
export async function rescheduleOccurrence(
  viewer: CalendarUser,
  id: string,
  input: { occurrenceStart?: string | null; startAt: Date; endAt: Date; applyToSeries: boolean },
): Promise<void> {
  const { row } = await getEditableRow(viewer, id);
  if (input.endAt.getTime() <= input.startAt.getTime()) {
    throw new CalendarError("La fin doit être postérieure au début.", 400);
  }

  if (!row.recurrenceRule || !input.occurrenceStart) {
    await db
      .update(calendarEvents)
      .set({ startAt: input.startAt, endAt: input.endAt, updatedBy: viewer.id, updatedAt: new Date() })
      .where(eq(calendarEvents.id, id));
    return;
  }

  const original = new Date(input.occurrenceStart);

  if (input.applyToSeries) {
    const delta = input.startAt.getTime() - original.getTime();
    await db.transaction(async (tx) => {
      await tx
        .update(calendarEvents)
        .set({
          startAt: new Date(row.startAt.getTime() + delta),
          endAt: new Date(row.endAt.getTime() + delta),
          updatedBy: viewer.id,
          updatedAt: new Date(),
        })
        .where(eq(calendarEvents.id, id));
      await tx.delete(calendarEventExceptions).where(eq(calendarEventExceptions.eventId, id));
    });
    return;
  }

  await upsertException(id, original, {
    startAt: input.startAt,
    endAt: input.endAt,
    isDeleted: false,
  });
}

/** Changement de statut (ex. marquer terminé) pour un événement ou une occurrence. */
export async function setOccurrenceStatus(
  viewer: CalendarUser,
  id: string,
  occurrenceStart: string | null | undefined,
  status: EventStatus,
): Promise<void> {
  const { row } = await getEditableRow(viewer, id);

  if (!row.recurrenceRule || !occurrenceStart) {
    await db
      .update(calendarEvents)
      .set({ status, updatedBy: viewer.id, updatedAt: new Date() })
      .where(eq(calendarEvents.id, id));
    return;
  }

  await upsertException(id, new Date(occurrenceStart), { status });
}

export async function deleteEvent(
  viewer: CalendarUser,
  id: string,
  occurrenceStart: string | null | undefined,
  scope: "occurrence" | "series",
): Promise<void> {
  const { row } = await getEditableRow(viewer, id);

  if (row.recurrenceRule && occurrenceStart && scope === "occurrence") {
    await upsertException(id, new Date(occurrenceStart), { isDeleted: true });
    return;
  }

  await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
}

/** Duplication : crée une copie locale de l'événement (participants inclus), sans lien externe. */
export async function duplicateEvent(viewer: CalendarUser, id: string): Promise<string> {
  const row = await getVisibleRow(viewer, id);
  if (!row) throw new CalendarError("Événement introuvable.", 404);
  const participantIds = (await loadParticipantIds([id])).get(id) ?? [];

  return db.transaction(async (tx) => {
    const [copy] = await tx
      .insert(calendarEvents)
      .values({
        title: `${row.title.slice(0, 150)} (copie)`,
        description: row.description,
        category: row.category,
        subcategoryId: row.subcategoryId,
        taskTypeId: row.taskTypeId,
        startAt: row.startAt,
        endAt: row.endAt,
        allDay: row.allDay,
        location: row.location,
        assignedTo: row.assignedTo,
        createdBy: viewer.id,
        updatedBy: viewer.id,
        priority: row.priority,
        status: "upcoming",
        visibility: row.visibility,
        reminderMinutes: row.reminderMinutes,
        recurrenceRule: row.recurrenceRule,
        source: "local",
        syncStatus: "local",
      })
      .returning({ id: calendarEvents.id });

    if (participantIds.length > 0) {
      await tx.insert(calendarEventParticipants).values(
        participantIds.map((userId) => ({ eventId: copy.id, userId })),
      );
    }
    return copy.id;
  });
}

/* ------------------------------------------------------------------ */
/* Résumé (panneau « À VENIR ») et rappels                             */
/* ------------------------------------------------------------------ */

function toAgendaItem(o: OccurrenceDto, e: EventDto): AgendaItemDto {
  return {
    key: o.key,
    eventId: e.id,
    title: e.title,
    category: e.category,
    start: o.start,
    end: o.end,
    status: o.status,
    priority: e.priority,
    location: e.location,
    allDay: e.allDay,
    isRecurring: o.isRecurring,
    assignee: e.assignedTo
      ? { id: e.assignedTo.id, fullName: e.assignedTo.fullName, color: e.assignedTo.color }
      : null,
  };
}

export async function getAgendaSummary(viewer: CalendarUser, now: Date = new Date()): Promise<AgendaSummaryDto> {
  const today = todayKey();
  const weekStart = startOfWeekKey(today);
  const todayFrom = instantFromKey(today);
  const todayTo = instantFromKey(addDays(today, 1));
  const weekFrom = instantFromKey(weekStart);
  const weekTo = instantFromKey(addDays(weekStart, 7));
  const horizonTo = new Date(now.getTime() + 60 * MS_DAY);
  const overdueFrom = new Date(now.getTime() - 90 * MS_DAY);

  const [week, horizon, overdueRows] = await Promise.all([
    listCalendarRange(viewer, weekFrom, weekTo),
    listCalendarRange(viewer, now, horizonTo),
    fetchEventRows(viewer, [
      isNull(calendarEvents.recurrenceRule),
      inArray(calendarEvents.status, OPEN_STATUSES),
      lt(calendarEvents.endAt, now),
      gt(calendarEvents.endAt, overdueFrom),
    ]),
  ]);
  const userMap = await loadUserRefMap();

  const eventMap = new Map<string, EventDto>();
  for (const e of [...week.events, ...horizon.events]) eventMap.set(e.id, e);

  const withEvent = (list: OccurrenceDto[]): AgendaItemDto[] =>
    list.flatMap((o) => {
      const e = eventMap.get(o.eventId);
      return e ? [toAgendaItem(o, e)] : [];
    });

  const todayStartMs = todayFrom.getTime();
  const todayEndMs = todayTo.getTime();
  const todayOcc = week.occurrences.filter((o) => {
    if (o.status === "cancelled") return false;
    return Date.parse(o.start) < todayEndMs && Date.parse(o.end) > todayStartMs;
  });

  const nowMs = now.getTime();
  const isOpen = (o: OccurrenceDto) => o.status === "upcoming" || o.status === "in_progress";
  const upcomingOcc = horizon.occurrences.filter((o) => isOpen(o) && Date.parse(o.start) >= nowMs);
  const deliveries = upcomingOcc.filter((o) => eventMap.get(o.eventId)?.category === "livraison");
  const revisions = upcomingOcc.filter((o) => eventMap.get(o.eventId)?.category === "revision");

  const overdue: AgendaItemDto[] = overdueRows
    .filter((row) => row.endAt.getTime() < nowMs)
    .map((row) => ({
      key: `${row.id}|${row.startAt.toISOString()}`,
      eventId: row.id,
      title: row.title,
      category: row.category,
      start: row.startAt.toISOString(),
      end: row.endAt.toISOString(),
      status: row.status,
      priority: row.priority,
      location: row.location,
      allDay: row.allDay,
      isRecurring: false,
      assignee: row.assignedTo && userMap.get(row.assignedTo)
        ? {
            id: row.assignedTo,
            fullName: userMap.get(row.assignedTo)!.fullName,
            color: userMap.get(row.assignedTo)!.color,
          }
        : null,
    }))
    .sort((a, b) => (a.end < b.end ? -1 : 1));

  return {
    counts: {
      today: todayOcc.length,
      week: week.occurrences.filter((o) => o.status !== "cancelled").length,
      overdue: overdue.length,
      deliveries: deliveries.length,
    },
    today: withEvent(todayOcc),
    overdue,
    upcoming: withEvent(upcomingOcc).slice(0, 8),
    deliveries: withEvent(deliveries).slice(0, 6),
    revisions: withEvent(revisions).slice(0, 6),
  };
}

/**
 * Rappels à déclencher maintenant pour l'utilisateur (auteur, responsable ou participant).
 * Calculé à la demande : aucune notification système ni email n'est envoyée.
 */
export async function getDueReminders(viewer: CalendarUser, now: Date = new Date()): Promise<ReminderDto[]> {
  const range = await listCalendarRange(viewer, now, new Date(now.getTime() + MS_DAY + MS_MINUTE));
  const eventMap = new Map(range.events.map((e) => [e.id, e]));
  const nowMs = now.getTime();
  const due: ReminderDto[] = [];

  for (const o of range.occurrences) {
    const e = eventMap.get(o.eventId);
    if (!e || e.reminderMinutes === null) continue;
    if (o.status !== "upcoming" && o.status !== "in_progress") continue;

    const startMs = Date.parse(o.start);
    if (startMs <= nowMs) continue;
    if (startMs - e.reminderMinutes * MS_MINUTE > nowMs) continue;

    const relevant = concernsUser(viewer.id, {
      createdById: e.createdBy?.id ?? null,
      assignedToId: e.assignedTo?.id ?? null,
      participantIds: e.participants.map((p) => p.id),
    });
    if (!relevant) continue;

    due.push({
      key: o.key,
      eventId: e.id,
      title: e.title,
      category: e.category,
      start: o.start,
      reminderMinutes: e.reminderMinutes,
      location: e.location,
    });
  }
  return due;
}
