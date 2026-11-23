/* Service CRM local (entreprises, contacts, affaires) : recherche, historique, relances et création. Données internes ALP Manager. */
import { and, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { calendarEvents, crmCompanies, crmContacts, crmDeals } from "@/db/schema";
import { CalendarError, visibilityCondition } from "@/lib/calendar/service";
import type { CalendarUser } from "@/lib/calendar/types";

export type CompanyRow = typeof crmCompanies.$inferSelect;
export type ContactRow = typeof crmContacts.$inferSelect;
export type DealRow = typeof crmDeals.$inferSelect;
export type DealStage = DealRow["stage"];
export type DealKind = DealRow["kind"];
export type CompanyType = CompanyRow["type"];

export const OPEN_DEAL_STAGES: DealStage[] = ["lead", "quote_sent", "negotiation", "order", "production"];

const MS_DAY = 86_400_000;

function likeValue(value: string): string {
  return `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export function daysSince(date: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / MS_DAY));
}

export async function getCompanyName(id: string): Promise<string | null> {
  const [row] = await db.select({ name: crmCompanies.name }).from(crmCompanies).where(eq(crmCompanies.id, id)).limit(1);
  return row?.name ?? null;
}

export async function getContact(id: string): Promise<{ id: string; name: string; companyId: string | null } | null> {
  const [row] = await db.select().from(crmContacts).where(eq(crmContacts.id, id)).limit(1);
  if (!row) return null;
  return { id: row.id, name: [row.firstName, row.lastName].filter(Boolean).join(" "), companyId: row.companyId };
}

export async function getDeal(
  id: string,
): Promise<{ id: string; name: string; companyId: string | null; stage: DealStage; kind: DealKind } | null> {
  const [row] = await db.select().from(crmDeals).where(eq(crmDeals.id, id)).limit(1);
  return row ? { id: row.id, name: row.name, companyId: row.companyId, stage: row.stage, kind: row.kind } : null;
}

export async function findCompanyByName(name: string): Promise<CompanyRow | null> {
  const [row] = await db
    .select()
    .from(crmCompanies)
    .where(sql`lower(${crmCompanies.name}) = lower(${name.trim()})`)
    .limit(1);
  return row ?? null;
}

export async function companyNameMap(ids: Array<string | null>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: crmCompanies.id, name: crmCompanies.name })
    .from(crmCompanies)
    .where(inArray(crmCompanies.id, unique));
  return new Map(rows.map((r) => [r.id, r.name]));
}

export async function searchCrm(query: string, limit: number) {
  const pattern = likeValue(query.trim());
  const [companies, contacts, deals] = await Promise.all([
    db
      .select()
      .from(crmCompanies)
      .where(or(ilike(crmCompanies.name, pattern), ilike(crmCompanies.city, pattern), ilike(crmCompanies.domain, pattern)))
      .orderBy(crmCompanies.name)
      .limit(limit),
    db
      .select()
      .from(crmContacts)
      .where(or(ilike(crmContacts.lastName, pattern), ilike(crmContacts.firstName, pattern), ilike(crmContacts.email, pattern)))
      .orderBy(crmContacts.lastName)
      .limit(limit),
    db
      .select()
      .from(crmDeals)
      .where(ilike(crmDeals.name, pattern))
      .orderBy(desc(crmDeals.updatedAt))
      .limit(limit),
  ]);
  return { companies, contacts, deals };
}

export async function getCompanyDetail(id: string): Promise<{ company: CompanyRow; contacts: ContactRow[]; deals: DealRow[] } | null> {
  const [company] = await db.select().from(crmCompanies).where(eq(crmCompanies.id, id)).limit(1);
  if (!company) return null;
  const [contacts, deals] = await Promise.all([
    db.select().from(crmContacts).where(eq(crmContacts.companyId, id)).orderBy(crmContacts.lastName),
    db.select().from(crmDeals).where(eq(crmDeals.companyId, id)).orderBy(desc(crmDeals.updatedAt)),
  ]);
  return { company, contacts, deals };
}

/** Rendez-vous de l'agenda liés à une entreprise, visibles par l'utilisateur. */
export async function getCompanyEvents(viewer: CalendarUser, companyId: string, now: Date) {
  const rows = await db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      startAt: calendarEvents.startAt,
      endAt: calendarEvents.endAt,
      category: calendarEvents.category,
      status: calendarEvents.status,
      report: calendarEvents.report,
    })
    .from(calendarEvents)
    .where(and(eq(calendarEvents.crmCompanyId, companyId), visibilityCondition(viewer)))
    .orderBy(desc(calendarEvents.startAt))
    .limit(80);

  const past = rows.filter((r) => r.endAt.getTime() < now.getTime()).slice(0, 5);
  const upcoming = rows
    .filter((r) => r.endAt.getTime() >= now.getTime() && r.status !== "cancelled")
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
    .slice(0, 5);
  return { past, upcoming };
}

/** Points de vigilance déduits de règles explicites (pas d'interprétation libre). */
export function companyWarnings(
  input: { contacts: ContactRow[]; deals: DealRow[]; upcomingCount: number; pastWithoutReport: number },
  now: Date,
): string[] {
  const warnings: string[] = [];
  const open = input.deals.filter((d) => OPEN_DEAL_STAGES.includes(d.stage));
  if (input.contacts.length === 0) warnings.push("Aucun contact associé à cette entreprise.");
  if (open.length === 0) warnings.push("Aucune affaire en cours.");
  for (const d of open) {
    if (d.stage === "quote_sent") {
      const days = daysSince(d.updatedAt, now);
      if (days >= 7) warnings.push(`Devis en attente depuis ${days} jours : « ${d.name} ».`);
    }
    if (!d.lastInteractionAt) warnings.push(`Aucune interaction enregistrée sur « ${d.name} ».`);
  }
  if (open.length > 0 && input.upcomingCount === 0) {
    warnings.push("Aucun rendez-vous à venir alors que des affaires sont en cours.");
  }
  if (input.pastWithoutReport > 0) {
    warnings.push(`${input.pastWithoutReport} rendez-vous passé(s) sans compte rendu.`);
  }
  return warnings.slice(0, 8);
}

export async function listOpenDeals(filters: { kind?: DealKind; stage?: DealStage; limit: number }) {
  const conditions: Array<SQL | undefined> = [
    filters.stage ? eq(crmDeals.stage, filters.stage) : inArray(crmDeals.stage, OPEN_DEAL_STAGES),
    filters.kind ? eq(crmDeals.kind, filters.kind) : undefined,
  ];
  const rows = await db
    .select({ deal: crmDeals, companyName: crmCompanies.name })
    .from(crmDeals)
    .leftJoin(crmCompanies, eq(crmDeals.companyId, crmCompanies.id))
    .where(and(...conditions))
    .orderBy(desc(crmDeals.updatedAt))
    .limit(filters.limit);
  return rows.map((r) => ({ deal: r.deal, companyName: r.companyName ?? null }));
}

/** Affaires ouvertes sans interaction récente, ou devis restés sans réponse. */
export async function recontactCandidates(
  days: number,
  now: Date,
  filters: { kind?: DealKind; stage?: DealStage },
) {
  const rows = await listOpenDeals({ kind: filters.kind, stage: filters.stage, limit: 200 });
  const threshold = now.getTime() - days * MS_DAY;
  const out: Array<{
    dealId: string;
    dealName: string;
    companyId: string | null;
    companyName: string | null;
    stage: DealStage;
    kind: DealKind;
    amountEur: number | null;
    daysSince: number;
    reason: string;
  }> = [];

  for (const { deal, companyName } of rows) {
    const reference = deal.lastInteractionAt ?? deal.updatedAt;
    let reason: string | null = null;
    if (deal.stage === "quote_sent" && deal.updatedAt.getTime() < threshold) {
      reason = `devis envoyé il y a ${daysSince(deal.updatedAt, now)} jours, sans réponse enregistrée`;
    } else if (reference.getTime() < threshold) {
      reason = deal.lastInteractionAt
        ? `dernière interaction il y a ${daysSince(deal.lastInteractionAt, now)} jours`
        : `aucune interaction enregistrée depuis ${daysSince(deal.updatedAt, now)} jours`;
    }
    if (!reason) continue;
    out.push({
      dealId: deal.id,
      dealName: deal.name,
      companyId: deal.companyId,
      companyName,
      stage: deal.stage,
      kind: deal.kind,
      amountEur: deal.amountEur,
      daysSince: daysSince(reference, now),
      reason,
    });
  }
  return out.sort((a, b) => b.daysSince - a.daysSince).slice(0, 25);
}

export async function createCompany(
  viewer: CalendarUser,
  input: { name: string; type: CompanyType; city?: string | null; sector?: string | null; notes?: string | null },
): Promise<string> {
  const existing = await findCompanyByName(input.name);
  if (existing) throw new CalendarError("Une entreprise portant ce nom existe déjà dans ALP Manager.", 409);
  const [row] = await db
    .insert(crmCompanies)
    .values({
      name: input.name.trim(),
      type: input.type,
      city: input.city ?? null,
      sector: input.sector ?? null,
      notes: input.notes ?? null,
      ownerId: viewer.id,
      source: "local",
    })
    .returning({ id: crmCompanies.id });
  return row.id;
}

export async function createDeal(
  viewer: CalendarUser,
  input: {
    companyId: string;
    name: string;
    kind: DealKind;
    stage: DealStage;
    amountEur?: number | null;
    expectedCloseDate?: string | null;
    productLine?: string | null;
  },
): Promise<string> {
  const company = await getCompanyName(input.companyId);
  if (!company) throw new CalendarError("Entreprise introuvable dans ALP Manager.", 404);
  const closed = input.stage === "won" || input.stage === "lost";
  const [row] = await db
    .insert(crmDeals)
    .values({
      companyId: input.companyId,
      name: input.name.trim(),
      kind: input.kind,
      stage: input.stage,
      amountEur: input.amountEur ?? null,
      expectedCloseDate: input.expectedCloseDate ?? null,
      productLine: input.productLine ?? null,
      ownerId: viewer.id,
      source: "local",
      closedAt: closed ? new Date() : null,
    })
    .returning({ id: crmDeals.id });
  return row.id;
}
