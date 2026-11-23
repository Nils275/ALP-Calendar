/*
 * Gestion du temps de l'agenda, entièrement en fuseau Europe/Paris.
 * - Les instants sont stockés en UTC (timestamptz).
 * - Les "jours civils" sont manipulés sous forme de clés "YYYY-MM-DD" (heure de Paris).
 * Aucune dépendance externe : les conversions passent par Intl.
 * Ce module est pur et utilisable côté serveur comme côté client.
 */

export const PARIS_TZ = "Europe/Paris";

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: PARIS_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

export type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function toWallClock(date: Date): WallClock {
  const parts = partsFormatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour") % 24,
    minute: read("minute"),
    second: read("second"),
  };
}

/** Décalage (ms) entre l'heure murale de Paris et UTC, à l'instant donné. */
function offsetAt(date: Date): number {
  const w = toWallClock(date);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  const truncated = Math.floor(date.getTime() / 1000) * 1000;
  return asUtc - truncated;
}

/** Convertit une date/heure murale de Paris en instant UTC. */
export function zonedToDate(year: number, month: number, day: number, hour = 0, minute = 0): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = guess - offsetAt(new Date(guess));
  const second = guess - offsetAt(new Date(first));
  return new Date(second);
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

export function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Clé "YYYY-MM-DD" du jour civil de Paris correspondant à l'instant. */
export function dateKey(date: Date): string {
  const w = toWallClock(date);
  return `${pad4(w.year)}-${pad2(w.month)}-${pad2(w.day)}`;
}

/** Heure "HH:mm" (Paris) de l'instant. */
export function timeOf(date: Date): string {
  const w = toWallClock(date);
  return `${pad2(w.hour)}:${pad2(w.minute)}`;
}

/** Minutes écoulées depuis minuit (Paris). */
export function minutesOfDay(date: Date): number {
  const w = toWallClock(date);
  return w.hour * 60 + w.minute;
}

export function parseDateKey(key: string): { year: number; month: number; day: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { year: y, month: m, day: d };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(key: string, n: number): string {
  const { year, month, day } = parseDateKey(key);
  return new Date(Date.UTC(year, month - 1, day + n)).toISOString().slice(0, 10);
}

export function addMonths(key: string, n: number): string {
  const { year, month, day } = parseDateKey(key);
  const target = new Date(Date.UTC(year, month - 1 + n, 1));
  const y = target.getUTCFullYear();
  const m = target.getUTCMonth() + 1;
  return `${pad4(y)}-${pad2(m)}-${pad2(Math.min(day, daysInMonth(y, m)))}`;
}

/** Nombre de jours civils entre deux clés (b - a). */
export function diffDays(a: string, b: string): number {
  const pa = parseDateKey(a);
  const pb = parseDateKey(b);
  return Math.round(
    (Date.UTC(pb.year, pb.month - 1, pb.day) - Date.UTC(pa.year, pa.month - 1, pa.day)) / 86_400_000,
  );
}

/** Index du jour de la semaine, lundi = 0 … dimanche = 6. */
export function weekdayIndex(key: string): number {
  const { year, month, day } = parseDateKey(key);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

export function startOfWeekKey(key: string): string {
  return addDays(key, -weekdayIndex(key));
}

export function todayKey(): string {
  return dateKey(new Date());
}

export function instantFromKey(key: string, hour = 0, minute = 0): Date {
  const { year, month, day } = parseDateKey(key);
  return zonedToDate(year, month, day, hour, minute);
}

/** Parse "HH:mm" → [heure, minute]. */
export function parseTime(value: string): [number, number] {
  const [h, m] = value.split(":").map(Number);
  return [h, m];
}

/** Arrondit des minutes au pas donné. */
export function snapMinutes(minutes: number, step = 15): number {
  return Math.round(minutes / step) * step;
}

/** Grille de 6 semaines (42 jours) commençant le lundi qui précède le 1er du mois. */
export function monthGridKeys(anchorKey: string): string[] {
  const { year, month } = parseDateKey(anchorKey);
  const first = `${pad4(year)}-${pad2(month)}-01`;
  const start = startOfWeekKey(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/* ------------------------------------------------------------------ */
/* Formatage (locale française, fuseau Paris)                           */
/* ------------------------------------------------------------------ */

const longDayFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: PARIS_TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const shortDayFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: PARIS_TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
});
const monthFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: PARIS_TZ,
  month: "long",
  year: "numeric",
});
const fullDateFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: PARIS_TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatDayLong(key: string): string {
  return capitalize(longDayFormatter.format(instantFromKey(key, 12)));
}

export function formatDayShort(key: string): string {
  return capitalize(shortDayFormatter.format(instantFromKey(key, 12))).replace(/\.$/, "");
}

export function formatMonthTitle(key: string): string {
  return capitalize(monthFormatter.format(instantFromKey(key, 12)));
}

export function formatInstantLong(date: Date): string {
  return capitalize(fullDateFormatter.format(date)).replace(",", "");
}

export function formatDayNumber(key: string): number {
  return parseDateKey(key).day;
}

/** Libellé lisible d'une période (heures ou journée entière). */
export function formatPeriod(start: Date, end: Date, allDay: boolean): string {
  if (allDay) {
    const lastKey = dateKey(new Date(end.getTime() - 1));
    const startKey = dateKey(start);
    if (lastKey === startKey) return "Journée entière";
    return `Du ${formatDayShort(startKey)} au ${formatDayShort(lastKey)}`;
  }
  const sameDay = dateKey(start) === dateKey(end);
  if (sameDay) return `${timeOf(start)} – ${timeOf(end)}`;
  return `${formatDayShort(dateKey(start))} ${timeOf(start)} → ${formatDayShort(dateKey(end))} ${timeOf(end)}`;
}

/* ------------------------------------------------------------------ */
/* Opérations de période                                               */
/* ------------------------------------------------------------------ */

export type ViewMode = "day" | "week" | "month" | "list";

/** Bornes [from, to) en clés de jour civil selon la vue. */
export function rangeForView(view: ViewMode, anchorKey: string): { fromKey: string; toKey: string } {
  switch (view) {
    case "day":
      return { fromKey: anchorKey, toKey: addDays(anchorKey, 1) };
    case "week": {
      const start = startOfWeekKey(anchorKey);
      return { fromKey: start, toKey: addDays(start, 7) };
    }
    case "month": {
      const { year, month } = parseDateKey(anchorKey);
      const first = `${pad4(year)}-${pad2(month)}-01`;
      const start = startOfWeekKey(first);
      return { fromKey: start, toKey: addDays(start, 42) };
    }
    case "list":
      return { fromKey: anchorKey, toKey: addDays(anchorKey, 60) };
  }
}

/** Jours affichés dans une vue temps (jour ou semaine). */
export function daysForView(view: "day" | "week", anchorKey: string): string[] {
  if (view === "day") return [anchorKey];
  const start = startOfWeekKey(anchorKey);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Dernier jour civil (inclus) couvert par un intervalle [start, end). */
export function lastDayKeyOf(end: Date): string {
  return dateKey(new Date(end.getTime() - 1));
}
