import { z } from "zod";

const dateKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ");
const timeKey = z.string().regex(/^\d{2}:\d{2}$/, "Heure attendue au format HH:mm");

export const recurrenceInputSchema = z.object({
  freq: z.enum(["DAILY", "WEEKLY", "MONTHLY"]).nullable().optional(),
  interval: z.number().int().min(1).max(12).optional(),
  byDay: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  until: dateKey.nullable().optional(),
  count: z.number().int().min(1).max(104).nullable().optional(),
});

export const eventInputSchema = z.object({
  title: z.string().trim().min(2, "Titre trop court").max(180),
  description: z.string().max(6000).nullable().optional(),
  category: z.string().min(1),
  startDate: dateKey,
  startTime: timeKey.optional(),
  endDate: dateKey,
  endTime: timeKey.optional(),
  allDay: z.boolean().default(false),
  location: z.string().max(220).nullable().optional(),
  assignedTo: z.number().int().positive().nullable().optional(),
  participantIds: z.array(z.number().int().positive()).max(50).default([]),
  priority: z.enum(["basse", "normale", "haute", "urgente"]).default("normale"),
  status: z.enum(["a_venir", "en_cours", "termine", "annule"]).default("a_venir"),
  visibility: z.enum(["partage", "prive"]).default("partage"),
  reminder: z.number().int().min(0).max(10080).default(0),
  recurrence: recurrenceInputSchema.nullable().optional(),
});

export type EventInput = z.infer<typeof eventInputSchema>;

export const eventMutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update"),
    scope: z.enum(["series", "occurrence"]).default("series"),
    occurrenceDate: dateKey.optional(),
    event: eventInputSchema,
  }),
  z.object({
    action: z.literal("status"),
    status: z.enum(["a_venir", "en_cours", "termine", "annule"]),
    scope: z.enum(["series", "occurrence"]).default("series"),
    occurrenceDate: dateKey.optional(),
  }),
  z.object({
    action: z.literal("reschedule"),
    scope: z.enum(["series", "occurrence"]).default("series"),
    occurrenceDate: dateKey.optional(),
    startAt: z.string().min(10),
    endAt: z.string().min(10),
  }),
  z.object({
    action: z.literal("duplicate"),
    occurrenceDate: dateKey.optional(),
  }),
]);

export type EventMutation = z.infer<typeof eventMutationSchema>;

export const eventListQuerySchema = z.object({
  from: dateKey,
  to: dateKey,
  categories: z.string().optional(),
  assignee: z.string().optional(),
  search: z.string().max(160).optional(),
  scope: z.enum(["all", "mine"]).optional(),
  status: z.enum(["all", "a_venir", "en_cours", "termine", "annule", "en_retard"]).optional(),
  view: z.enum(["day", "week", "month", "list"]).optional(),
});
