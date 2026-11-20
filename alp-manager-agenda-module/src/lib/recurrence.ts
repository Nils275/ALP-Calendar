import {
  addDaysKey,
  diffDays,
  diffMonths,
  diffWeeks,
  fromParisWallTime,
  parisDateKey,
  parisMinutesOfDay,
  plainDate,
  weekdayIndex,
} from "@/lib/time";

export type RecurrenceFrequency = "DAILY" | "WEEKLY" | "MONTHLY";

export type RecurrenceSpec = {
  freq: RecurrenceFrequency;
  interval: number;
  byDay: number[]; // 0 = lundi ... 6 = dimanche
  until?: string; // yyyy-MM-dd (Paris)
  count?: number;
};

const DAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

export function parseRecurrence(rule?: string | null): RecurrenceSpec | null {
  if (!rule) return null;
  const parts = rule
    .replace(/^RRULE:/i, "")
    .split(";")
    .reduce<Record<string, string>>((acc, chunk) => {
      const [key, value] = chunk.split("=");
      if (key && value) acc[key.toUpperCase()] = value.toUpperCase();
      return acc;
    }, {});

  const freq = parts.FREQ as RecurrenceFrequency | undefined;
  if (!freq || !["DAILY", "WEEKLY", "MONTHLY"].includes(freq)) return null;

  const byDay = (parts.BYDAY ?? "")
    .split(",")
    .map((code) => DAY_CODES.indexOf(code.trim() as (typeof DAY_CODES)[number]))
    .filter((idx) => idx >= 0);

  let until: string | undefined;
  if (parts.UNTIL) {
    const raw = parts.UNTIL.replace(/[^0-9TZ]/g, "");
    if (raw.length >= 8) {
      until = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    }
  }

  const count = parts.COUNT ? Number.parseInt(parts.COUNT, 10) : undefined;

  return {
    freq,
    interval: Math.max(1, Number.parseInt(parts.INTERVAL ?? "1", 10) || 1),
    byDay,
    until,
    count: Number.isFinite(count) && count && count > 0 ? count : undefined,
  };
}

export function serializeRecurrence(spec: RecurrenceSpec | null): string | null {
  if (!spec) return null;
  const segments = [`FREQ=${spec.freq}`];
  if (spec.interval > 1) segments.push(`INTERVAL=${spec.interval}`);
  if (spec.freq === "WEEKLY" && spec.byDay.length > 0) {
    segments.push(
      `BYDAY=${[...spec.byDay]
        .sort((a, b) => a - b)
        .map((idx) => DAY_CODES[idx])
        .join(",")}`,
    );
  }
  if (spec.until) segments.push(`UNTIL=${spec.until.replace(/-/g, "")}T235959`);
  else if (spec.count) segments.push(`COUNT=${spec.count}`);
  return segments.join(";");
}

export function describeRecurrence(rule?: string | null): string | null {
  const spec = parseRecurrence(rule);
  if (!spec) return null;
  const dayNames = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
  const every = spec.interval > 1 ? `toutes les ${spec.interval} ` : "chaque ";
  if (spec.freq === "DAILY") {
    return spec.interval > 1 ? `Tous les ${spec.interval} jours` : "Tous les jours";
  }
  if (spec.freq === "WEEKLY") {
    const byDay =
      spec.byDay.length > 0
        ? ` (${spec.byDay.map((idx) => dayNames[idx]).join(", ")})`
        : "";
    return `${spec.interval > 1 ? every + "semaines" : "Chaque semaine"}${byDay}`;
  }
  return spec.interval > 1 ? `Tous les ${spec.interval} mois` : "Tous les mois";
}

export type OccurrenceSlot = {
  occurrenceDate: string;
  startAt: Date;
  endAt: Date;
  occurrenceKey: string;
};

export type ExpandableEvent = {
  id: string;
  startAt: Date;
  endAt: Date;
  recurrenceRule: string | null;
  recurrenceExceptions: string[] | null;
};

/**
 * Déploie un événement (récurrent ou non) sur une fenêtre de dates Paris.
 * Les heures murales sont conservées : un événement du lundi 9 h reste à 9 h
 * après le changement d'heure (Europe/Paris).
 */
export function expandEvent(
  event: ExpandableEvent,
  rangeFromKey: string,
  rangeToKey: string,
): OccurrenceSlot[] {
  const masterStartKey = parisDateKey(event.startAt);
  const startMinutes = parisMinutesOfDay(event.startAt);
  const durationMs = Math.max(
    0,
    event.endAt.getTime() - event.startAt.getTime(),
  );
  const exceptions = new Set(event.recurrenceExceptions ?? []);
  const spec = parseRecurrence(event.recurrenceRule);

  if (!spec) {
    const startAt = new Date(event.startAt);
    const endAt = new Date(event.endAt);
    const key = masterStartKey;
    if (parisDateKey(startAt) > rangeToKey || parisDateKey(endAt) < rangeFromKey) {
      return [];
    }
    return [
      {
        occurrenceDate: key,
        occurrenceKey: `${event.id}:${key}`,
        startAt,
        endAt,
      },
    ];
  }

  const occurrences: OccurrenceSlot[] = [];
  const maxIterations = 4000;
  const longPast = diffDays(rangeFromKey, masterStartKey) > 900 && !spec.count;
  let cursorKey: string = longPast ? addDaysKey(rangeFromKey, -31) : masterStartKey;
  const masterPlain = plainDate(masterStartKey);
  const masterDayOfMonth = masterPlain.getUTCDate();

  let produced = 0;
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations += 1;
    const key = cursorKey;
    if (key > rangeToKey) break;
    if (spec.until && key > spec.until) break;

    const matches = matchesRecurrence(
      key,
      masterStartKey,
      masterDayOfMonth,
      spec,
    );

    if (matches) {
      produced += 1;
      const occurrenceStart = fromParisWallTime(key, startMinutes);
      const occurrenceEnd = new Date(occurrenceStart.getTime() + durationMs);
      if (!exceptions.has(key)) {
        if (key >= rangeFromKey && key <= rangeToKey) {
          occurrences.push({
            occurrenceDate: key,
            occurrenceKey: `${event.id}:${key}`,
            startAt: occurrenceStart,
            endAt: occurrenceEnd,
          });
        } else if (
          key < rangeFromKey &&
          parisDateKey(occurrenceEnd) >= rangeFromKey
        ) {
          occurrences.push({
            occurrenceDate: key,
            occurrenceKey: `${event.id}:${key}`,
            startAt: occurrenceStart,
            endAt: occurrenceEnd,
          });
        }
      }
      if (spec.count && produced >= spec.count) break;
    }
    cursorKey = addDaysKey(key, 1);
  }

  return occurrences;
}

function matchesRecurrence(
  key: string,
  masterStartKey: string,
  masterDayOfMonth: number,
  spec: RecurrenceSpec,
): boolean {
  if (spec.freq === "DAILY") {
    return diffDays(key, masterStartKey) % spec.interval === 0;
  }
  if (spec.freq === "WEEKLY") {
    if (diffWeeks(key, masterStartKey) % spec.interval !== 0) return false;
    if (spec.byDay.length > 0) return spec.byDay.includes(weekdayIndex(key));
    return weekdayIndex(key) === weekdayIndex(masterStartKey);
  }
  if (diffMonths(key, masterStartKey) % spec.interval !== 0) return false;
  return plainDate(key).getUTCDate() === masterDayOfMonth;
}

export const DAY_CODES_LIST = DAY_CODES;
