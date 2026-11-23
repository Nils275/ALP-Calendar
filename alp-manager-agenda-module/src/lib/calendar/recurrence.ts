/*
 * Récurrences de l'agenda au format RRULE simplifié (sous-ensemble RFC 5545) :
 *   FREQ=DAILY|WEEKLY|MONTHLY;INTERVAL=n;BYDAY=MO,TU;UNTIL=YYYYMMDD
 * L'expansion se fait en heure de Paris, pure et sans dépendance.
 */
import { WEEKDAY_CODES } from "./constants";
import {
  addDays,
  addMonths,
  dateKey,
  diffDays,
  instantFromKey,
  pad2,
  parseDateKey,
  toWallClock,
  weekdayIndex,
} from "./time";

export type RecurrenceFreq = "DAILY" | "WEEKLY" | "MONTHLY";

export type Recurrence = {
  freq: RecurrenceFreq;
  interval: number;
  /** Jours de la semaine (0 = lundi … 6 = dimanche). Utilisé uniquement en WEEKLY. */
  weekdays: number[];
  /** Date de fin incluse "YYYY-MM-DD", ou null (sans fin). */
  until: string | null;
};

const DAY_NAMES_FR = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];

export function buildRule(r: Recurrence): string {
  const parts = [`FREQ=${r.freq}`, `INTERVAL=${Math.max(1, r.interval)}`];
  if (r.freq === "WEEKLY" && r.weekdays.length > 0) {
    const codes = [...new Set(r.weekdays)]
      .sort((a, b) => a - b)
      .map((i) => WEEKDAY_CODES[i]);
    parts.push(`BYDAY=${codes.join(",")}`);
  }
  if (r.until) parts.push(`UNTIL=${r.until.replaceAll("-", "")}`);
  return parts.join(";");
}

export function parseRule(rule: string): Recurrence | null {
  const map = new Map<string, string>();
  for (const part of rule.split(";")) {
    const idx = part.indexOf("=");
    if (idx > 0) map.set(part.slice(0, idx), part.slice(idx + 1));
  }
  const freq = map.get("FREQ");
  if (freq !== "DAILY" && freq !== "WEEKLY" && freq !== "MONTHLY") return null;
  const interval = Math.max(1, Number(map.get("INTERVAL") ?? "1") || 1);
  const weekdays = (map.get("BYDAY") ?? "")
    .split(",")
    .map((code) => (WEEKDAY_CODES as readonly string[]).indexOf(code))
    .filter((i) => i >= 0);
  const untilRaw = map.get("UNTIL");
  const until =
    untilRaw && /^\d{8}$/.test(untilRaw)
      ? `${untilRaw.slice(0, 4)}-${untilRaw.slice(4, 6)}-${untilRaw.slice(6, 8)}`
      : null;
  return { freq, interval, weekdays, until };
}

/** Libellé lisible de la récurrence, ex. « Toutes les semaines (lun., mer.) ». */
export function describeRecurrence(rule: string | null): string | null {
  if (!rule) return null;
  const r = parseRule(rule);
  if (!r) return "Récurrence personnalisée";
  const unit = r.freq === "DAILY" ? "jour" : r.freq === "WEEKLY" ? "semaine" : "mois";
  let text: string;
  if (r.interval === 1) {
    text = r.freq === "DAILY" ? "Tous les jours" : r.freq === "WEEKLY" ? "Toutes les semaines" : "Tous les mois";
  } else {
    text = `Tous les ${r.interval} ${unit}s`;
  }
  if (r.freq === "WEEKLY" && r.weekdays.length > 0) {
    const names = [...r.weekdays].sort((a, b) => a - b).map((i) => DAY_NAMES_FR[i]);
    text += ` (${names.join(", ")})`;
  }
  if (r.until) {
    const { year, month, day } = parseDateKey(r.until);
    text += ` jusqu'au ${pad2(day)}/${pad2(month)}/${year}`;
  }
  return text;
}

export type OccurrenceSpan = { start: Date; end: Date };

/** Génère les clés de jour (ordre croissant) des occurrences jusqu'à boundKey inclus. */
function* occurrenceDayKeys(rule: Recurrence, startKey: string, boundKey: string): Generator<string> {
  const interval = Math.max(1, rule.interval);

  if (rule.freq === "DAILY") {
    for (let i = 0; ; i++) {
      const key = addDays(startKey, i * interval);
      if (key > boundKey) return;
      yield key;
    }
  }

  if (rule.freq === "WEEKLY") {
    const weekdays = rule.weekdays.length > 0 ? [...new Set(rule.weekdays)].sort((a, b) => a - b) : [weekdayIndex(startKey)];
    const weekStart = addDays(startKey, -weekdayIndex(startKey));
    for (let w = 0; ; w++) {
      const monday = addDays(weekStart, w * interval * 7);
      if (monday > boundKey) return;
      for (const wd of weekdays) {
        const key = addDays(monday, wd);
        if (key >= startKey && key <= boundKey) yield key;
      }
    }
  }

  // MONTHLY : même jour du mois, tous les N mois (mois sans ce jour ignorés)
  const { year, month, day } = parseDateKey(startKey);
  for (let i = 0; ; i++) {
    const firstOfMonth = addMonths(`${year}-${pad2(month)}-01`, i * interval);
    if (firstOfMonth > boundKey) return;
    const { year: y, month: m } = parseDateKey(firstOfMonth);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (day > lastDay) continue;
    const key = `${y}-${pad2(m)}-${pad2(day)}`;
    if (key >= startKey && key <= boundKey) yield key;
  }
}

/**
 * Expanse une série en occurrences qui chevauchent [rangeStart, rangeEnd).
 * - Événements à heure : même heure murale de Paris pour chaque occurrence, durée conservée.
 * - Journée entière : `end` est exclusif (minuit du jour suivant), durée en jours conservée.
 */
export function expandOccurrences(opts: {
  start: Date;
  end: Date;
  allDay: boolean;
  rule: Recurrence;
  rangeStart: Date;
  rangeEnd: Date;
  limit?: number;
}): OccurrenceSpan[] {
  const { start, end, allDay, rule, rangeStart, rangeEnd } = opts;
  const limit = opts.limit ?? 1000;

  const startKey = dateKey(start);
  const spanDays = allDay ? diffDays(startKey, dateKey(end)) : 0;
  const durationMs = end.getTime() - start.getTime();
  const wall = toWallClock(start);

  const boundKey = dateKey(rangeEnd);
  const out: OccurrenceSpan[] = [];

  for (const occKey of occurrenceDayKeys(rule, startKey, boundKey)) {
    if (rule.until && occKey > rule.until) break;

    let s: Date;
    let e: Date;
    if (allDay) {
      s = instantFromKey(occKey);
      e = instantFromKey(addDays(occKey, Math.max(1, spanDays)));
    } else {
      s = instantFromKey(occKey, wall.hour, wall.minute);
      e = new Date(s.getTime() + durationMs);
    }

    if (s.getTime() >= rangeEnd.getTime()) break;
    if (e.getTime() <= rangeStart.getTime()) continue;

    out.push({ start: s, end: e });
    if (out.length >= limit) break;
  }

  return out;
}
