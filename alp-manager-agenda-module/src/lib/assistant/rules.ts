/*
 * Planificateur déterministe (mode simplifié, sans clé IA) : traduit les demandes courantes
 * en appels d'outils vérifiés. Même registre, mêmes droits et même audit que le mode IA.
 */
import { addDays, addMonths, dateKey, startOfWeekKey, weekdayIndex } from "@/lib/calendar/time";

export type PlannedCall = { name: string; args: Record<string, unknown> };
export type RulesPlan = { calls: PlannedCall[]; note?: string };

const WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

const STOPWORDS = new Set([
  "les", "des", "une", "pour", "avec", "cette", "cet", "ceux", "celle", "entreprise", "entreprises", "client", "clients",
  "prospect", "prospects", "briefing", "prepare", "moi", "mon", "mes", "ma", "retrouve", "trouve", "cherche", "recherche",
  "rendez", "vous", "rdv", "demain", "aujourd", "hui", "semaine", "mois", "journee", "apres", "midi", "matin", "fais",
  "donne", "quels", "quel", "quelle", "sont", "est", "que", "dans", "sur", "bonjour", "svp", "stp", "peux", "tu", "nous",
  "notre", "votre", "attendent", "attend", "relance", "relancer", "devis", "dossier", "dossiers", "creneau", "creneaux",
  "disponible", "disponibilite", "libre", "sans", "compte", "rendu", "suivi", "conflit", "charge", "chargees", "ont",
  "heure", "heures", "faire", "fait", "aussi", "leur", "leurs", "vos", "ses", "son", "sa", "ces", "the", "du", "de",
  "la", "le", "un", "et", "ou", "en", "au", "aux", "qui", "ont", "pas",
  ...WEEKDAYS,
]);

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Span = { from: string; to: string; explicit: boolean };

function resolveSpan(n: string, now: Date): Span {
  const today = dateKey(now);
  if (/semaine prochaine/.test(n)) {
    const start = addDays(startOfWeekKey(today), 7);
    return { from: start, to: addDays(start, 6), explicit: true };
  }
  if (/\bsemaine\b/.test(n)) {
    const start = startOfWeekKey(today);
    return { from: start, to: addDays(start, 6), explicit: true };
  }
  if (/\bmois\b/.test(n)) {
    const first = `${today.slice(0, 8)}01`;
    return { from: first, to: addDays(addMonths(first, 1), -1), explicit: true };
  }
  if (/apres[ -]demain/.test(n)) return { from: addDays(today, 2), to: addDays(today, 2), explicit: true };
  if (/\bdemain\b/.test(n)) return { from: addDays(today, 1), to: addDays(today, 1), explicit: true };
  if (/aujourd hui/.test(n)) return { from: today, to: today, explicit: true };
  for (let i = 0; i < WEEKDAYS.length; i++) {
    if (new RegExp(`\\b${WEEKDAYS[i]}\\b`).test(n)) {
      const delta = (i - weekdayIndex(today) + 7) % 7;
      const day = addDays(today, delta);
      return { from: day, to: day, explicit: true };
    }
  }
  return { from: today, to: today, explicit: false };
}

function resolveWindow(n: string): "journee" | "matin" | "apres-midi" {
  if (/apres[ -]?midi/.test(n)) return "apres-midi";
  if (/\bmatin/.test(n)) return "matin";
  return "journee";
}

function resolveDuration(n: string): number {
  const minutes = n.match(/(\d{2,3})\s*min/);
  if (minutes) return Math.min(480, Math.max(15, Number(minutes[1])));
  const hours = n.match(/(\d)\s*heures?\b/);
  if (hours) return Math.min(480, Number(hours[1]) * 60);
  return 60;
}

function keywords(n: string): string | null {
  const words = n.split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return words.length > 0 ? words.join(" ") : null;
}

function dealFilters(n: string): { kind?: string; stage?: string } {
  const filters: { kind?: string; stage?: string } = {};
  if (/revision|amortisseur|suspension|entretien/.test(n)) filters.kind = "revision";
  else if (/\bsav\b|garantie|rechange|piece/.test(n)) filters.kind = "sav";
  if (/devis|offre|proposition/.test(n)) filters.stage = "quote_sent";
  else if (/commande/.test(n)) filters.stage = "order";
  return filters;
}

function explicitOrWeek(span: Span, today: string): { from: string; to: string } {
  if (span.explicit) return { from: span.from, to: span.to };
  const start = startOfWeekKey(today);
  return { from: start, to: addDays(start, 6) };
}

function explicitOrNextWeek(span: Span, today: string): { from: string; to: string } {
  if (span.explicit) return { from: span.from, to: span.to };
  return { from: today, to: addDays(today, 6) };
}

export function planRules(text: string, now: Date): RulesPlan {
  const n = normalizeText(text);
  const span = resolveSpan(n, now);
  const today = dateKey(now);
  const has = (re: RegExp) => re.test(n);
  const range = { from: span.from, to: span.to };

  if (
    has(/entreprise|client|societe|prospect/) &&
    has(/briefing|prepare|fiche|historique|infos?|devis|dossier/) &&
    !has(/relance|recontact|a relancer/)
  ) {
    const query = keywords(n);
    if (!query || query.length < 2) {
      return {
        calls: [],
        note: "Indiquez le nom de l'entreprise ou du client : je le recherche dans ALP Manager et dans HubSpot si la connexion est active.",
      };
    }
    return { calls: [{ name: "crm_search", args: { query } }] };
  }

  if (has(/briefing|prepare moi ma journee|ma journee|point du jour|bilan du jour|programme du jour/)) {
    return { calls: [{ name: "briefing_today", args: {} }] };
  }

  if (has(/relance|recontact|a relancer/)) {
    const filters = dealFilters(n);
    const calls: PlannedCall[] = [{ name: "crm_recontact_candidates", args: { days: 14, ...filters } }];
    if (filters.stage === "quote_sent") calls.push({ name: "crm_open_deals", args: { ...filters, limit: 15 } });
    return { calls };
  }

  if (has(/compte rendu|sans suivi|suivi manquant|sans compte/)) {
    return { calls: [{ name: "agenda_missing_followup", args: { days: 30 } }] };
  }

  if (has(/recapitulatif|resume|bilan/) && has(/semaine|mois/)) {
    return {
      calls: [
        { name: "agenda_overview", args: range },
        { name: "agenda_busy_days", args: range },
      ],
    };
  }

  if (has(/conflit|chevauch|superpos/)) {
    return { calls: [{ name: "agenda_conflicts", args: explicitOrWeek(span, today) }] };
  }

  if (has(/surcharg|trop charg|journees? chargees?|chargee/)) {
    return { calls: [{ name: "agenda_busy_days", args: explicitOrWeek(span, today) }] };
  }

  if (has(/creneau|disponib|\blibre\b|\bdispo\b/)) {
    return {
      calls: [
        {
          name: "agenda_availability",
          args: { ...explicitOrNextWeek(span, today), durationMinutes: resolveDuration(n), window: resolveWindow(n) },
        },
      ],
    };
  }

  if (has(/retrouve|trouve|cherche|recherche|quand est|ou est/)) {
    const query = keywords(n);
    if (!query || query.length < 2) {
      return { calls: [], note: "Précisez un mot-clé (titre, client, lieu) à rechercher." };
    }
    return {
      calls: [
        { name: "agenda_find", args: { query } },
        { name: "crm_search", args: { query } },
      ],
    };
  }

  if (has(/prochain|a venir|bientot/)) {
    return { calls: [{ name: "agenda_upcoming", args: { days: 7 } }] };
  }

  if (has(/rendez[ -]?vous|\brdv\b|agenda|planning|evenement|reunion|journee|semaine|aujourd hui|demain|mois/)) {
    return { calls: [{ name: "agenda_overview", args: range }] };
  }

  return { calls: [] };
}
