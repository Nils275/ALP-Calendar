/* Validation Zod des entrées de l'agenda + résolution des dates en instants UTC (Europe/Paris). */
import { z } from "zod";
import { CATEGORY_KEYS, PRIORITY_KEYS, REMINDER_MINUTES, STATUS_KEYS, VISIBILITY_KEYS } from "./constants";
import type { CategoryKey } from "./constants";
import { buildRule, type Recurrence } from "./recurrence";
import { addDays, instantFromKey, isDateKey, parseTime, weekdayIndex } from "./time";
import type { EventPriority, EventStatus, EventVisibility } from "./types";

const dateKeySchema = z.string().refine(isDateKey, "Date invalide.");
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure invalide.");
const isoSchema = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Date invalide.");

const recurrenceInputSchema = z.object({
  freq: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  interval: z.number().int().min(1, "Intervalle invalide.").max(99, "Intervalle trop grand."),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7),
  until: dateKeySchema.nullish(),
});

export const eventFieldsSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Le titre est obligatoire.")
    .max(160, "Le titre ne peut pas dépasser 160 caractères."),
  description: z.string().max(5000, "Description trop longue.").nullish(),
  category: z.enum(CATEGORY_KEYS),
  allDay: z.boolean(),
  startDate: dateKeySchema,
  startTime: timeSchema.nullish(),
  endDate: dateKeySchema,
  endTime: timeSchema.nullish(),
  location: z.string().trim().max(200, "Lieu trop long.").nullish(),
  assignedToId: z.uuid().nullish(),
  participantIds: z.array(z.uuid()).max(50, "Trop de participants.").default([]),
  priority: z.enum(PRIORITY_KEYS),
  status: z.enum(STATUS_KEYS),
  visibility: z.enum(VISIBILITY_KEYS),
  reminderMinutes: z
    .number()
    .int()
    .refine((v) => (REMINDER_MINUTES as readonly number[]).includes(v), "Rappel invalide.")
    .nullish(),
  recurrence: recurrenceInputSchema.nullish(),
});

export const patchEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("status"),
    occurrenceStart: isoSchema.nullish(),
    status: z.enum(STATUS_KEYS),
  }),
  z.object({
    kind: z.literal("reschedule"),
    occurrenceStart: isoSchema.nullish(),
    startAt: isoSchema,
    endAt: isoSchema,
    applyToSeries: z.boolean().default(false),
  }),
  eventFieldsSchema.extend({ kind: z.literal("update") }),
]);

export type ParsedEvent = {
  title: string;
  description: string | null;
  category: CategoryKey;
  allDay: boolean;
  location: string | null;
  assignedToId: string | null;
  participantIds: string[];
  priority: EventPriority;
  status: EventStatus;
  visibility: EventVisibility;
  reminderMinutes: number | null;
  recurrenceRule: string | null;
  startAt: Date;
  endAt: Date;
};

export type ParseResult = { ok: true; data: ParsedEvent } | { ok: false; error: string };

function normalizeRecurrence(input: NonNullable<z.infer<typeof recurrenceInputSchema>>, startDate: string): Recurrence {
  const weekdays =
    input.freq === "WEEKLY"
      ? input.weekdays.length > 0
        ? [...new Set(input.weekdays)]
        : [weekdayIndex(startDate)]
      : [];
  return {
    freq: input.freq,
    interval: input.interval,
    weekdays,
    until: input.until ?? null,
  };
}

/** Valide le corps d'un événement et calcule les instants de début/fin (Europe/Paris). */
export function parseEventFields(raw: unknown): ParseResult {
  const parsed = eventFieldsSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Données invalides." };
  }
  const d = parsed.data;

  let startAt: Date;
  let endAt: Date;

  if (d.allDay) {
    if (d.endDate < d.startDate) {
      return { ok: false, error: "La date de fin doit être égale ou postérieure à la date de début." };
    }
    startAt = instantFromKey(d.startDate);
    endAt = instantFromKey(addDays(d.endDate, 1));
  } else {
    if (!d.startTime || !d.endTime) {
      return { ok: false, error: "Les heures de début et de fin sont obligatoires." };
    }
    const [sh, sm] = parseTime(d.startTime);
    const [eh, em] = parseTime(d.endTime);
    startAt = instantFromKey(d.startDate, sh, sm);
    endAt = instantFromKey(d.endDate, eh, em);
    if (endAt.getTime() <= startAt.getTime()) {
      return { ok: false, error: "La fin doit être postérieure au début." };
    }
  }

  let recurrenceRule: string | null = null;
  if (d.recurrence) {
    if (d.recurrence.until && d.recurrence.until < d.startDate) {
      return { ok: false, error: "La fin de récurrence doit être postérieure au début." };
    }
    recurrenceRule = buildRule(normalizeRecurrence(d.recurrence, d.startDate));
  }

  return {
    ok: true,
    data: {
      title: d.title,
      description: d.description?.trim() ? d.description.trim() : null,
      category: d.category,
      allDay: d.allDay,
      location: d.location?.trim() ? d.location.trim() : null,
      assignedToId: d.assignedToId ?? null,
      participantIds: [...new Set(d.participantIds)],
      priority: d.priority,
      status: d.status,
      visibility: d.visibility,
      reminderMinutes: d.reminderMinutes ?? null,
      recurrenceRule,
      startAt,
      endAt,
    },
  };
}
