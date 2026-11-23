/* Copilote quotidien : briefing structuré construit uniquement à partir des données vérifiées. */
import { getAgendaSummary, listCalendarRange } from "@/lib/calendar/service";
import { linkedCompanyIds } from "@/lib/calendar/extras";
import { CATEGORIES } from "@/lib/calendar/constants";
import { addDays, dateKey, formatDayShort, instantFromKey, timeOf } from "@/lib/calendar/time";
import type { CalendarUser } from "@/lib/calendar/types";
import * as crm from "@/lib/crm/service";
import { findConflicts, isOpen, itemsOnDay, toAgendaItems } from "./analytics";
import { DEAL_STAGE_LABEL, type Block } from "./types";

export type BriefingResult = { summary: string; blocks: Block[]; data: Record<string, unknown> };

const HOUR_MS = 3_600_000;

export async function buildBriefing(viewer: CalendarUser, now: Date): Promise<BriefingResult> {
  const today = dateKey(now);
  const range = await listCalendarRange(viewer, instantFromKey(today), instantFromKey(addDays(today, 8)));
  const items = toAgendaItems(range.occurrences, range.events);
  const descriptions = new Map(range.events.map((e) => [e.id, e.description ?? ""]));

  const todays = itemsOnDay(items, today);
  const openToday = todays.filter(isOpen);
  const summary = await getAgendaSummary(viewer, now);
  const overdue = summary.overdue;
  const relances = (await crm.recontactCandidates(14, now, {})).slice(0, 5);
  const conflicts = findConflicts(todays);
  const deals = (await crm.listOpenDeals({ limit: 20 }))
    .sort((a, b) => (b.deal.amountEur ?? 0) - (a.deal.amountEur ?? 0))
    .slice(0, 5);

  const horizon = now.getTime() + 48 * HOUR_MS;
  const soon = items.filter(
    (i) =>
      isOpen(i) &&
      !i.allDay &&
      i.start.getTime() > now.getTime() &&
      i.start.getTime() < horizon &&
      (i.category === "rendez_vous" || i.category === "commercial"),
  );
  const linked = await linkedCompanyIds(soon.map((i) => i.eventId));
  const toPrepare = soon.flatMap((i) => {
    const reasons: string[] = [];
    if (!descriptions.get(i.eventId)?.trim()) reasons.push("sans description");
    if (!linked.get(i.eventId)) reasons.push("sans entreprise liée");
    return reasons.length > 0 ? [{ item: i, reasons }] : [];
  });

  const upcoming = items.filter((i) => isOpen(i) && i.start.getTime() >= now.getTime()).slice(0, 8);
  const todayCommercial = openToday.filter((i) => i.category === "commercial");

  const blocks: Block[] = [
    {
      type: "kv",
      title: "Synthèse du jour",
      source: "alp",
      items: [
        { label: "Rendez-vous aujourd'hui", value: String(openToday.length) },
        { label: "Tâches en retard", value: String(overdue.length) },
        { label: "Relances à effectuer", value: String(relances.length) },
        { label: "Conflits de planning", value: String(conflicts.length) },
      ],
    },
  ];

  if (todays.length > 0) {
    blocks.push({
      type: "table",
      title: "Rendez-vous du jour",
      source: "alp",
      columns: ["Heure", "Titre", "Catégorie", "Responsable", "Lieu"],
      rows: todays.map((i) => [
        i.allDay ? "Journée" : `${timeOf(i.start)}–${timeOf(i.end)}`,
        i.title,
        CATEGORIES[i.category].label,
        i.assignee ?? "—",
        i.location ?? "—",
      ]),
    });
  } else {
    blocks.push({ type: "alert", tone: "info", text: "Aucun rendez-vous planifié aujourd'hui." });
  }

  const priorities = [
    ...overdue.map((o) => ({ text: `En retard : ${o.title}`, meta: `échéance ${formatDayShort(dateKey(new Date(o.end)))}` })),
    ...conflicts.map((c) => ({
      text: `Conflit : « ${c.a.title} » chevauche « ${c.b.title} »`,
      meta: `${timeOf(c.a.start)}–${timeOf(c.a.end)} / ${timeOf(c.b.start)}–${timeOf(c.b.end)}`,
    })),
    ...todayCommercial.map((i) => ({ text: `Action commerciale : ${i.title}`, meta: i.allDay ? "journée" : timeOf(i.start) })),
  ];
  blocks.push(
    priorities.length > 0
      ? { type: "list", title: "Tâches prioritaires", source: "alp", items: priorities.slice(0, 8) }
      : { type: "alert", tone: "success", text: "Aucune tâche prioritaire en retard." },
  );

  if (toPrepare.length > 0) {
    blocks.push({
      type: "list",
      title: "Rendez-vous à préparer (48 h)",
      source: "alp",
      items: toPrepare.map(({ item, reasons }) => ({
        text: `${item.title} · ${formatDayShort(dateKey(item.start))} ${timeOf(item.start)}`,
        meta: reasons.join(", "),
      })),
    });
  }

  if (relances.length > 0) {
    blocks.push({
      type: "list",
      title: "Relances commerciales",
      source: "alp",
      items: relances.map((r) => ({ text: `${r.companyName ?? "Entreprise"} — ${r.dealName}`, meta: r.reason })),
    });
  }

  if (deals.length > 0) {
    blocks.push({
      type: "table",
      title: "Dossiers commerciaux importants",
      source: "alp",
      columns: ["Affaire", "Entreprise", "Étape", "Montant"],
      rows: deals.map((d) => [
        d.deal.name,
        d.companyName ?? "—",
        DEAL_STAGE_LABEL[d.deal.stage] ?? d.deal.stage,
        d.deal.amountEur ? `${d.deal.amountEur.toLocaleString("fr-FR")} €` : "—",
      ]),
    });
  }

  for (const c of conflicts.slice(0, 3)) {
    blocks.push({
      type: "alert",
      tone: "warning",
      text: `Conflit de planning : « ${c.a.title} » et « ${c.b.title} » se chevauchent.`,
    });
  }

  if (upcoming.length > 0) {
    blocks.push({
      type: "list",
      title: "Événements à venir (7 jours)",
      source: "alp",
      items: upcoming.map((i) => ({
        text: i.title,
        meta: `${formatDayShort(dateKey(i.start))} · ${i.allDay ? "journée" : timeOf(i.start)}`,
      })),
    });
  }

  const order: string[] = [];
  if (overdue.length > 0) order.push("Traiter d'abord les tâches en retard");
  if (conflicts.length > 0) order.push("Résoudre les conflits de planning");
  if (toPrepare.length > 0) order.push("Préparer les rendez-vous des 48 prochaines heures");
  if (relances.length > 0) order.push("Relancer les dossiers sans interaction récente");
  if (deals.length > 0) order.push("Faire avancer les affaires les plus importantes");
  if (order.length > 0) {
    blocks.push({ type: "list", title: "Ordre de priorité suggéré", source: "ia", items: order.map((text) => ({ text })) });
  }

  return {
    summary: `Aujourd'hui : ${openToday.length} rendez-vous, ${overdue.length} tâche(s) en retard, ${relances.length} relance(s), ${conflicts.length} conflit(s) de planning.`,
    blocks,
    data: {
      date: today,
      meetings: openToday.map((i) => ({ eventId: i.eventId, title: i.title, start: i.start.toISOString(), end: i.end.toISOString() })),
      overdue: overdue.map((o) => ({ eventId: o.eventId, title: o.title, end: o.end })),
      conflicts: conflicts.length,
      toPrepare: toPrepare.map(({ item, reasons }) => ({ eventId: item.eventId, title: item.title, reasons })),
      relances: relances.map((r) => ({ dealId: r.dealId, dealName: r.dealName, companyName: r.companyName, reason: r.reason })),
      deals: deals.map((d) => ({ dealId: d.deal.id, name: d.deal.name, companyName: d.companyName, stage: d.deal.stage, amountEur: d.deal.amountEur })),
    },
  };
}
