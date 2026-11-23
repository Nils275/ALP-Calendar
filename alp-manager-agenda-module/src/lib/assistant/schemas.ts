/* Schémas Zod des outils de lecture et des actions proposées. Ils servent à la fois à valider et à décrire les outils au modèle. */
import { z } from "zod";
import { CATEGORY_KEYS, PRIORITY_KEYS, STATUS_KEYS } from "@/lib/calendar/constants";

export const COMPANY_TYPE_KEYS = ["client", "prospect", "partenaire", "fournisseur", "autre"] as const;
export const DEAL_KIND_KEYS = ["devis", "commande", "revision", "sav", "projet", "autre"] as const;
export const DEAL_STAGE_KEYS = [
  "lead",
  "quote_sent",
  "negotiation",
  "order",
  "production",
  "delivered",
  "won",
  "lost",
] as const;
export const WINDOW_KEYS = ["journee", "matin", "apres-midi"] as const;

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date attendue au format AAAA-MM-JJ");
const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "heure attendue au format HH:mm");
const uuid = z.uuid();
const minutes = z.number().int().min(15).max(1440);

export const READ_SCHEMAS = {
  agenda_overview: z.object({ from: dayKey, to: dayKey }),
  agenda_find: z.object({
    query: z.string().min(2).max(120),
    from: dayKey.optional(),
    to: dayKey.optional(),
  }),
  agenda_availability: z.object({
    from: dayKey,
    to: dayKey,
    durationMinutes: z.number().int().min(15).max(480).default(60),
    window: z.enum(WINDOW_KEYS).default("journee"),
  }),
  agenda_conflicts: z.object({ from: dayKey, to: dayKey }),
  agenda_busy_days: z.object({ from: dayKey, to: dayKey }),
  agenda_upcoming: z.object({ days: z.number().int().min(1).max(60).default(7) }),
  agenda_missing_followup: z.object({ days: z.number().int().min(1).max(120).default(30) }),
  team_members: z.object({}),
  crm_search: z.object({
    query: z.string().min(2).max(120),
    limit: z.number().int().min(1).max(25).default(10),
  }),
  crm_company_briefing: z.object({ companyId: uuid }),
  crm_open_deals: z.object({
    kind: z.enum(DEAL_KIND_KEYS).optional(),
    stage: z.enum(DEAL_STAGE_KEYS).optional(),
    limit: z.number().int().min(1).max(50).default(15),
  }),
  crm_recontact_candidates: z.object({
    days: z.number().int().min(1).max(365).default(14),
    kind: z.enum(DEAL_KIND_KEYS).optional(),
    stage: z.enum(DEAL_STAGE_KEYS).optional(),
  }),
  hubspot_status: z.object({}),
  briefing_today: z.object({}),
};

export const ACTION_SCHEMAS = {
  "event.create": z.object({
    title: z.string().trim().min(1).max(160),
    description: z.string().max(3000).nullish(),
    category: z.enum(CATEGORY_KEYS),
    date: dayKey,
    allDay: z.boolean().default(false),
    startTime: hm.nullish(),
    endTime: hm.nullish(),
    durationMinutes: minutes.nullish(),
    location: z.string().max(200).nullish(),
    assigneeId: uuid.nullish(),
    participantIds: z.array(uuid).max(30).default([]),
    companyId: uuid.nullish(),
    contactId: uuid.nullish(),
    dealId: uuid.nullish(),
    reminderMinutes: z.union([z.literal(15), z.literal(30), z.literal(60), z.literal(1440)]).nullish(),
  }),
  "event.update": z.object({
    eventId: uuid,
    changes: z
      .object({
        title: z.string().trim().min(1).max(160).optional(),
        description: z.string().max(3000).optional(),
        location: z.string().max(200).optional(),
        category: z.enum(CATEGORY_KEYS).optional(),
        priority: z.enum(PRIORITY_KEYS).optional(),
        status: z.enum(STATUS_KEYS).optional(),
      })
      .refine((c) => Object.values(c).some((v) => v !== undefined), "aucune modification demandée"),
  }),
  "event.move": z.object({
    eventId: uuid,
    date: dayKey,
    startTime: hm.nullish(),
    endTime: hm.nullish(),
    durationMinutes: minutes.nullish(),
  }),
  "event.delete": z.object({ eventId: uuid }),
  "event.describe": z.object({
    eventId: uuid,
    text: z.string().trim().min(1).max(3000),
    mode: z.enum(["append", "replace"]).default("append"),
  }),
  "event.link_crm": z
    .object({
      eventId: uuid,
      companyId: uuid.nullish(),
      contactId: uuid.nullish(),
      dealId: uuid.nullish(),
    })
    .refine(
      (v) => Boolean(v.companyId || v.contactId || v.dealId),
      "au moins une entreprise, un contact ou une affaire est requis",
    ),
  "event.add_participants": z.object({
    eventId: uuid,
    userIds: z.array(uuid).min(1).max(30),
  }),
  "event.report": z.object({
    eventId: uuid,
    report: z.string().trim().min(3).max(5000),
  }),
  "event.follow_up": z.object({
    title: z.string().trim().min(1).max(160),
    dueDate: dayKey,
    description: z.string().max(3000).nullish(),
    companyId: uuid.nullish(),
    dealId: uuid.nullish(),
    assigneeId: uuid.nullish(),
  }),
  "crm.company.create": z.object({
    name: z.string().trim().min(2).max(160),
    type: z.enum(COMPANY_TYPE_KEYS).default("prospect"),
    city: z.string().max(120).nullish(),
    sector: z.string().max(120).nullish(),
    notes: z.string().max(3000).nullish(),
  }),
  "crm.deal.create": z.object({
    companyId: uuid,
    name: z.string().trim().min(2).max(160),
    kind: z.enum(DEAL_KIND_KEYS),
    stage: z.enum(DEAL_STAGE_KEYS).default("lead"),
    amountEur: z.number().int().min(0).max(100_000_000).nullish(),
    expectedCloseDate: dayKey.nullish(),
    productLine: z.string().max(120).nullish(),
  }),
};

export type ActionKind = keyof typeof ACTION_SCHEMAS;
