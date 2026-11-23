/* Calculs de planning sur les données vérifiées de l'agenda. Fonctions pures, sans accès à la base. */
import type { CategoryKey } from "@/lib/calendar/constants";
import { addDays, dateKey, lastDayKeyOf, minutesOfDay, pad2 } from "@/lib/calendar/time";
import type { EventDto, EventStatus, OccurrenceDto } from "@/lib/calendar/types";

export type AgendaItem = {
  key: string;
  eventId: string;
  title: string;
  category: CategoryKey;
  start: Date;
  end: Date;
  allDay: boolean;
  status: EventStatus;
  location: string | null;
  assignee: string | null;
  isRecurring: boolean;
};

export const WINDOWS = {
  journee: { label: "journée", startMin: 9 * 60, endMin: 18 * 60 },
  matin: { label: "matin", startMin: 9 * 60, endMin: 12 * 60 },
  "apres-midi": { label: "après-midi", startMin: 13 * 60, endMin: 18 * 60 },
} as const;

export type WindowKey = keyof typeof WINDOWS;

export function isOpen(item: { status: EventStatus }): boolean {
  return item.status === "upcoming" || item.status === "in_progress";
}

export function toAgendaItems(occurrences: OccurrenceDto[], events: EventDto[]): AgendaItem[] {
  const byId = new Map(events.map((e) => [e.id, e]));
  const out: AgendaItem[] = [];
  for (const o of occurrences) {
    if (o.status === "cancelled") continue;
    const e = byId.get(o.eventId);
    if (!e) continue;
    out.push({
      key: o.key,
      eventId: e.id,
      title: e.title,
      category: e.category,
      start: new Date(o.start),
      end: new Date(o.end),
      allDay: e.allDay,
      status: o.status,
      location: e.location,
      assignee: e.assignedTo?.fullName ?? null,
      isRecurring: o.isRecurring,
    });
  }
  return out.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Éléments qui touchent le jour civil donné (heure de Paris). */
export function itemsOnDay(items: AgendaItem[], day: string): AgendaItem[] {
  return items.filter((i) => dateKey(i.start) <= day && lastDayKeyOf(i.end) >= day);
}

/** Paires d'événements à horaire qui se chevauchent. */
export function findConflicts(items: AgendaItem[]): Array<{ a: AgendaItem; b: AgendaItem }> {
  const timed = items.filter((i) => !i.allDay).sort((x, y) => x.start.getTime() - y.start.getTime());
  const pairs: Array<{ a: AgendaItem; b: AgendaItem }> = [];
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length && timed[j].start.getTime() < timed[i].end.getTime(); j++) {
      pairs.push({ a: timed[i], b: timed[j] });
    }
  }
  return pairs;
}

export function dayKeysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

export type DayLoad = { day: string; count: number; hours: number; load: "libre" | "légère" | "soutenue" | "chargée" };

/** Charge d'une journée : nombre d'éléments et heures planifiées. */
export function dayLoad(items: AgendaItem[], day: string): DayLoad {
  const onDay = itemsOnDay(items, day);
  let minutesTotal = 0;
  for (const i of onDay) {
    if (i.allDay) continue;
    const s = dateKey(i.start) < day ? 0 : minutesOfDay(i.start);
    const e = dateKey(i.end) > day ? 1440 : minutesOfDay(i.end);
    minutesTotal += Math.max(0, e - s);
  }
  const hours = Math.round((minutesTotal / 60) * 10) / 10;
  const count = onDay.length;
  const load = count === 0 ? "libre" : count >= 6 || hours >= 6 ? "chargée" : count >= 3 ? "soutenue" : "légère";
  return { day, count, hours, load };
}

const hm = (minutes: number): string => `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;

/** Créneaux libres d'un jour dans une fenêtre horaire, d'au moins durationMin minutes. */
export function freeSlots(
  items: AgendaItem[],
  day: string,
  win: { startMin: number; endMin: number },
  durationMin: number,
): { fullDay: boolean; slots: Array<{ from: string; to: string; minutes: number }> } {
  const busy: Array<[number, number]> = [];
  for (const i of itemsOnDay(items, day)) {
    if (i.allDay) return { fullDay: true, slots: [] };
    const s = Math.max(dateKey(i.start) < day ? 0 : minutesOfDay(i.start), win.startMin);
    const e = Math.min(dateKey(i.end) > day ? 1440 : minutesOfDay(i.end), win.endMin);
    if (e <= s) continue;
    busy.push([s, e]);
  }
  busy.sort((a, b) => a[0] - b[0]);

  const slots: Array<{ from: string; to: string; minutes: number }> = [];
  let cursor = win.startMin;
  for (const [s, e] of busy) {
    if (s - cursor >= durationMin) slots.push({ from: hm(cursor), to: hm(s), minutes: s - cursor });
    cursor = Math.max(cursor, e);
  }
  if (win.endMin - cursor >= durationMin) {
    slots.push({ from: hm(cursor), to: hm(win.endMin), minutes: win.endMin - cursor });
  }
  return { fullDay: false, slots };
}
