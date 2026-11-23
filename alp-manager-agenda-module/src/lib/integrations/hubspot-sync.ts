/*
 * Synchronisation HubSpot → agenda ALP Manager (sens entrant, lecture seule côté HubSpot).
 *
 * Importe : l'équipe (propriétaires HubSpot → collaborateurs), les tâches, les réunions,
 * et les dates de livraison / fermeture / création des transactions et des projets.
 * Chaque événement porte source = "hubspot" et un identifiant externe stable : relancer la synchro
 * met à jour les lignes existantes, sans doublon. Les événements créés dans ALP Manager ne sont jamais touchés.
 *
 * Variables (toutes optionnelles sauf HUBSPOT_ACCESS_TOKEN) :
 *   HUBSPOT_PORTAL_ID, HUBSPOT_APP_BASE (défaut https://app-eu1.hubspot.com) : liens vers les fiches
 *   HUBSPOT_PROJECT_OBJECT_TYPE : type d'objet des projets (ex. 0-970 ou p123_projets) si la détection échoue
 *   HUBSPOT_TEAM_FILTER : noms des collaborateurs à importer, séparés par des virgules ("*" = tous)
 *   ALP_DIRECTION_EMAILS : e-mails qui reçoivent le rôle « direction »
 *   HUBSPOT_SYNC_PAST_DAYS / HUBSPOT_SYNC_FUTURE_DAYS : fenêtre de dates (défaut 60 / 365)
 */
import { and, asc, eq, inArray, like, notInArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { calendarEvents, users } from "@/db/schema";
import { addDays, instantFromKey, todayKey } from "@/lib/calendar/time";
import {
  HubSpotError,
  isHubSpotConfigured,
  listOwners,
  listProperties,
  listSchemas,
  searchAll,
  type HubSpotOwner,
  type HubSpotProperty,
  type HubSpotRecord,
  type SearchBody,
} from "./hubspot";
import {
  DATE_RULES,
  HUBSPOT_TYPE_IDS,
  MEETING_PROPERTIES,
  TASK_PROPERTIES,
  draftFromMeeting,
  draftFromTask,
  draftsFromDateRecord,
  normalizeLabel,
  resolveRules,
  type DraftEvent,
  type LinkContext,
} from "./hubspot-mapping";

const MAX_RECORDS = 1000;
const PLACEHOLDER_DOMAIN = "@alp-manager.local";
const PALETTE = ["#3ddc84", "#3b82f6", "#f97316", "#a855f7", "#06b6d4", "#eab308", "#ef4444", "#ec4899"];
const DEFAULT_TEAM = "achat prod,baptiste ravat,cyril,nils,juliette";

export type SyncPartResult = {
  source: "owners" | "deals" | "projects" | "tasks" | "meetings";
  ok: boolean;
  count: number;
  removed: number;
  message: string | null;
};

export type SyncResult = {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  window: { from: string; to: string };
  users: { created: number; mapped: number; deactivatedPlaceholders: number };
  parts: SyncPartResult[];
  upserted: number;
  warnings: string[];
};

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

function envList(name: string, fallback = ""): string[] {
  return (process.env[name] ?? fallback)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function envInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function linkContext(): LinkContext {
  return {
    appBase: process.env.HUBSPOT_APP_BASE?.trim() || "https://app-eu1.hubspot.com",
    portalId: process.env.HUBSPOT_PORTAL_ID?.trim() || null,
  };
}

function syncWindow() {
  const today = todayKey();
  return {
    fromKey: addDays(today, -envInt("HUBSPOT_SYNC_PAST_DAYS", 60)),
    toKey: addDays(today, envInt("HUBSPOT_SYNC_FUTURE_DAYS", 365)),
    todayKey: today,
  };
}

function ownerFullName(o: HubSpotOwner): string {
  return [o.firstName, o.lastName].filter(Boolean).join(" ").trim();
}

function isInTeam(o: HubSpotOwner, filter: string[]): boolean {
  if (filter.includes("*")) return true;
  const haystack = normalizeLabel(`${ownerFullName(o)} ${o.email ?? ""}`);
  return filter.some((token) => haystack.includes(normalizeLabel(token)));
}

/* ------------------------------------------------------------------ */
/* Équipe : propriétaires HubSpot → users                              */
/* ------------------------------------------------------------------ */

async function syncUsers(owners: HubSpotOwner[], warnings: string[]) {
  const filter = envList("HUBSPOT_TEAM_FILTER", DEFAULT_TEAM);
  const directionEmails = new Set(envList("ALP_DIRECTION_EMAILS").map((e) => e.toLowerCase()));
  const ownerToUser = new Map<string, string>();
  let created = 0;

  const team = owners.filter((o) => o.email && isInTeam(o, filter));
  const existing = await db.select().from(users);
  const byEmail = new Map(existing.map((u) => [u.email.toLowerCase(), u]));
  let colorIndex = existing.length;

  for (const owner of team) {
    const email = owner.email!.toLowerCase();
    const wantsDirection = directionEmails.has(email);
    let row = byEmail.get(email);

    if (!row) {
      const [inserted] = await db
        .insert(users)
        .values({
          fullName: ownerFullName(owner) || email,
          email,
          role: wantsDirection ? "direction" : "collaborateur",
          color: PALETTE[colorIndex++ % PALETTE.length],
        })
        .onConflictDoNothing()
        .returning();
      if (inserted) created++;
      row = inserted ?? (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];
    } else if (wantsDirection && row.role !== "direction") {
      await db.update(users).set({ role: "direction", updatedAt: new Date() }).where(eq(users.id, row.id));
    } else if (!row.isActive) {
      await db.update(users).set({ isActive: true, updatedAt: new Date() }).where(eq(users.id, row.id));
    }
    if (row) ownerToUser.set(owner.id, row.id);
  }

  // Les comptes de démonstration (…@alp-manager.local) sont désactivés dès que de vrais collaborateurs existent.
  let deactivated = 0;
  if (ownerToUser.size > 0) {
    const res = await db
      .update(users)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(like(users.email, `%${PLACEHOLDER_DOMAIN}`), eq(users.isActive, true)))
      .returning({ id: users.id });
    deactivated = res.length;
  } else {
    warnings.push(
      "Aucun propriétaire HubSpot ne correspond à l'équipe (HUBSPOT_TEAM_FILTER) : les événements ne seront pas rattachés à des collaborateurs.",
    );
  }

  const hasDirection = (await db.select({ id: users.id }).from(users).where(and(eq(users.role, "direction"), eq(users.isActive, true))).limit(1)).length > 0;
  if (!hasDirection) {
    warnings.push("Aucun compte « direction » actif : renseignez ALP_DIRECTION_EMAILS avec votre e-mail HubSpot puis relancez la synchro.");
  }
  return { ownerToUser, created, deactivated };
}

async function pickSystemUserId(): Promise<string> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.isActive, true))
    .orderBy(sql`case when ${users.role} = 'direction' then 0 else 1 end`, asc(users.createdAt))
    .limit(1);
  if (!row) throw new HubSpotError("Aucun collaborateur actif : impossible de rattacher les événements importés.", 0);
  return row.id;
}

/* ------------------------------------------------------------------ */
/* Récupération des objets                                             */
/* ------------------------------------------------------------------ */

type Fetched = { drafts: DraftEvent[]; truncated: boolean; message: string | null };

function rangeFilters(property: string, fromMs: number, toMs: number) {
  return {
    filters: [
      { propertyName: property, operator: "GTE", value: String(fromMs) },
      { propertyName: property, operator: "LTE", value: String(toMs) },
    ],
  };
}

async function fetchDateObjects(
  kind: "deal" | "project",
  objectType: string,
  typeId: string | null,
  props: HubSpotProperty[],
  win: ReturnType<typeof syncWindow>,
  link: LinkContext,
  unresolvedOut: string[],
): Promise<Fetched> {
  const { resolved, unresolved } = resolveRules(DATE_RULES, props);
  for (const r of unresolved) unresolvedOut.push(`${kind === "deal" ? "Transactions" : "Projets"} : « ${r.labels[0]} » introuvable`);
  if (resolved.length === 0) {
    return { drafts: [], truncated: true, message: "Aucune propriété de date reconnue (voir la route de découverte)." };
  }

  const nameProperty =
    (kind === "deal" ? "dealname" : undefined) ??
    props.find((p) => ["hs_name", "name", "project_name", "nom"].includes(p.name))?.name ??
    props.find((p) => normalizeLabel(p.label).includes("nom"))?.name ??
    "hs_name";

  const fromMs = instantFromKey(addDays(win.fromKey, -1)).getTime();
  const toMs = instantFromKey(addDays(win.toKey, 2)).getTime();
  const body: SearchBody = {
    filterGroups: resolved.map(({ property }) => rangeFilters(property.name, fromMs, toMs)),
    properties: [...new Set([nameProperty, "hubspot_owner_id", ...resolved.map((r) => r.property.name)])],
  };

  const records: HubSpotRecord[] = await searchAll(objectType, body, MAX_RECORDS);
  const drafts = records.flatMap((record) =>
    draftsFromDateRecord(record, {
      kind,
      typeId,
      nameProperty,
      fallbackName: kind === "deal" ? "Transaction" : "Projet",
      resolved,
      window: { fromKey: win.fromKey, toKey: win.toKey },
      todayKey: win.todayKey,
      link,
    }),
  );
  return { drafts, truncated: records.length >= MAX_RECORDS, message: null };
}

/** Trouve le type d'objet des projets : variable d'environnement, objets personnalisés, puis type standard. */
export async function resolveProjectObject(): Promise<{ objectType: string; typeId: string | null; properties: HubSpotProperty[] } | null> {
  const candidates: Array<{ objectType: string; typeId: string | null }> = [];
  const fromEnv = process.env.HUBSPOT_PROJECT_OBJECT_TYPE?.trim();
  if (fromEnv) candidates.push({ objectType: fromEnv, typeId: /^\d+-\d+$/.test(fromEnv) ? fromEnv : null });
  try {
    const schemas = await listSchemas();
    for (const s of schemas) {
      if (/projet|project/i.test(`${s.singular} ${s.plural} ${s.name}`)) {
        candidates.push({ objectType: s.objectTypeId, typeId: s.objectTypeId });
      }
    }
  } catch {
    // droit de lecture des schémas non accordé : on passe au type standard
  }
  candidates.push({ objectType: "0-970", typeId: "0-970" });

  for (const c of candidates) {
    try {
      const properties = await listProperties(c.objectType);
      return { ...c, properties };
    } catch {
      // candidat suivant
    }
  }
  return null;
}

async function fetchTasks(win: ReturnType<typeof syncWindow>, link: LinkContext): Promise<Fetched> {
  const fromMs = instantFromKey(win.fromKey).getTime();
  const toMs = instantFromKey(addDays(win.toKey, 1)).getTime();
  const records = await searchAll(
    "tasks",
    { filterGroups: [rangeFilters("hs_timestamp", fromMs, toMs)], properties: TASK_PROPERTIES },
    MAX_RECORDS,
  );
  const drafts = records.map((r) => draftFromTask(r, link)).filter((d): d is DraftEvent => d !== null);
  return { drafts, truncated: records.length >= MAX_RECORDS, message: null };
}

async function fetchMeetings(win: ReturnType<typeof syncWindow>, link: LinkContext): Promise<Fetched> {
  const fromMs = instantFromKey(win.fromKey).getTime();
  const toMs = instantFromKey(addDays(win.toKey, 1)).getTime();
  const records = await searchAll(
    "meetings",
    { filterGroups: [rangeFilters("hs_meeting_start_time", fromMs, toMs)], properties: MEETING_PROPERTIES },
    MAX_RECORDS,
  );
  const now = new Date();
  const drafts = records.map((r) => draftFromMeeting(r, link, now)).filter((d): d is DraftEvent => d !== null);
  return { drafts, truncated: records.length >= MAX_RECORDS, message: null };
}

/* ------------------------------------------------------------------ */
/* Écriture                                                            */
/* ------------------------------------------------------------------ */

async function upsertDrafts(drafts: DraftEvent[], ownerToUser: Map<string, string>, systemUserId: string): Promise<number> {
  const unique = new Map<string, DraftEvent>();
  for (const d of drafts) unique.set(d.externalId, d);
  const list = [...unique.values()];
  const now = new Date();

  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100).map((d) => {
      const assigned = d.ownerId ? (ownerToUser.get(d.ownerId) ?? null) : null;
      return {
        title: d.title.slice(0, 300),
        description: d.description,
        category: d.category,
        startAt: d.startAt,
        endAt: d.endAt,
        allDay: d.allDay,
        location: d.location,
        assignedTo: assigned,
        createdBy: assigned ?? systemUserId,
        priority: d.priority,
        status: d.status,
        visibility: "shared" as const,
        source: "hubspot" as const,
        externalId: d.externalId,
        externalObjectType: d.externalObjectType,
        externalObjectId: d.externalObjectId,
        externalUrl: d.externalUrl,
        lastSyncedAt: now,
        syncStatus: "synced" as const,
        syncDirection: "inbound" as const,
      };
    });
    await db
      .insert(calendarEvents)
      .values(chunk)
      .onConflictDoUpdate({
        target: [calendarEvents.source, calendarEvents.externalId],
        targetWhere: sql`${calendarEvents.externalId} is not null`,
        set: {
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          category: sql`excluded.category`,
          startAt: sql`excluded.start_at`,
          endAt: sql`excluded.end_at`,
          allDay: sql`excluded.all_day`,
          location: sql`excluded.location`,
          assignedTo: sql`excluded.assigned_to`,
          priority: sql`excluded.priority`,
          status: sql`excluded.status`,
          externalUrl: sql`excluded.external_url`,
          lastSyncedAt: sql`excluded.last_synced_at`,
          syncStatus: sql`excluded.sync_status`,
          updatedAt: now,
        },
      });
  }
  return list.length;
}

/** Supprime les événements importés qui ne sont plus renvoyés par HubSpot (supprimés ou déplacés hors fenêtre). */
async function removeStale(
  objectTypes: Array<DraftEvent["externalObjectType"]>,
  keepIds: string[],
  win: ReturnType<typeof syncWindow>,
): Promise<number> {
  const conditions = [
    eq(calendarEvents.source, "hubspot"),
    inArray(calendarEvents.externalObjectType, objectTypes),
    sql`${calendarEvents.startAt} >= ${instantFromKey(win.fromKey)}`,
    sql`${calendarEvents.startAt} < ${instantFromKey(addDays(win.toKey, 1))}`,
  ];
  if (keepIds.length > 0) conditions.push(notInArray(calendarEvents.externalId, keepIds));
  const removed = await db.delete(calendarEvents).where(and(...conditions)).returning({ id: calendarEvents.id });
  return removed.length;
}

/* ------------------------------------------------------------------ */
/* Orchestration                                                       */
/* ------------------------------------------------------------------ */

function failure(source: SyncPartResult["source"], error: unknown): SyncPartResult {
  const message = error instanceof HubSpotError ? error.message : "Erreur inattendue pendant la lecture HubSpot.";
  if (!(error instanceof HubSpotError)) console.error(`[hubspot-sync] ${source}`, error);
  return { source, ok: false, count: 0, removed: 0, message };
}

export async function runHubSpotSync(): Promise<SyncResult> {
  if (!isHubSpotConfigured()) {
    throw new HubSpotError("HubSpot n'est pas connecté : la variable HUBSPOT_ACCESS_TOKEN est absente.", 0);
  }
  const startedAt = new Date();
  const win = syncWindow();
  const link = linkContext();
  const warnings: string[] = [];
  const parts: SyncPartResult[] = [];

  // 1. Équipe
  let ownerToUser = new Map<string, string>();
  let created = 0;
  let deactivated = 0;
  try {
    const owners = await listOwners();
    const result = await syncUsers(owners, warnings);
    ownerToUser = result.ownerToUser;
    created = result.created;
    deactivated = result.deactivated;
    parts.push({ source: "owners", ok: true, count: ownerToUser.size, removed: 0, message: null });
  } catch (error) {
    parts.push(failure("owners", error));
  }
  const systemUserId = await pickSystemUserId();

  // 2. Objets : chaque source est indépendante (un droit manquant n'arrête pas les autres)
  const unresolved: string[] = [];
  type Job = { source: "deals" | "projects" | "tasks" | "meetings"; types: Array<DraftEvent["externalObjectType"]>; run: () => Promise<Fetched> };
  const jobs: Job[] = [
    {
      source: "deals",
      types: ["deal"],
      run: async () => fetchDateObjects("deal", "deals", HUBSPOT_TYPE_IDS.deals, await listProperties("deals"), win, link, unresolved),
    },
    {
      source: "projects",
      types: ["project"],
      run: async () => {
        const project = await resolveProjectObject();
        if (!project) {
          return { drafts: [], truncated: true, message: "Objet « Projets » introuvable : renseignez HUBSPOT_PROJECT_OBJECT_TYPE (voir la route de découverte)." };
        }
        return fetchDateObjects("project", project.objectType, project.typeId, project.properties, win, link, unresolved);
      },
    },
    { source: "tasks", types: ["task"], run: () => fetchTasks(win, link) },
    { source: "meetings", types: ["custom"], run: () => fetchMeetings(win, link) },
  ];

  let upserted = 0;
  for (const job of jobs) {
    try {
      const fetched = await job.run();
      const count = await upsertDrafts(fetched.drafts, ownerToUser, systemUserId);
      // Nettoyage uniquement si la lecture est complète (ni plafonnée, ni abandonnée).
      const removed = fetched.truncated || fetched.message !== null ? 0 : await removeStale(job.types, fetched.drafts.map((d) => d.externalId), win);
      upserted += count;
      parts.push({ source: job.source, ok: fetched.message === null, count, removed, message: fetched.message });
    } catch (error) {
      parts.push(failure(job.source, error));
    }
  }

  warnings.push(...unresolved);
  const finishedAt = new Date();
  return {
    ok: parts.every((p) => p.ok),
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    window: { from: win.fromKey, to: win.toKey },
    users: { created, mapped: ownerToUser.size, deactivatedPlaceholders: deactivated },
    parts,
    upserted,
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/* Découverte : aide à vérifier le mapping sans rien écrire            */
/* ------------------------------------------------------------------ */

export async function discoverHubSpot() {
  const filter = envList("HUBSPOT_TEAM_FILTER", DEFAULT_TEAM);
  const safe = async <T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> => {
    try {
      return { ok: true, value: await fn() };
    } catch (error) {
      return { ok: false, error: error instanceof HubSpotError ? error.message : "Erreur inattendue." };
    }
  };

  const describe = (props: HubSpotProperty[]) => {
    const { resolved, unresolved } = resolveRules(DATE_RULES, props);
    return {
      matched: resolved.map((r) => ({ rule: r.rule.labels[0], property: r.property.name, label: r.property.label, type: r.property.type })),
      notFound: unresolved.map((r) => r.labels[0]),
      allDateProperties: props.filter((p) => p.type === "date" || p.type === "datetime").map((p) => ({ name: p.name, label: p.label, type: p.type })),
    };
  };

  const [owners, deals, project] = await Promise.all([
    safe(listOwners),
    safe(() => listProperties("deals")),
    safe(resolveProjectObject),
  ]);

  return {
    teamFilter: filter,
    owners: owners.ok
      ? owners.value.map((o) => ({ id: o.id, name: ownerFullName(o), email: o.email, importedInTeam: Boolean(o.email) && isInTeam(o, filter) }))
      : { error: owners.error },
    deals: deals.ok ? describe(deals.value) : { error: deals.error },
    projects: project.ok
      ? project.value
        ? { objectType: project.value.objectType, ...describe(project.value.properties) }
        : { error: "Objet « Projets » introuvable : définissez HUBSPOT_PROJECT_OBJECT_TYPE." }
      : { error: project.error },
  };
}
