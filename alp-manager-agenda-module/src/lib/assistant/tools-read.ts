/* Outils de lecture de l'assistant : agenda, CRM, équipe, HubSpot et briefing. Toutes les données sont filtrées par les droits de l'utilisateur. */
import type { z } from "zod";
import { listActiveUsers } from "@/lib/auth/users";
import { CATEGORIES, ROLE_LABELS, STATUSES } from "@/lib/calendar/constants";
import { listPastWithoutReport } from "@/lib/calendar/extras";
import { getAgendaSummary, listCalendarRange } from "@/lib/calendar/service";
import { addDays, dateKey, formatDayShort, instantFromKey, timeOf } from "@/lib/calendar/time";
import type { CalendarUser } from "@/lib/calendar/types";
import * as crm from "@/lib/crm/service";
import { getHubSpotStatus, HUBSPOT_SCOPES, hubspotSearch } from "@/lib/integrations/hubspot";
import { buildBriefing } from "./briefing";
import { dayKeysBetween, dayLoad, findConflicts, freeSlots, isOpen, toAgendaItems, WINDOWS, type AgendaItem } from "./analytics";
import { normalizeText } from "./rules";
import { READ_SCHEMAS } from "./schemas";
import { COMPANY_TYPE_LABEL, DEAL_KIND_LABEL, DEAL_STAGE_LABEL, type Block, type RegisteredTool, type ToolContext, type ToolOutcome } from "./types";

const MAX_ROWS = 40;
const MS_DAY = 86_400_000;

const fail = (error: string): ToolOutcome => ({ ok: false, error });
const dayLabel = (key: string): string => formatDayShort(key);
const euros = (amount: number | null): string => (amount ? `${amount.toLocaleString("fr-FR")} €` : "—");

function read<S extends z.ZodType>(
  name: string,
  description: string,
  schema: S,
  run: (ctx: ToolContext, args: z.output<S>) => Promise<ToolOutcome>,
): RegisteredTool {
  return {
    name,
    mode: "read",
    description,
    schema,
    run: (ctx, args) => run(ctx, schema.parse(args) as z.output<S>),
  };
}

function rangeError(from: string, to: string, maxDays: number): string | null {
  if (to < from) return "La date de fin précède la date de début.";
  if (Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_DAY) > maxDays) {
    return `Période trop longue : ${maxDays} jours maximum.`;
  }
  return null;
}

async function loadItems(viewer: CalendarUser, from: string, to: string) {
  const range = await listCalendarRange(viewer, instantFromKey(from), instantFromKey(addDays(to, 1)));
  return { items: toAgendaItems(range.occurrences, range.events), events: range.events };
}

const EVENT_COLUMNS = ["Jour", "Heure", "Titre", "Catégorie", "Responsable", "Lieu", "Statut"];

function eventRow(i: AgendaItem): string[] {
  return [
    dayLabel(dateKey(i.start)),
    i.allDay ? "Journée" : `${timeOf(i.start)}–${timeOf(i.end)}`,
    i.title,
    CATEGORIES[i.category].label,
    i.assignee ?? "—",
    i.location ?? "—",
    STATUSES[i.status].label,
  ];
}

export const READ_TOOLS: RegisteredTool[] = [
  read(
    "agenda_overview",
    "Liste les rendez-vous et événements visibles entre deux dates incluses (AAAA-MM-JJ, heure de Paris). Pour « rendez-vous de demain », « planning du jour », « récapitulatif de la semaine ». Maximum 62 jours.",
    READ_SCHEMAS.agenda_overview,
    async (ctx, a) => {
      const err = rangeError(a.from, a.to, 62);
      if (err) return fail(err);
      const { items } = await loadItems(ctx.viewer, a.from, a.to);
      const label = a.from === a.to ? dayLabel(a.from) : `du ${dayLabel(a.from)} au ${dayLabel(a.to)}`;
      const conflicts = findConflicts(items);
      const busy = dayKeysBetween(a.from, a.to).map((d) => dayLoad(items, d)).filter((d) => d.load === "chargée");

      const blocks: Block[] = [];
      if (items.length > 0) {
        blocks.push({
          type: "table",
          title: `Agenda ${label}`,
          source: "alp",
          columns: EVENT_COLUMNS,
          rows: items.slice(0, MAX_ROWS).map(eventRow),
          more: items.length > MAX_ROWS ? items.length - MAX_ROWS : undefined,
        });
      }
      if (items.length === 0) blocks.push({ type: "alert", tone: "info", text: `Aucun événement ${label}.` });
      if (conflicts.length > 0) blocks.push({ type: "alert", tone: "warning", text: `${conflicts.length} conflit(s) de planning sur la période.` });
      if (busy.length > 0) blocks.push({ type: "alert", tone: "info", text: `Journée(s) chargée(s) : ${busy.map((b) => dayLabel(b.day)).join(", ")}.` });

      const summary =
        items.length > 0
          ? `${items.length} événement(s) ${label}.${conflicts.length > 0 ? ` ${conflicts.length} conflit(s) de planning.` : ""}`
          : `Aucun événement ${label}.`;
      return {
        ok: true,
        summary,
        blocks,
        data: {
          count: items.length,
          conflicts: conflicts.length,
          events: items.slice(0, 60).map((i) => ({
            eventId: i.eventId,
            title: i.title,
            start: i.start.toISOString(),
            end: i.end.toISOString(),
            allDay: i.allDay,
            category: i.category,
            status: i.status,
            assignee: i.assignee,
            location: i.location,
          })),
        },
      };
    },
  ),

  read(
    "agenda_find",
    "Retrouve des événements par mots-clés (titre, description, lieu, responsable, participants). Par défaut : de 60 jours avant à 120 jours après aujourd'hui.",
    READ_SCHEMAS.agenda_find,
    async (ctx, a) => {
      const today = dateKey(ctx.now);
      const from = a.from ?? addDays(today, -60);
      const to = a.to ?? addDays(today, 120);
      const err = rangeError(from, to, 240);
      if (err) return fail(err);
      const tokens = normalizeText(a.query).split(" ").filter((t) => t.length >= 2);
      const { items, events } = await loadItems(ctx.viewer, from, to);
      const extra = new Map(
        events.map((e) => [e.id, [e.description ?? "", ...e.participants.map((p) => p.fullName), e.createdBy?.fullName ?? ""].join(" ")]),
      );
      const seen = new Set<string>();
      const matches = items.filter((i) => {
        if (seen.has(i.eventId)) return false;
        const haystack = normalizeText([i.title, i.location ?? "", i.assignee ?? "", extra.get(i.eventId) ?? ""].join(" "));
        const ok = tokens.length > 0 && tokens.every((t) => haystack.includes(t));
        if (ok) seen.add(i.eventId);
        return ok;
      });
      const shown = matches.slice(0, 15);
      return {
        ok: true,
        summary:
          matches.length > 0
            ? `${matches.length} événement(s) correspondent à « ${a.query} ».`
            : `Aucun événement ne correspond à « ${a.query} » sur la période.`,
        blocks:
          shown.length > 0
            ? [{ type: "table", title: `Résultats pour « ${a.query} »`, source: "alp", columns: EVENT_COLUMNS, rows: shown.map(eventRow) }]
            : [{ type: "alert", tone: "info", text: `Aucun événement ne correspond à « ${a.query} ».` }],
        data: {
          matches: shown.map((i) => ({
            eventId: i.eventId,
            title: i.title,
            start: i.start.toISOString(),
            assignee: i.assignee,
            location: i.location,
          })),
        },
      };
    },
  ),

  read(
    "agenda_availability",
    "Cherche des créneaux libres dans l'agenda de l'utilisateur, sur 14 jours maximum (horaires de travail 09:00–18:00). Précisez la durée et la fenêtre : journée, matin ou après-midi.",
    READ_SCHEMAS.agenda_availability,
    async (ctx, a) => {
      const err = rangeError(a.from, a.to, 14);
      if (err) return fail(err);
      const { items } = await loadItems(ctx.viewer, a.from, a.to);
      const win = WINDOWS[a.window];
      const days = dayKeysBetween(a.from, a.to).map((day) => ({ day, ...freeSlots(items, day, win, a.durationMinutes) }));
      const withSlots = days.filter((d) => d.slots.length > 0);
      const rows = days.map((d) => [
        dayLabel(d.day),
        d.fullDay ? "Journée occupée" : d.slots.length > 0 ? d.slots.map((s) => `${s.from}–${s.to}`).join(", ") : "Aucun créneau",
      ]);
      const first = withSlots[0];
      return {
        ok: true,
        summary:
          first && first.slots[0]
            ? `Oui : ${withSlots.length} journée(s) avec au moins un créneau de ${a.durationMinutes} min (${win.label}). Premier créneau : ${dayLabel(first.day)} ${first.slots[0].from}–${first.slots[0].to}.`
            : `Non : aucun créneau de ${a.durationMinutes} min (${win.label}) sur la période.`,
        blocks: [
          { type: "table", title: `Créneaux libres (${win.label}, ${a.durationMinutes} min minimum)`, source: "alp", columns: ["Jour", "Disponibilités"], rows },
          {
            type: "alert",
            tone: "info",
            text: "Calcul fondé sur les événements visibles pour vous (agenda partagé inclus) et les horaires 09:00–18:00.",
          },
        ],
        data: { window: win.label, durationMinutes: a.durationMinutes, days: days.map((d) => ({ day: d.day, fullDay: d.fullDay, slots: d.slots })) },
      };
    },
  ),

  read(
    "agenda_conflicts",
    "Détecte les chevauchements d'événements à horaire sur une période de 62 jours maximum.",
    READ_SCHEMAS.agenda_conflicts,
    async (ctx, a) => {
      const err = rangeError(a.from, a.to, 62);
      if (err) return fail(err);
      const { items } = await loadItems(ctx.viewer, a.from, a.to);
      const pairs = findConflicts(items);
      return {
        ok: true,
        summary: pairs.length > 0 ? `${pairs.length} conflit(s) de planning détecté(s).` : "Aucun conflit de planning détecté.",
        blocks:
          pairs.length > 0
            ? [
                {
                  type: "table",
                  title: "Conflits de planning",
                  source: "alp",
                  columns: ["Jour", "Premier événement", "Second événement", "Horaires"],
                  rows: pairs.slice(0, MAX_ROWS).map((p) => [
                    dayLabel(dateKey(p.a.start)),
                    p.a.title,
                    p.b.title,
                    `${timeOf(p.a.start)}–${timeOf(p.a.end)} / ${timeOf(p.b.start)}–${timeOf(p.b.end)}`,
                  ]),
                },
              ]
            : [{ type: "alert", tone: "success", text: "Aucun conflit de planning sur la période." }],
        data: {
          conflicts: pairs.slice(0, 40).map((p) => ({
            day: dateKey(p.a.start),
            a: { eventId: p.a.eventId, title: p.a.title },
            b: { eventId: p.b.eventId, title: p.b.title },
          })),
        },
      };
    },
  ),

  read(
    "agenda_busy_days",
    "Identifie les journées chargées (nombre d'événements et heures planifiées) sur une période de 62 jours maximum.",
    READ_SCHEMAS.agenda_busy_days,
    async (ctx, a) => {
      const err = rangeError(a.from, a.to, 62);
      if (err) return fail(err);
      const { items } = await loadItems(ctx.viewer, a.from, a.to);
      const loads = dayKeysBetween(a.from, a.to).map((d) => dayLoad(items, d)).filter((l) => l.count > 0);
      const busy = loads.filter((l) => l.load === "chargée" || l.load === "soutenue");
      return {
        ok: true,
        summary:
          busy.length > 0
            ? `${busy.filter((l) => l.load === "chargée").length} journée(s) chargée(s) et ${busy.filter((l) => l.load === "soutenue").length} soutenue(s).`
            : "Aucune journée chargée sur la période.",
        blocks:
          loads.length > 0
            ? [
                {
                  type: "table",
                  title: "Charge par journée",
                  source: "alp",
                  columns: ["Jour", "Événements", "Heures planifiées", "Charge"],
                  rows: loads.map((l) => [dayLabel(l.day), String(l.count), `${l.hours.toLocaleString("fr-FR")} h`, l.load]),
                },
              ]
            : [{ type: "alert", tone: "info", text: "Aucun événement sur la période." }],
        data: { days: loads },
      };
    },
  ),

  read(
    "agenda_upcoming",
    "Liste les prochains événements ouverts (à venir ou en cours) sur les N prochains jours.",
    READ_SCHEMAS.agenda_upcoming,
    async (ctx, a) => {
      const from = dateKey(ctx.now);
      const { items } = await loadItems(ctx.viewer, from, addDays(from, a.days));
      const upcoming = items.filter((i) => isOpen(i) && i.end.getTime() >= ctx.now.getTime()).slice(0, 15);
      return {
        ok: true,
        summary: `${upcoming.length} événement(s) à venir dans les ${a.days} prochains jours.`,
        blocks:
          upcoming.length > 0
            ? [
                {
                  type: "list",
                  title: "Prochains événements",
                  source: "alp",
                  items: upcoming.map((i) => ({
                    text: i.title,
                    meta: `${dayLabel(dateKey(i.start))} · ${i.allDay ? "journée" : timeOf(i.start)} · ${i.assignee ?? "non assigné"}`,
                  })),
                },
              ]
            : [{ type: "alert", tone: "info", text: "Aucun événement à venir sur cette période." }],
        data: upcoming.map((i) => ({ eventId: i.eventId, title: i.title, start: i.start.toISOString(), assignee: i.assignee })),
      };
    },
  ),

  read(
    "agenda_missing_followup",
    "Liste les rendez-vous passés sans compte rendu (suivi manquant) sur les N derniers jours.",
    READ_SCHEMAS.agenda_missing_followup,
    async (ctx, a) => {
      const rows = await listPastWithoutReport(ctx.viewer, new Date(ctx.now.getTime() - a.days * MS_DAY), ctx.now);
      const companies = await crm.companyNameMap(rows.map((r) => r.crmCompanyId));
      return {
        ok: true,
        summary: `${rows.length} rendez-vous passé(s) sans compte rendu sur les ${a.days} derniers jours.`,
        blocks:
          rows.length > 0
            ? [
                {
                  type: "list",
                  title: "Rendez-vous sans compte rendu",
                  source: "alp",
                  items: rows.map((r) => ({
                    text: r.title,
                    meta: `${dayLabel(dateKey(r.startAt))} · ${companies.get(r.crmCompanyId ?? "") ?? "entreprise non liée"}`,
                  })),
                },
                {
                  type: "alert",
                  tone: "info",
                  text: "Un compte rendu peut être rédigé avec l'assistant : il sera proposé pour confirmation avant enregistrement.",
                },
              ]
            : [{ type: "alert", tone: "success", text: "Aucun rendez-vous passé sans compte rendu sur la période." }],
        data: { events: rows.map((r) => ({ eventId: r.id, title: r.title, start: r.startAt.toISOString(), companyId: r.crmCompanyId })) },
      };
    },
  ),

  read(
    "team_members",
    "Liste les collaborateurs actifs avec leur identifiant, leur rôle et leur fonction. À utiliser pour choisir un responsable ou des participants.",
    READ_SCHEMAS.team_members,
    async () => {
      const users = await listActiveUsers();
      return {
        ok: true,
        summary: `${users.length} collaborateur(s) actif(s).`,
        blocks: [
          {
            type: "table",
            title: "Équipe",
            source: "alp",
            columns: ["Nom", "Rôle", "Fonction"],
            rows: users.map((u) => [u.fullName, ROLE_LABELS[u.role] ?? u.role, u.jobTitle ?? "—"]),
          },
        ],
        data: { users: users.map((u) => ({ id: u.id, name: u.fullName, role: u.role, jobTitle: u.jobTitle })) },
      };
    },
  ),

  read(
    "crm_search",
    "Recherche une entreprise, un contact ou une affaire dans ALP Manager, et dans HubSpot si la connexion est active (lecture seule). Retourne les identifiants à réutiliser dans les propositions.",
    READ_SCHEMAS.crm_search,
    async (_ctx, a) => {
      const local = await crm.searchCrm(a.query, a.limit);
      const names = await crm.companyNameMap([...local.contacts.map((c) => c.companyId), ...local.deals.map((d) => d.companyId)]);
      const blocks: Block[] = [];
      if (local.companies.length > 0) {
        blocks.push({
          type: "table",
          title: "Entreprises (ALP Manager)",
          source: "alp",
          columns: ["Nom", "Type", "Ville", "Identifiant"],
          rows: local.companies.map((c) => [c.name, COMPANY_TYPE_LABEL[c.type] ?? c.type, c.city ?? "—", c.id]),
        });
      }
      if (local.contacts.length > 0) {
        blocks.push({
          type: "table",
          title: "Contacts (ALP Manager)",
          source: "alp",
          columns: ["Contact", "Entreprise", "Fonction", "Identifiant"],
          rows: local.contacts.map((c) => [
            [c.firstName, c.lastName].filter(Boolean).join(" "),
            (c.companyId && names.get(c.companyId)) || "—",
            c.jobTitle ?? "—",
            c.id,
          ]),
        });
      }
      if (local.deals.length > 0) {
        blocks.push({
          type: "table",
          title: "Affaires (ALP Manager)",
          source: "alp",
          columns: ["Affaire", "Entreprise", "Type", "Étape", "Identifiant"],
          rows: local.deals.map((d) => [
            d.name,
            (d.companyId && names.get(d.companyId)) || "—",
            DEAL_KIND_LABEL[d.kind] ?? d.kind,
            DEAL_STAGE_LABEL[d.stage] ?? d.stage,
            d.id,
          ]),
        });
      }

      let hubspotCount = 0;
      const hs = await getHubSpotStatus();
      if (!hs.configured) {
        blocks.push({ type: "alert", tone: "info", text: "HubSpot non connecté : recherche limitée à ALP Manager." });
      } else {
        const result = await hubspotSearch("companies", a.query, 5);
        if (result.ok) {
          hubspotCount = result.results.length;
          if (hubspotCount > 0) {
            blocks.push({
              type: "table",
              title: "Entreprises (HubSpot, lecture seule)",
              source: "hubspot",
              columns: ["Nom", "Domaine", "Ville"],
              rows: result.results.map((r) => [r.properties.name ?? "—", r.properties.domain ?? "—", r.properties.city ?? "—"]),
            });
          }
        } else {
          blocks.push({ type: "alert", tone: "warning", text: result.message });
        }
      }

      const localTotal = local.companies.length + local.contacts.length + local.deals.length;
      return {
        ok: true,
        summary:
          localTotal + hubspotCount > 0
            ? `${local.companies.length} entreprise(s), ${local.contacts.length} contact(s), ${local.deals.length} affaire(s) dans ALP Manager${hubspotCount > 0 ? `, ${hubspotCount} entreprise(s) dans HubSpot` : ""}.`
            : `Aucun client, contact ou affaire trouvé pour « ${a.query} ». Ne le supposez pas : demandez une précision ou proposez de créer l'entreprise.`,
        blocks,
        data: {
          companies: local.companies.map((c) => ({ id: c.id, name: c.name, type: c.type, city: c.city })),
          contacts: local.contacts.map((c) => ({
            id: c.id,
            name: [c.firstName, c.lastName].filter(Boolean).join(" "),
            companyId: c.companyId,
            companyName: c.companyId ? (names.get(c.companyId) ?? null) : null,
          })),
          deals: local.deals.map((d) => ({
            id: d.id,
            name: d.name,
            companyId: d.companyId,
            companyName: d.companyId ? (names.get(d.companyId) ?? null) : null,
            stage: d.stage,
            kind: d.kind,
          })),
        },
      };
    },
  ),

  read(
    "crm_company_briefing",
    "Prépare le briefing d'une entreprise : identité, contacts, affaires, derniers échanges (rendez-vous), prochains rendez-vous et points de vigilance. Nécessite l'identifiant ALP Manager.",
    READ_SCHEMAS.crm_company_briefing,
    async (ctx, a) => {
      const detail = await crm.getCompanyDetail(a.companyId);
      if (!detail) return fail("Entreprise introuvable dans ALP Manager. Vérifiez l'identifiant avec crm_search.");
      const linked = await crm.getCompanyEvents(ctx.viewer, a.companyId, ctx.now);
      const warnings = crm.companyWarnings(
        {
          contacts: detail.contacts,
          deals: detail.deals,
          upcomingCount: linked.upcoming.length,
          pastWithoutReport: linked.past.filter((p) => !p.report).length,
        },
        ctx.now,
      );
      const c = detail.company;
      const blocks: Block[] = [
        {
          type: "kv",
          title: `Entreprise : ${c.name}`,
          source: "alp",
          items: [
            { label: "Type", value: COMPANY_TYPE_LABEL[c.type] ?? c.type },
            { label: "Ville", value: c.city ?? "Non renseignée" },
            { label: "Secteur", value: c.sector ?? "Non renseigné" },
            { label: "Notes", value: c.notes ?? "—" },
          ],
        },
      ];
      if (detail.contacts.length > 0) {
        blocks.push({
          type: "table",
          title: "Contacts associés",
          source: "alp",
          columns: ["Nom", "Fonction", "E-mail", "Téléphone"],
          rows: detail.contacts.map((k) => [[k.firstName, k.lastName].filter(Boolean).join(" "), k.jobTitle ?? "—", k.email ?? "—", k.phone ?? "—"]),
        });
      } else {
        blocks.push({ type: "alert", tone: "info", text: "Aucun contact associé à cette entreprise." });
      }
      if (detail.deals.length > 0) {
        blocks.push({
          type: "table",
          title: "Affaires",
          source: "alp",
          columns: ["Affaire", "Type", "Étape", "Montant", "Dernière interaction"],
          rows: detail.deals.map((d) => [
            d.name,
            DEAL_KIND_LABEL[d.kind] ?? d.kind,
            DEAL_STAGE_LABEL[d.stage] ?? d.stage,
            euros(d.amountEur),
            d.lastInteractionAt ? dayLabel(dateKey(d.lastInteractionAt)) : "Aucune",
          ]),
        });
      }
      if (linked.past.length > 0) {
        blocks.push({
          type: "list",
          title: "Derniers échanges (rendez-vous ALP Manager)",
          source: "alp",
          items: linked.past.map((e) => ({
            text: e.title,
            meta: `${dayLabel(dateKey(e.startAt))} · ${e.report ? "compte rendu renseigné" : "sans compte rendu"}`,
          })),
        });
      } else {
        blocks.push({ type: "alert", tone: "info", text: "Aucun rendez-vous passé enregistré avec cette entreprise." });
      }
      if (linked.upcoming.length > 0) {
        blocks.push({
          type: "list",
          title: "Prochains rendez-vous",
          source: "alp",
          items: linked.upcoming.map((e) => ({ text: e.title, meta: `${dayLabel(dateKey(e.startAt))} · ${timeOf(e.startAt)}` })),
        });
      }
      if (warnings.length > 0) {
        blocks.push({
          type: "list",
          title: "Points de vigilance (règles ALP, données vérifiées)",
          source: "alp",
          items: warnings.map((text) => ({ text })),
        });
      }
      return {
        ok: true,
        summary: `Briefing ${c.name} : ${detail.contacts.length} contact(s), ${detail.deals.length} affaire(s), ${linked.past.length} échange(s) passé(s), ${warnings.length} point(s) de vigilance.`,
        blocks,
        data: {
          company: { id: c.id, name: c.name, type: c.type, city: c.city },
          contacts: detail.contacts.map((k) => ({ id: k.id, name: [k.firstName, k.lastName].filter(Boolean).join(" "), email: k.email })),
          deals: detail.deals.map((d) => ({ id: d.id, name: d.name, stage: d.stage, kind: d.kind, amountEur: d.amountEur })),
          upcoming: linked.upcoming.map((e) => ({ eventId: e.id, title: e.title, start: e.startAt.toISOString() })),
          warnings,
        },
      };
    },
  ),

  read(
    "crm_open_deals",
    "Liste les affaires ouvertes (pistes, devis envoyés, négociations, commandes, production), filtrables par type et par étape.",
    READ_SCHEMAS.crm_open_deals,
    async (_ctx, a) => {
      const rows = await crm.listOpenDeals({ kind: a.kind, stage: a.stage, limit: a.limit });
      return {
        ok: true,
        summary: rows.length > 0 ? `${rows.length} affaire(s) ouverte(s).` : "Aucune affaire ouverte ne correspond à ces critères.",
        blocks:
          rows.length > 0
            ? [
                {
                  type: "table",
                  title: "Affaires ouvertes",
                  source: "alp",
                  columns: ["Affaire", "Entreprise", "Type", "Étape", "Montant", "Dernière interaction"],
                  rows: rows.map((r) => [
                    r.deal.name,
                    r.companyName ?? "—",
                    DEAL_KIND_LABEL[r.deal.kind] ?? r.deal.kind,
                    DEAL_STAGE_LABEL[r.deal.stage] ?? r.deal.stage,
                    euros(r.deal.amountEur),
                    r.deal.lastInteractionAt ? dayLabel(dateKey(r.deal.lastInteractionAt)) : "Aucune",
                  ]),
                },
              ]
            : [{ type: "alert", tone: "info", text: "Aucune affaire ouverte ne correspond à ces critères dans ALP Manager." }],
        data: rows.map((r) => ({
          dealId: r.deal.id,
          name: r.deal.name,
          companyName: r.companyName,
          kind: r.deal.kind,
          stage: r.deal.stage,
          amountEur: r.deal.amountEur,
          lastInteractionAt: r.deal.lastInteractionAt?.toISOString() ?? null,
        })),
      };
    },
  ),

  read(
    "crm_recontact_candidates",
    "Identifie les clients et affaires à recontacter : affaires ouvertes sans interaction récente, ou devis restés sans réponse. Filtres optionnels par type et par étape.",
    READ_SCHEMAS.crm_recontact_candidates,
    async (ctx, a) => {
      const rows = await crm.recontactCandidates(a.days, ctx.now, { kind: a.kind, stage: a.stage });
      return {
        ok: true,
        summary:
          rows.length > 0
            ? `${rows.length} dossier(s) à recontacter (seuil : ${a.days} jours).`
            : `Aucun dossier à recontacter au seuil de ${a.days} jours.`,
        blocks:
          rows.length > 0
            ? [
                {
                  type: "list",
                  title: "Clients à recontacter",
                  source: "alp",
                  items: rows.slice(0, MAX_ROWS).map((r) => ({
                    text: `${r.companyName ?? "Entreprise"} — ${r.dealName} (${DEAL_STAGE_LABEL[r.stage] ?? r.stage}${r.amountEur ? `, ${euros(r.amountEur)}` : ""})`,
                    meta: r.reason,
                  })),
                },
              ]
            : [{ type: "alert", tone: "success", text: `Aucune relance nécessaire au seuil de ${a.days} jours.` }],
        data: rows,
      };
    },
  ),

  read(
    "hubspot_status",
    "Indique l'état de la connexion HubSpot, les scopes accordés et les scopes manquants pour les lectures de l'assistant.",
    READ_SCHEMAS.hubspot_status,
    async () => {
      const status = await getHubSpotStatus();
      const required = Object.values(HUBSPOT_SCOPES);
      const connection = !status.configured
        ? "Non connecté (HUBSPOT_ACCESS_TOKEN absent)"
        : status.reachable
          ? "Connecté"
          : `Erreur : ${status.error ?? "inconnue"}`;
      const blocks: Block[] = [
        {
          type: "kv",
          title: "Connexion HubSpot",
          source: "hubspot",
          items: [
            { label: "État", value: connection },
            { label: "Scopes requis", value: required.join(", ") },
            { label: "Scopes manquants", value: status.missingScopes.length > 0 ? status.missingScopes.join(", ") : "aucun" },
          ],
        },
      ];
      if (status.configured && status.reachable && status.missingScopes.length > 0) {
        blocks.push({
          type: "alert",
          tone: "warning",
          text: "Certaines lectures HubSpot seront refusées tant que ces scopes ne sont pas accordés à l'application.",
        });
      }
      return {
        ok: true,
        summary: `HubSpot : ${connection}.`,
        blocks,
        data: { configured: status.configured, reachable: status.reachable, scopes: status.scopes, missingScopes: status.missingScopes },
      };
    },
  ),

  read(
    "briefing_today",
    "Génère le briefing du jour : rendez-vous, tâches prioritaires, relances, rendez-vous à préparer, conflits, dossiers importants, événements à venir et ordre de priorité.",
    READ_SCHEMAS.briefing_today,
    async (ctx) => {
      const briefing = await buildBriefing(ctx.viewer, ctx.now);
      return { ok: true, summary: briefing.summary, blocks: briefing.blocks, data: briefing.data };
    },
  ),
];


