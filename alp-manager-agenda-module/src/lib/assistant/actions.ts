/*
 * Actions proposées par l'assistant : prévisualisation, confirmation et exécution réelle.
 * Une proposition ne modifie jamais les données. Seule la confirmation explicite de l'utilisateur
 * déclenche l'exécution, via les services existants (mêmes règles de droits que l'interface).
 */
import { createHash } from "node:crypto";
import { and, eq, gt, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { assistantActions, assistantToolCalls, calendarEvents } from "@/db/schema";
import { loadUserRefMap } from "@/lib/auth/users";
import { CATEGORIES, PRIORITIES, STATUSES, type CategoryKey, type PriorityKey, type StatusKey } from "@/lib/calendar/constants";
import * as calendarExtras from "@/lib/calendar/extras";
import { CalendarError, createEvent, deleteEvent, getEventDetail, isUuid, listCalendarRange, rescheduleOccurrence } from "@/lib/calendar/service";
import { addDays, dateKey, diffDays, formatDayLong, formatPeriod, instantFromKey, parseTime, pad2, timeOf } from "@/lib/calendar/time";
import type { CalendarUser, EventDto } from "@/lib/calendar/types";
import { parseEventFields, type ParsedEvent } from "@/lib/calendar/validation";
import * as crm from "@/lib/crm/service";
import { ACTION_SCHEMAS, type ActionKind } from "./schemas";
import { ACTION_STATUS_LABEL, COMPANY_TYPE_LABEL, DEAL_KIND_LABEL, DEAL_STAGE_LABEL, type ActionPreview, type ActionSnapshot, type ToolContext, type ToolOutcome } from "./types";

const PROPOSAL_TTL_MS = 30 * 60_000;

type ActionRow = typeof assistantActions.$inferSelect;
type Payload<K extends ActionKind> = z.output<(typeof ACTION_SCHEMAS)[K]>;
type ExecResult = { message: string; entityId?: string };

type Def<S extends z.ZodType> = {
  title: (p: z.output<S>) => string;
  dedupe: (p: z.output<S>) => string;
  preview: (ctx: ToolContext, p: z.output<S>) => Promise<ActionPreview>;
  execute: (ctx: ToolContext, p: z.output<S>) => Promise<ExecResult>;
};

type AnyDef = {
  title: (p: unknown) => string;
  dedupe: (p: unknown) => string;
  preview: (ctx: ToolContext, p: unknown) => Promise<ActionPreview>;
  execute: (ctx: ToolContext, p: unknown) => Promise<ExecResult>;
};

function define<S extends z.ZodType>(schema: S, def: Def<S>): AnyDef {
  return {
    title: (p) => def.title(schema.parse(p) as z.output<S>),
    dedupe: (p) => def.dedupe(schema.parse(p) as z.output<S>),
    preview: (ctx, p) => def.preview(ctx, schema.parse(p) as z.output<S>),
    execute: (ctx, p) => def.execute(ctx, schema.parse(p) as z.output<S>),
  };
}

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */

function messageOf(error: unknown): string {
  if (error instanceof CalendarError) return error.message;
  console.error("[assistant] erreur d'exécution", error);
  return "Une erreur technique est survenue. Aucune modification n'a été confirmée.";
}

function excerpt(text: string, max = 220): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function hmAdd(hm: string, minutes: number): string {
  const [h, m] = parseTime(hm);
  const total = h * 60 + m + minutes;
  if (total >= 24 * 60) {
    throw new CalendarError("L'événement se terminerait après minuit : choisissez une autre heure de début.", 400);
  }
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

async function requireEvent(viewer: CalendarUser, id: string) {
  const detail = await getEventDetail(viewer, id, null);
  if (!detail) throw new CalendarError("Événement introuvable ou non accessible.", 404);
  return detail;
}

function requireEditable(detail: { event: EventDto }): void {
  if (!detail.event.canEdit) throw new CalendarError("Vous n'avez pas les droits pour modifier cet événement.", 403);
}

function requireDeletable(detail: { event: EventDto }): void {
  if (!detail.event.canDelete) throw new CalendarError("Vous ne pouvez pas supprimer cet événement.", 403);
}

function parseOrThrow(raw: unknown): ParsedEvent {
  const result = parseEventFields(raw);
  if (!result.ok) throw new CalendarError(result.error, 400);
  return result.data;
}

function buildEventInput(viewer: CalendarUser, p: Payload<"event.create">): ParsedEvent {
  const base = {
    title: p.title,
    description: p.description ?? null,
    category: p.category,
    allDay: p.allDay,
    startDate: p.date,
    endDate: p.date,
    location: p.location ?? null,
    assignedToId: p.assigneeId ?? viewer.id,
    participantIds: p.participantIds,
    priority: "normal",
    status: "upcoming",
    visibility: "shared",
    reminderMinutes: p.reminderMinutes ?? null,
    recurrence: null,
  };
  if (p.allDay) return parseOrThrow({ ...base, startTime: null, endTime: null });
  if (!p.startTime) throw new CalendarError("L'heure de début est obligatoire pour un événement à horaire.", 400);
  const endTime = p.endTime ?? hmAdd(p.startTime, p.durationMinutes ?? 60);
  return parseOrThrow({ ...base, startTime: p.startTime, endTime });
}

/** Nouveau créneau d'un événement existant (date et heures demandées). */
function resolveSlot(
  event: EventDto,
  p: { date: string; startTime?: string | null; endTime?: string | null; durationMinutes?: number | null },
): { startAt: Date; endAt: Date } {
  if (event.allDay) {
    const span = Math.max(1, diffDays(dateKey(new Date(event.startAt)), dateKey(new Date(event.endAt))));
    return { startAt: instantFromKey(p.date), endAt: instantFromKey(addDays(p.date, span)) };
  }
  const [sh, sm] = parseTime(p.startTime ?? timeOf(new Date(event.startAt)));
  const startAt = instantFromKey(p.date, sh, sm);
  let endAt: Date;
  if (p.endTime) {
    const [eh, em] = parseTime(p.endTime);
    endAt = instantFromKey(p.date, eh, em);
  } else {
    const minutes =
      p.durationMinutes ?? (new Date(event.endAt).getTime() - new Date(event.startAt).getTime()) / 60_000;
    endAt = new Date(startAt.getTime() + minutes * 60_000);
  }
  if (endAt.getTime() <= startAt.getTime()) throw new CalendarError("La fin doit être postérieure au début.", 400);
  return { startAt, endAt };
}

function slotLabel(slot: { startAt: Date; endAt: Date }, date: string, allDay: boolean): string {
  return allDay ? `Journée entière · ${formatDayLong(date)}` : `${formatDayLong(date)} · ${timeOf(slot.startAt)}–${timeOf(slot.endAt)}`;
}

async function findSameEvent(viewerId: string, title: string, startAt: Date): Promise<boolean> {
  const [row] = await db
    .select({ id: calendarEvents.id })
    .from(calendarEvents)
    .where(and(eq(calendarEvents.createdBy, viewerId), eq(calendarEvents.title, title), eq(calendarEvents.startAt, startAt)))
    .limit(1);
  return Boolean(row);
}

async function conflictWarnings(viewer: CalendarUser, startAt: Date, endAt: Date, excludeId?: string): Promise<string[]> {
  const range = await listCalendarRange(viewer, startAt, endAt);
  const titles = new Map(range.events.map((e) => [e.id, e.title]));
  return range.occurrences
    .filter(
      (o) =>
        o.status !== "cancelled" &&
        o.eventId !== excludeId &&
        Date.parse(o.start) < endAt.getTime() &&
        Date.parse(o.end) > startAt.getTime(),
    )
    .slice(0, 3)
    .map((o) => `Chevauchement avec « ${titles.get(o.eventId) ?? "un événement"} » (${timeOf(new Date(o.start))}–${timeOf(new Date(o.end))}).`);
}

const CHANGE_LABELS: Record<string, string> = {
  title: "Titre",
  description: "Description",
  location: "Lieu",
  category: "Catégorie",
  priority: "Priorité",
  status: "Statut",
};

function currentValue(event: EventDto, key: string): string {
  switch (key) {
    case "title":
      return event.title;
    case "description":
      return event.description ?? "—";
    case "location":
      return event.location ?? "—";
    case "category":
      return CATEGORIES[event.category].label;
    case "priority":
      return PRIORITIES[event.priority].label;
    case "status":
      return STATUSES[event.status].label;
    default:
      return "—";
  }
}

function displayChange(key: string, value: string): string {
  if (key === "category" && value in CATEGORIES) return CATEGORIES[value as CategoryKey].label;
  if (key === "priority" && value in PRIORITIES) return PRIORITIES[value as PriorityKey].label;
  if (key === "status" && value in STATUSES) return STATUSES[value as StatusKey].label;
  return excerpt(value, 160);
}

async function userNamesFor(ids: string[]): Promise<string[]> {
  const users = await loadUserRefMap();
  return ids.map((id) => users.get(id)?.fullName ?? "—");
}

/* ------------------------------------------------------------------ */
/* Définitions des actions                                             */
/* ------------------------------------------------------------------ */

const DEFS: Record<ActionKind, AnyDef> = {
  "event.create": define(ACTION_SCHEMAS["event.create"], {
    title: (p) => `Créer « ${p.title} »`,
    dedupe: (p) => JSON.stringify(p),
    preview: async (ctx, p) => {
      const parsed = buildEventInput(ctx.viewer, p);
      const company = p.companyId ? await crm.getCompanyName(p.companyId) : null;
      if (p.companyId && !company) throw new CalendarError("Entreprise introuvable dans ALP Manager.", 404);
      const contact = p.contactId ? await crm.getContact(p.contactId) : null;
      if (p.contactId && !contact) throw new CalendarError("Contact introuvable dans ALP Manager.", 404);
      const deal = p.dealId ? await crm.getDeal(p.dealId) : null;
      if (p.dealId && !deal) throw new CalendarError("Affaire introuvable dans ALP Manager.", 404);
      const [responsable] = await userNamesFor([parsed.assignedToId ?? ctx.viewer.id]);
      const participants = await userNamesFor(parsed.participantIds);
      const warnings = await conflictWarnings(ctx.viewer, parsed.startAt, parsed.endAt);
      if (await findSameEvent(ctx.viewer.id, parsed.title, parsed.startAt)) {
        warnings.unshift("Un événement identique existe déjà : la création sera refusée.");
      }
      return {
        summary: `${p.title} · ${formatDayLong(p.date)}`,
        fields: [
          { label: "Catégorie", value: CATEGORIES[p.category].label },
          { label: "Date", value: formatDayLong(p.date) },
          { label: "Horaire", value: p.allDay ? "Journée entière" : `${timeOf(parsed.startAt)} – ${timeOf(parsed.endAt)}` },
          { label: "Responsable", value: responsable ?? "—" },
          { label: "Participants", value: participants.join(", ") || "Aucun" },
          { label: "Lieu", value: parsed.location ?? "—" },
          { label: "Entreprise", value: company ?? "—" },
          { label: "Contact", value: contact?.name ?? "—" },
          { label: "Affaire", value: deal?.name ?? "—" },
          { label: "Rappel", value: parsed.reminderMinutes ? `${parsed.reminderMinutes} min avant` : "Aucun" },
        ],
        warnings,
      };
    },
    execute: async (ctx, p) => {
      const parsed = buildEventInput(ctx.viewer, p);
      if (await findSameEvent(ctx.viewer.id, parsed.title, parsed.startAt)) {
        throw new CalendarError("Un événement identique existe déjà : création annulée pour éviter un doublon.", 409);
      }
      const id = await createEvent(ctx.viewer, parsed);
      if (p.companyId || p.contactId || p.dealId) {
        await calendarExtras.setCrmLinks(ctx.viewer, id, {
          companyId: p.companyId ?? undefined,
          contactId: p.contactId ?? undefined,
          dealId: p.dealId ?? undefined,
        });
      }
      return { message: `Événement « ${p.title} » créé le ${formatDayLong(p.date)}.`, entityId: id };
    },
  }),

  "event.update": define(ACTION_SCHEMAS["event.update"], {
    title: () => "Modifier l'événement",
    dedupe: (p) => JSON.stringify(p),
    preview: async (ctx, p) => {
      const detail = await requireEvent(ctx.viewer, p.eventId);
      requireEditable(detail);
      const fields = Object.entries(p.changes)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => ({
          label: CHANGE_LABELS[key] ?? key,
          value: `${currentValue(detail.event, key)} → ${displayChange(key, String(value))}`,
        }));
      return { summary: `Modifier « ${detail.event.title} »`, fields, warnings: [] };
    },
    execute: async (ctx, p) => {
      await calendarExtras.patchEventFields(ctx.viewer, p.eventId, p.changes);
      return { message: "Événement mis à jour.", entityId: p.eventId };
    },
  }),

  "event.move": define(ACTION_SCHEMAS["event.move"], {
    title: () => "Déplacer l'événement",
    dedupe: (p) => JSON.stringify(p),
    preview: async (ctx, p) => {
      const detail = await requireEvent(ctx.viewer, p.eventId);
      requireEditable(detail);
      if (detail.occurrence.isRecurring) {
        throw new CalendarError("Cet événement est récurrent : déplacez l'occurrence depuis la fiche de l'agenda.", 400);
      }
      const slot = resolveSlot(detail.event, p);
      const warnings = await conflictWarnings(ctx.viewer, slot.startAt, slot.endAt, p.eventId);
      return {
        summary: `Déplacer « ${detail.event.title} » au ${formatDayLong(p.date)}`,
        fields: [
          {
            label: "Actuel",
            value: formatPeriod(new Date(detail.event.startAt), new Date(detail.event.endAt), detail.event.allDay),
          },
          { label: "Nouveau", value: slotLabel(slot, p.date, detail.event.allDay) },
        ],
        warnings,
      };
    },
    execute: async (ctx, p) => {
      const detail = await requireEvent(ctx.viewer, p.eventId);
      requireEditable(detail);
      if (detail.occurrence.isRecurring) {
        throw new CalendarError("Cet événement est récurrent : déplacez l'occurrence depuis la fiche de l'agenda.", 400);
      }
      const slot = resolveSlot(detail.event, p);
      await rescheduleOccurrence(ctx.viewer, p.eventId, {
        occurrenceStart: null,
        startAt: slot.startAt,
        endAt: slot.endAt,
        applyToSeries: false,
      });
      return { message: `Événement déplacé au ${formatDayLong(p.date)}.`, entityId: p.eventId };
    },
  }),

  "event.delete": define(ACTION_SCHEMAS["event.delete"], {
    title: () => "Supprimer l'événement",
    dedupe: (p) => JSON.stringify(p),
    preview: async (ctx, p) => {
      const detail = await requireEvent(ctx.viewer, p.eventId);
      requireDeletable(detail);
      return {
        summary: `Supprimer « ${detail.event.title} »`,
        fields: [
          {
            label: "Date",
            value: formatPeriod(new Date(detail.event.startAt), new Date(detail.event.endAt), detail.event.allDay),
          },
          { label: "Responsable", value: detail.event.assignedTo?.fullName ?? "—" },
        ],
        warnings: [
          detail.occurrence.isRecurring
            ? "Série récurrente : toutes ses occurrences seront supprimées."
            : "Suppression définitive.",
        ],
      };
    },
    execute: async (ctx, p) => {
      const detail = await requireEvent(ctx.viewer, p.eventId);
      requireDeletable(detail);
      await deleteEvent(ctx.viewer, p.eventId, null, "series");
      return { message: `Événement « ${detail.event.title} » supprimé.`, entityId: p.eventId };
    },
  }),

  "event.describe": define(ACTION_SCHEMAS["event.describe"], {
    title: () => "Ajouter une description",
    dedupe: (p) => JSON.stringify(p),
    preview: async (ctx, p) => {
      const detail = await requireEvent(ctx.viewer, p.eventId);
      requireEditable(detail);
      const current = detail.event.description ?? "";
      return {
        summary: `Description de « ${detail.event.title} »`,
        fields: [
          { label: "Mode", value: p.mode === "append" ? "Ajout à la suite" : "Remplacement" },
          { label: "Nouveau texte", value: excerpt(p.text) },
          { label: "Description actuelle", value: current ? excerpt(current, 140) : "Aucune" },
        ],
        warnings: p.mode === "replace" && current ? ["La description actuelle sera remplacée."] : [],
      };
    },
    execute: async (ctx, p) => {
      const detail = await requireEvent(ctx.viewer, p.eventId);
      requireEditable(detail);
      const current = (detail.event.description ?? "").trim();
      const next = p.mode === "append" && current ? `${current}\n\n${p.text}` : p.text;
      await calendarExtras.patchEventFields(ctx.viewer, p.eventId, { description: next });
      return { message: "Description mise à jour.", entityId: p.eventId };
    },
  }),

  "event.link_crm": define(ACTION_SCHEMAS["event.link_crm"], {
    title: () => "Associer à ALP Manager CRM",
    dedupe: (p) => JSON.stringify(p),
    preview: async (ctx, p) => {
      const detail = await requireEvent(ctx.viewer, p.eventId);
      requireEditable(detail);
      const company = p.companyId ? await crm.getCompanyName(p.companyId) : null;
      if (p.companyId && !company) throw new CalendarError("Entreprise introuvable dans ALP Manager.", 404);
      const contact = p.contactId ? await crm.getContact(p.contactId) : null;
      if (p.contactId && !contact) throw new CalendarError("Contact introuvable dans ALP Manager.", 404);
      const deal = p.dealId ? await crm.getDeal(p.dealId) : null;
      if (p.dealId && !deal) throw new CalendarError("Affaire introuvable dans ALP Manager.", 404);
      return {
        summary: `Associer « ${detail.event.title} »`,
        fields: [
          { label: "Entreprise", value: company ?? "Inchangée" },
          { label: "Contact", value: contact?.name ?? "Inchangé" },
          { label: "Affaire", value: deal?.name ?? "Inchangée" },
        ],
        warnings: [],
      };
    },
    execute: async (ctx, p) => {
      await calendarExtras.setCrmLinks(ctx.viewer, p.eventId, {
        companyId: p.companyId ?? undefined,
        contactId: p.contactId ?? undefined,
        dealId: p.dealId ?? undefined,
      });
      return { message: "Liaison CRM enregistrée.", entityId: p.eventId };
    },
  }),

  "event.add_participants": define(ACTION_SCHEMAS["event.add_participants"], {
    title: () => "Ajouter des participants",
    dedupe: (p) => JSON.stringify(p),
    preview: async (ctx, p) => {
      const detail = await requireEvent(ctx.viewer, p.eventId);
      requireEditable(detail);
      const names = await userNamesFor(p.userIds);
      if (names.includes("—")) throw new CalendarError("Un collaborateur sélectionné est introuvable.", 400);
      return {
        summary: `Participants de « ${detail.event.title} »`,
        fields: [{ label: "Ajouter", value: names.join(", ") }],
        warnings: [],
      };
    },
    execute: async (ctx, p) => {
      await calendarExtras.addParticipants(ctx.viewer, p.eventId, p.userIds);
      return { message: "Participants ajoutés.", entityId: p.eventId };
    },
  }),

  "event.report": define(ACTION_SCHEMAS["event.report"], {
    title: () => "Enregistrer un compte rendu",
    dedupe: (p) => JSON.stringify(p),
    preview: async (ctx, p) => {
      const detail = await requireEvent(ctx.viewer, p.eventId);
      requireEditable(detail);
      return {
        summary: `Compte rendu de « ${detail.event.title} »`,
        fields: [{ label: "Compte rendu", value: excerpt(p.report, 400) }],
        warnings: ["Un compte rendu déjà enregistré sera remplacé."],
      };
    },
    execute: async (ctx, p) => {
      await calendarExtras.setReport(ctx.viewer, p.eventId, p.report);
      return { message: "Compte rendu enregistré.", entityId: p.eventId };
    },
  }),

  "event.follow_up": define(ACTION_SCHEMAS["event.follow_up"], {
    title: (p) => `Tâche de suivi « ${p.title} »`,
    dedupe: (p) => JSON.stringify(p),
    preview: async (ctx, p) => {
      const company = p.companyId ? await crm.getCompanyName(p.companyId) : null;
      if (p.companyId && !company) throw new CalendarError("Entreprise introuvable dans ALP Manager.", 404);
      const deal = p.dealId ? await crm.getDeal(p.dealId) : null;
      if (p.dealId && !deal) throw new CalendarError("Affaire introuvable dans ALP Manager.", 404);
      const [responsable] = await userNamesFor([p.assigneeId ?? ctx.viewer.id]);
      const warnings: string[] = [];
      if (await findSameEvent(ctx.viewer.id, p.title, instantFromKey(p.dueDate))) {
        warnings.push("Une tâche identique existe déjà à cette date.");
      }
      return {
        summary: `Tâche de suivi pour le ${formatDayLong(p.dueDate)}`,
        fields: [
          { label: "Tâche", value: p.title },
          { label: "Échéance", value: formatDayLong(p.dueDate) },
          { label: "Responsable", value: responsable ?? "—" },
          { label: "Entreprise", value: company ?? "—" },
          { label: "Affaire", value: deal?.name ?? "—" },
        ],
        warnings,
      };
    },
    execute: async (ctx, p) => {
      if (await findSameEvent(ctx.viewer.id, p.title, instantFromKey(p.dueDate))) {
        throw new CalendarError("Une tâche identique existe déjà à cette date : création annulée.", 409);
      }
      const id = await calendarExtras.createFollowUp(ctx.viewer, p);
      return { message: `Tâche de suivi créée pour le ${formatDayLong(p.dueDate)}.`, entityId: id };
    },
  }),

  "crm.company.create": define(ACTION_SCHEMAS["crm.company.create"], {
    title: (p) => `Créer l'entreprise « ${p.name} »`,
    dedupe: (p) => JSON.stringify(p),
    preview: async (_ctx, p) => {
      const existing = await crm.findCompanyByName(p.name);
      return {
        summary: `Nouvelle entreprise : ${p.name}`,
        fields: [
          { label: "Type", value: COMPANY_TYPE_LABEL[p.type] ?? p.type },
          { label: "Ville", value: p.city ?? "—" },
          { label: "Secteur", value: p.sector ?? "—" },
        ],
        warnings: existing ? ["Une entreprise portant ce nom existe déjà : la création sera refusée."] : [],
      };
    },
    execute: async (ctx, p) => {
      const id = await crm.createCompany(ctx.viewer, p);
      return { message: `Entreprise « ${p.name} » créée dans ALP Manager.`, entityId: id };
    },
  }),

  "crm.deal.create": define(ACTION_SCHEMAS["crm.deal.create"], {
    title: (p) => `Créer l'affaire « ${p.name} »`,
    dedupe: (p) => JSON.stringify(p),
    preview: async (_ctx, p) => {
      const company = await crm.getCompanyName(p.companyId);
      if (!company) throw new CalendarError("Entreprise introuvable dans ALP Manager. Créez-la d'abord.", 404);
      return {
        summary: `Nouvelle affaire pour ${company}`,
        fields: [
          { label: "Entreprise", value: company },
          { label: "Affaire", value: p.name },
          { label: "Type", value: DEAL_KIND_LABEL[p.kind] ?? p.kind },
          { label: "Étape", value: DEAL_STAGE_LABEL[p.stage] ?? p.stage },
          { label: "Montant", value: p.amountEur ? `${p.amountEur.toLocaleString("fr-FR")} €` : "Non renseigné" },
          { label: "Échéance", value: p.expectedCloseDate ? formatDayLong(p.expectedCloseDate) : "Non renseignée" },
          { label: "Gamme", value: p.productLine ?? "—" },
        ],
        warnings: [],
      };
    },
    execute: async (ctx, p) => {
      const id = await crm.createDeal(ctx.viewer, p);
      return { message: `Affaire « ${p.name} » créée.`, entityId: id };
    },
  }),
};

/* ------------------------------------------------------------------ */
/* Cycle de vie : proposition, confirmation, annulation                */
/* ------------------------------------------------------------------ */

export function snapshotOf(row: ActionRow, now = new Date()): ActionSnapshot {
  const expired = row.status === "pending" && row.expiresAt.getTime() <= now.getTime();
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    status: expired ? "expired" : row.status,
    preview: row.preview as unknown as ActionPreview,
    result: (row.result as { message?: string } | null)?.message ?? null,
    error: row.error,
    expiresAt: row.expiresAt.toISOString(),
  };
}

export async function proposeAction(ctx: ToolContext, kind: ActionKind, rawArgs: unknown): Promise<ToolOutcome> {
  const def = DEFS[kind];
  const schema: z.ZodType = ACTION_SCHEMAS[kind];
  const parsed = schema.safeParse(rawArgs);
  if (!parsed.success) {
    return { ok: false, error: `Paramètres invalides : ${parsed.error.issues[0]?.message ?? "données incorrectes"}.` };
  }

  let preview: ActionPreview;
  try {
    preview = await def.preview(ctx, parsed.data);
  } catch (error) {
    return { ok: false, error: messageOf(error) };
  }

  const dedupeKey = createHash("sha256").update(`${kind}|${ctx.viewer.id}|${def.dedupe(parsed.data)}`).digest("hex");
  const [existing] = await db
    .select()
    .from(assistantActions)
    .where(
      and(
        eq(assistantActions.userId, ctx.viewer.id),
        eq(assistantActions.dedupeKey, dedupeKey),
        eq(assistantActions.status, "pending"),
        gt(assistantActions.expiresAt, ctx.now),
      ),
    )
    .limit(1);
  if (existing) {
    return {
      ok: true,
      summary: `Cette demande est déjà en attente de confirmation : « ${existing.title} ».`,
      data: { actionId: existing.id, status: "pending", alreadyPending: true },
      blocks: [{ type: "action", action: snapshotOf(existing, ctx.now) }],
    };
  }

  const [row] = await db
    .insert(assistantActions)
    .values({
      userId: ctx.viewer.id,
      conversationId: ctx.conversationId,
      kind,
      title: def.title(parsed.data),
      payload: parsed.data as unknown as Record<string, unknown>,
      preview: preview as unknown as Record<string, unknown>,
      status: "pending",
      dedupeKey,
      expiresAt: new Date(ctx.now.getTime() + PROPOSAL_TTL_MS),
    })
    .returning();

  return {
    ok: true,
    summary: `Action proposée : ${row.title}. Elle ne sera exécutée qu'après votre confirmation.`,
    data: { actionId: row.id, status: "pending", title: row.title, warnings: preview.warnings, fields: preview.fields },
    blocks: [{ type: "action", action: snapshotOf(row, ctx.now) }],
  };
}

async function loadOwned(userId: string, actionId: string): Promise<ActionRow> {
  if (!isUuid(actionId)) throw new CalendarError("Action introuvable.", 404);
  const [row] = await db
    .select()
    .from(assistantActions)
    .where(and(eq(assistantActions.id, actionId), eq(assistantActions.userId, userId)))
    .limit(1);
  if (!row) throw new CalendarError("Action introuvable.", 404);
  return row;
}

async function logExecution(
  viewer: CalendarUser,
  conversationId: string | null,
  kind: string,
  actionId: string,
  ok: boolean,
  message: string,
  started: number,
): Promise<void> {
  try {
    await db.insert(assistantToolCalls).values({
      userId: viewer.id,
      conversationId,
      toolName: `action:${kind}`,
      mode: "execute",
      args: { actionId },
      ok,
      resultSummary: ok ? message.slice(0, 500) : null,
      error: ok ? null : message.slice(0, 500),
      durationMs: Date.now() - started,
    });
  } catch (error) {
    console.error("[assistant] journalisation impossible", error);
  }
}

/** Confirmation explicite : revendique l'action (une seule exécution), puis l'exécute réellement. */
export async function confirmAction(viewer: CalendarUser, actionId: string, now = new Date()): Promise<ActionSnapshot> {
  const row = await loadOwned(viewer.id, actionId);
  if (row.status !== "pending") {
    throw new CalendarError(`Cette action est déjà ${ACTION_STATUS_LABEL[row.status].toLowerCase()}.`, 409);
  }
  if (row.expiresAt.getTime() <= now.getTime()) {
    await db.update(assistantActions).set({ status: "expired", updatedAt: now }).where(eq(assistantActions.id, actionId));
    throw new CalendarError("Cette proposition a expiré. Demandez-la à nouveau.", 410);
  }

  const [claimed] = await db
    .update(assistantActions)
    .set({ status: "confirmed", decidedAt: now, updatedAt: now })
    .where(and(eq(assistantActions.id, actionId), eq(assistantActions.status, "pending")))
    .returning();
  if (!claimed) throw new CalendarError("Cette action vient d'être traitée.", 409);

  const started = Date.now();
  let finalRow: ActionRow;
  try {
    const def = DEFS[row.kind as ActionKind];
    if (!def) throw new CalendarError("Type d'action inconnu.", 400);
    const outcome = await def.execute({ viewer, conversationId: row.conversationId, now }, row.payload);
    [finalRow] = await db
      .update(assistantActions)
      .set({
        status: "executed",
        result: { message: outcome.message, entityId: outcome.entityId ?? null },
        executedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(assistantActions.id, actionId))
      .returning();
    await logExecution(viewer, row.conversationId, row.kind, actionId, true, outcome.message, started);
  } catch (error) {
    const message = messageOf(error);
    [finalRow] = await db
      .update(assistantActions)
      .set({ status: "failed", error: message, updatedAt: new Date() })
      .where(eq(assistantActions.id, actionId))
      .returning();
    await logExecution(viewer, row.conversationId, row.kind, actionId, false, message, started);
  }
  return snapshotOf(finalRow, now);
}

export async function cancelAction(viewer: CalendarUser, actionId: string, now = new Date()): Promise<ActionSnapshot> {
  const row = await loadOwned(viewer.id, actionId);
  if (row.status !== "pending") {
    throw new CalendarError(`Cette action est déjà ${ACTION_STATUS_LABEL[row.status].toLowerCase()}.`, 409);
  }
  const [updated] = await db
    .update(assistantActions)
    .set({ status: "cancelled", decidedAt: now, updatedAt: now })
    .where(and(eq(assistantActions.id, actionId), eq(assistantActions.status, "pending")))
    .returning();
  if (!updated) throw new CalendarError("Cette action vient d'être traitée.", 409);
  return snapshotOf(updated, now);
}

/** État courant des actions référencées par des messages (rechargement d'une conversation). */
export async function currentActionSnapshots(userId: string, ids: string[], now = new Date()): Promise<Map<string, ActionSnapshot>> {
  const valid = ids.filter(isUuid);
  if (valid.length === 0) return new Map();
  const rows = await db
    .select()
    .from(assistantActions)
    .where(and(eq(assistantActions.userId, userId), inArray(assistantActions.id, valid)));
  return new Map(rows.map((r) => [r.id, snapshotOf(r, now)]));
}


