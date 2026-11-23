/*
 * Conversion des objets HubSpot (transactions, projets, tâches, réunions) en événements d'agenda.
 * Module pur : aucune base de données, aucun appel réseau — testable seul.
 */
import type { CategoryKey } from "@/lib/calendar/constants";
import { addDays, dateKey, instantFromKey } from "@/lib/calendar/time";
import type { HubSpotProperty, HubSpotRecord } from "./hubspot";

export type DraftEvent = {
  /** Identifiant stable et unique par source (anti-doublon). */
  externalId: string;
  externalObjectType: "task" | "deal" | "project" | "custom";
  externalObjectId: string;
  externalUrl: string | null;
  title: string;
  description: string | null;
  category: CategoryKey;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  location: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  status: "upcoming" | "in_progress" | "done" | "cancelled";
  /** Identifiant du propriétaire HubSpot (à rapprocher d'un collaborateur). */
  ownerId: string | null;
};

export const HUBSPOT_TYPE_IDS = { deals: "0-3", tasks: "0-27", meetings: "0-47" } as const;

/* ------------------------------------------------------------------ */
/* Règles de dates (transactions et projets)                           */
/* ------------------------------------------------------------------ */

export type DateRule = {
  key: string;
  /** Libellés HubSpot reconnus (comparaison sans accents ni casse). */
  labels: string[];
  /** Noms internes à essayer en premier (propriétés standard). */
  internal: string[];
  category: CategoryKey;
  prefix: string;
  /** Statut d'un événement dont la date est passée. */
  whenPast: "done" | "upcoming";
};

/** À modifier ici pour changer ce qui apparaît dans l'agenda. */
export const DATE_RULES: DateRule[] = [
  { key: "delivery", labels: ["Date livraison", "Date de livraison"], internal: [], category: "livraison", prefix: "Livraison", whenPast: "upcoming" },
  { key: "close", labels: ["Date de fermeture"], internal: ["closedate"], category: "commercial", prefix: "Clôture", whenPast: "done" },
  { key: "created", labels: ["Date de création"], internal: ["createdate", "hs_createdate"], category: "administratif", prefix: "Création", whenPast: "done" },
];

export function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type ResolvedRule = { rule: DateRule; property: HubSpotProperty };

/** Retrouve, pour chaque règle, la propriété HubSpot correspondante (nom interne puis libellé). */
export function resolveRules(rules: DateRule[], properties: HubSpotProperty[]): { resolved: ResolvedRule[]; unresolved: DateRule[] } {
  const resolved: ResolvedRule[] = [];
  const unresolved: DateRule[] = [];
  for (const rule of rules) {
    const dateLike = (p: HubSpotProperty) => p.type === "date" || p.type === "datetime";
    const wanted = new Set(rule.labels.map(normalizeLabel));
    const property =
      properties.find((p) => rule.internal.includes(p.name) && dateLike(p)) ??
      properties.find((p) => dateLike(p) && wanted.has(normalizeLabel(p.label)));
    if (property) resolved.push({ rule, property });
    else unresolved.push(rule);
  }
  return { resolved, unresolved };
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

export type HsDate = { kind: "day"; key: string } | { kind: "instant"; at: Date };

/**
 * HubSpot renvoie soit "YYYY-MM-DD" (propriété de type date), soit un horodatage ISO ou en millisecondes.
 * Un horodatage exactement à minuit UTC est une date sans heure : on la traite comme un jour civil.
 */
export function parseHsDate(value: string | null | undefined): HsDate | null {
  if (!value) return null;
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return { kind: "day", key: v };
  const ms = /^\d{10,}$/.test(v) ? Number(v) : Date.parse(v);
  if (!Number.isFinite(ms)) return null;
  if (ms % 86_400_000 === 0) return { kind: "day", key: new Date(ms).toISOString().slice(0, 10) };
  return { kind: "instant", at: new Date(ms) };
}

export function toDayKey(value: HsDate): string {
  return value.kind === "day" ? value.key : dateKey(value.at);
}

function allDayRange(key: string): { startAt: Date; endAt: Date } {
  return { startAt: instantFromKey(key), endAt: instantFromKey(addDays(key, 1)) };
}

/* ------------------------------------------------------------------ */
/* Liens vers les fiches HubSpot                                       */
/* ------------------------------------------------------------------ */

export type LinkContext = { appBase: string; portalId: string | null };

export function recordUrl(ctx: LinkContext, typeId: string | null, id: string): string | null {
  if (!ctx.portalId || !typeId) return null;
  return `${ctx.appBase.replace(/\/$/, "")}/contacts/${ctx.portalId}/record/${typeId}/${id}`;
}

/* ------------------------------------------------------------------ */
/* Transactions / projets : une ligne d'agenda par date                */
/* ------------------------------------------------------------------ */

export type DateRecordContext = {
  kind: "deal" | "project";
  typeId: string | null;
  nameProperty: string;
  fallbackName: string;
  resolved: ResolvedRule[];
  window: { fromKey: string; toKey: string };
  todayKey: string;
  link: LinkContext;
};

export function draftsFromDateRecord(record: HubSpotRecord, ctx: DateRecordContext): DraftEvent[] {
  const name = record.properties[ctx.nameProperty]?.trim() || `${ctx.fallbackName} ${record.id}`;
  const label = ctx.kind === "deal" ? "Transaction" : "Projet";
  const out: DraftEvent[] = [];

  for (const { rule, property } of ctx.resolved) {
    const parsed = parseHsDate(record.properties[property.name]);
    if (!parsed) continue;
    const key = toDayKey(parsed);
    if (key < ctx.window.fromKey || key > ctx.window.toKey) continue;

    const { startAt, endAt } = allDayRange(key);
    out.push({
      externalId: `${ctx.kind}:${record.id}:${rule.key}`,
      externalObjectType: ctx.kind,
      externalObjectId: record.id,
      externalUrl: recordUrl(ctx.link, ctx.typeId, record.id),
      title: `${rule.prefix} — ${name}`,
      description: `${label} HubSpot « ${name} » — ${property.label}.`,
      category: rule.category,
      startAt,
      endAt,
      allDay: true,
      location: null,
      priority: "normal",
      status: key < ctx.todayKey && rule.whenPast === "done" ? "done" : "upcoming",
      ownerId: record.properties.hubspot_owner_id ?? null,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Tâches                                                              */
/* ------------------------------------------------------------------ */

export const TASK_PROPERTIES = [
  "hs_task_subject",
  "hs_task_body",
  "hs_timestamp",
  "hs_task_status",
  "hs_task_priority",
  "hs_task_type",
  "hubspot_owner_id",
];

export function draftFromTask(record: HubSpotRecord, link: LinkContext): DraftEvent | null {
  const p = record.properties;
  const due = parseHsDate(p.hs_timestamp);
  if (!due) return null;

  const range =
    due.kind === "day"
      ? allDayRange(due.key)
      : { startAt: due.at, endAt: new Date(due.at.getTime() + 30 * 60_000) };

  const status = (p.hs_task_status ?? "").toUpperCase();
  const priority = (p.hs_task_priority ?? "").toUpperCase();
  const type = (p.hs_task_type ?? "").toUpperCase();

  return {
    externalId: `task:${record.id}`,
    externalObjectType: "task",
    externalObjectId: record.id,
    externalUrl: recordUrl(link, HUBSPOT_TYPE_IDS.tasks, record.id),
    title: p.hs_task_subject?.trim() || "Tâche HubSpot",
    description: stripHtml(p.hs_task_body),
    category: type === "CALL" || type === "EMAIL" || type === "LINKED_IN" ? "commercial" : "administratif",
    ...range,
    allDay: due.kind === "day",
    location: null,
    priority: priority === "HIGH" ? "high" : priority === "LOW" ? "low" : "normal",
    status: status === "COMPLETED" ? "done" : status === "IN_PROGRESS" ? "in_progress" : "upcoming",
    ownerId: p.hubspot_owner_id ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Réunions                                                            */
/* ------------------------------------------------------------------ */

export const MEETING_PROPERTIES = [
  "hs_meeting_title",
  "hs_meeting_body",
  "hs_meeting_start_time",
  "hs_meeting_end_time",
  "hs_meeting_location",
  "hs_meeting_outcome",
  "hubspot_owner_id",
];

export function draftFromMeeting(record: HubSpotRecord, link: LinkContext, now: Date): DraftEvent | null {
  const p = record.properties;
  const start = parseHsDate(p.hs_meeting_start_time);
  if (!start) return null;
  const startAt = start.kind === "instant" ? start.at : instantFromKey(start.key);
  const end = parseHsDate(p.hs_meeting_end_time);
  let endAt = end ? (end.kind === "instant" ? end.at : instantFromKey(end.key)) : new Date(startAt.getTime() + 3_600_000);
  if (endAt.getTime() <= startAt.getTime()) endAt = new Date(startAt.getTime() + 3_600_000);

  const outcome = (p.hs_meeting_outcome ?? "").toUpperCase();
  const status =
    outcome === "CANCELED" || outcome === "CANCELLED"
      ? "cancelled"
      : outcome === "COMPLETED" || endAt.getTime() < now.getTime()
        ? "done"
        : "upcoming";

  return {
    externalId: `meeting:${record.id}`,
    externalObjectType: "custom",
    externalObjectId: record.id,
    externalUrl: recordUrl(link, HUBSPOT_TYPE_IDS.meetings, record.id),
    title: p.hs_meeting_title?.trim() || "Réunion HubSpot",
    description: stripHtml(p.hs_meeting_body),
    category: "rendez_vous",
    startAt,
    endAt,
    allDay: false,
    location: p.hs_meeting_location?.trim() || null,
    priority: "normal",
    status,
    ownerId: p.hubspot_owner_id ?? null,
  };
}

/** Retire le balisage HTML des notes HubSpot et borne la longueur. */
export function stripHtml(value: string | null | undefined): string | null {
  if (!value) return null;
  const text = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text ? text.slice(0, 2000) : null;
}
