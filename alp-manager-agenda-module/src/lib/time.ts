import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { fr } from "date-fns/locale";

export const PARIS_TZ = "Europe/Paris";

/** Clé de date locale (Europe/Paris) : yyyy-MM-dd */
export function parisDateKey(date: Date): string {
  return formatInTimeZone(date, PARIS_TZ, "yyyy-MM-dd");
}

export function parisTimeKey(date: Date): string {
  return formatInTimeZone(date, PARIS_TZ, "HH:mm");
}

export function parisMinutesOfDay(date: Date): number {
  const [h, m] = parisTimeKey(date).split(":").map(Number);
  return h * 60 + m;
}

/** Convertit une heure murale Europe/Paris en Date UTC. */
export function fromParisWallTime(dateKey: string, minutes: number): Date {
  const clamped = Math.max(0, Math.min(minutes, 24 * 60 - 1));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  const wall = `${dateKey}T${String(hours).padStart(2, "0")}:${String(
    mins,
  ).padStart(2, "0")}:00`;
  return fromZonedTime(wall, PARIS_TZ);
}

/** Date "plain" (minuit UTC) à partir d'une clé, pour l'arithmétique de jours. */
export function plainDate(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

export function keyFromPlain(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function addDaysKey(dateKey: string, days: number): string {
  return keyFromPlain(addDays(plainDate(dateKey), days));
}

export function addMonthsKey(dateKey: string, months: number): string {
  return keyFromPlain(addMonths(plainDate(dateKey), months));
}

/** 0 = lundi ... 6 = dimanche */
export function weekdayIndex(dateKey: string): number {
  return (plainDate(dateKey).getUTCDay() + 6) % 7;
}

export function startOfWeekKey(dateKey: string): string {
  return keyFromPlain(
    startOfWeek(plainDate(dateKey), { weekStartsOn: 1 }),
  );
}

export function endOfWeekKey(dateKey: string): string {
  return keyFromPlain(endOfWeek(plainDate(dateKey), { weekStartsOn: 1 }));
}

export function startOfMonthKey(dateKey: string): string {
  return keyFromPlain(startOfMonth(plainDate(dateKey)));
}

export function endOfMonthKey(dateKey: string): string {
  return keyFromPlain(endOfMonth(plainDate(dateKey)));
}

export function weekKeys(dateKey: string): string[] {
  const start = startOfWeekKey(dateKey);
  return Array.from({ length: 7 }, (_, i) => addDaysKey(start, i));
}

/** Grille du mois, toujours complète (semaines de lundi à dimanche). */
export function monthGridKeys(dateKey: string): string[] {
  const first = startOfMonthKey(dateKey);
  const last = endOfMonthKey(dateKey);
  const gridStart = startOfWeekKey(first);
  const gridEnd = endOfWeekKey(last);
  const days = eachDayOfInterval({
    start: plainDate(gridStart),
    end: plainDate(gridEnd),
  });
  return days.map(keyFromPlain);
}

export function diffDays(a: string, b: string): number {
  return differenceInCalendarDays(plainDate(a), plainDate(b));
}

export function diffWeeks(a: string, b: string): number {
  return differenceInCalendarWeeks(plainDate(a), plainDate(b), {
    weekStartsOn: 1,
  });
}

export function diffMonths(a: string, b: string): number {
  return differenceInCalendarMonths(plainDate(a), plainDate(b));
}

export function formatDayLabel(dateKey: string): string {
  return format(plainDate(dateKey), "EEE d MMM", { locale: fr });
}

export function formatFullDate(dateKey: string): string {
  return format(plainDate(dateKey), "EEEE d MMMM yyyy", {
    locale: fr,
  });
}

export function formatShortDate(dateKey: string): string {
  return format(plainDate(dateKey), "dd/MM/yyyy");
}

export function formatMonthYear(dateKey: string): string {
  return format(plainDate(dateKey), "MMMM yyyy", { locale: fr });
}

export function frenchWeekday(dateKey: string): string {
  return format(plainDate(dateKey), "EEEE", { locale: fr });
}

export function parisNowIso(): string {
  return new Date().toISOString();
}

export function formatParisDateTime(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return formatInTimeZone(date, PARIS_TZ, "dd/MM/yyyy 'à' HH:mm");
}

export function formatParisTime(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return formatInTimeZone(date, PARIS_TZ, "HH:mm");
}

export function formatParisDate(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return formatInTimeZone(date, PARIS_TZ, "dd/MM/yyyy");
}

export const TIME_GRID = {
  startHour: 7,
  endHour: 20,
};

/** Formate une clé de date (sans décalage de fuseau). */
export function formatKey(dateKey: string, pattern: string): string {
  return formatInTimeZone(plainDate(dateKey), "UTC", pattern, { locale: fr });
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
