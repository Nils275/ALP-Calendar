"use client";

import { useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { WEEKDAY_SHORT, DEFAULT_GRID_END_HOUR, DEFAULT_GRID_START_HOUR } from "@/lib/calendar/constants";
import { DRAG_MIME, readDragPayload, type DragPayload } from "@/lib/calendar/client";
import type { ViewOccurrence } from "@/lib/calendar/types";
import {
  dateKey,
  diffDays,
  formatDayLong,
  lastDayKeyOf,
  minutesOfDay,
  pad2,
  snapMinutes,
  weekdayIndex,
} from "@/lib/calendar/time";
import { CategoryIcon, DoneMark, RecurrenceMark, categoryColor, tint } from "./bits";

export const HOUR_PX = 64;
const GUTTER_PX = 60;

export type MoveTarget = { kind: "slot"; dayKey: string; minutes: number } | { kind: "day"; dayKey: string };

type Props = {
  days: string[];
  items: ViewOccurrence[];
  todayKey: string;
  nowMinutes: number;
  onOpen: (occurrence: ViewOccurrence) => void;
  onMove: (payload: DragPayload, target: MoveTarget) => void;
  onCreateAt: (dayKey: string, minutes: number) => void;
  onOpenDay: (dayKey: string) => void;
};

type Laned<T> = T & { lane: number; lanes: number };
type TimedSegment = { occ: ViewOccurrence; dayKey: string; startMin: number; endMin: number };
type AllDaySpan = { occ: ViewOccurrence; startMin: number; endMin: number };

/** Répartit les éléments qui se chevauchent en « voies » côte à côte (algorithme glouton par grappes). */
function assignLanes<T extends { startMin: number; endMin: number }>(input: T[]): Array<Laned<T>> {
  const sorted = [...input].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const result: Array<Laned<T>> = [];
  let cluster: Array<T & { lane: number }> = [];
  const laneEnds: number[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;

  const flush = () => {
    if (cluster.length === 0) return;
    const lanes = Math.max(...cluster.map((c) => c.lane)) + 1;
    for (const c of cluster) result.push({ ...c, lanes });
    cluster = [];
  };

  for (const item of sorted) {
    if (item.startMin >= clusterEnd) {
      flush();
      laneEnds.length = 0;
    }
    let lane = laneEnds.findIndex((end) => end <= item.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(item.endMin);
    } else {
      laneEnds[lane] = item.endMin;
    }
    cluster.push({ ...item, lane });
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  flush();
  return result;
}

function hm(minutes: number): string {
  const m = Math.min(minutes, 1440);
  const h = Math.floor(m / 60);
  return `${pad2(h === 24 ? 0 : h)}:${pad2(m % 60)}`;
}

function eventCountLabel(count: number): string {
  return count > 1 ? `${count} événements` : count === 1 ? "1 événement" : "Aucun événement";
}

export function TimeGrid({ days, items, todayKey, nowMinutes, onOpen, onMove, onCreateAt, onOpenDay }: Props) {
  const dayCount = days.length;
  const dragRef = useRef<{ grabMin: number; durationMin: number } | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ dayKey: string; top: number; height: number; label: string } | null>(null);
  const [allDayHover, setAllDayHover] = useState(false);

  /* Segments horaires par colonne (un événement multi-jours apparaît sur chaque jour concerné). */
  const timedByDay = useMemo(() => {
    return days.map((dayKey) => {
      const list: TimedSegment[] = [];
      for (const occ of items) {
        if (occ.event.allDay) continue;
        const s = new Date(occ.start);
        const e = new Date(occ.end);
        const startKey = dateKey(s);
        const endKey = dateKey(e);
        const lastKey = lastDayKeyOf(e);
        if (dayKey < startKey || dayKey > lastKey) continue;
        const startMin = dayKey === startKey ? minutesOfDay(s) : 0;
        const endMin = endKey === dayKey ? minutesOfDay(e) : 1440;
        list.push({ occ, dayKey, startMin, endMin: Math.max(endMin, startMin + 1) });
      }
      return assignLanes(list);
    });
  }, [days, items]);

  /* Bandeau « journée entière » : positions en colonnes de jours. */
  const allDaySpans = useMemo(() => {
    const first = days[0];
    const spans: AllDaySpan[] = [];
    for (const occ of items) {
      if (!occ.event.allDay) continue;
      const startKey = dateKey(new Date(occ.start));
      const lastKey = lastDayKeyOf(new Date(occ.end));
      const si = Math.max(0, diffDays(first, startKey));
      const ei = Math.min(dayCount - 1, diffDays(first, lastKey));
      if (si > dayCount - 1 || ei < 0 || ei < si) continue;
      spans.push({ occ, startMin: si, endMin: ei + 1 });
    }
    return assignLanes(spans);
  }, [days, dayCount, items]);
  const allDayRows = Math.max(1, allDaySpans.reduce((m, s) => Math.max(m, s.lane + 1), 0));

  /* Nombre d'événements par jour (indicateur de charge). */
  const dayCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const dayKey of days) {
      let n = 0;
      for (const occ of items) {
        const startKey = dateKey(new Date(occ.start));
        const lastKey = lastDayKeyOf(new Date(occ.end));
        if (dayKey >= startKey && dayKey <= lastKey) n += 1;
      }
      counts.set(dayKey, n);
    }
    return counts;
  }, [days, items]);

  /* Plage horaire visible : 7 h – 20 h minimum, élargie pour afficher tous les événements. */
  const [startHour, endHour] = useMemo(() => {
    let lo = DEFAULT_GRID_START_HOUR;
    let hi = DEFAULT_GRID_END_HOUR;
    for (const col of timedByDay) {
      for (const seg of col) {
        lo = Math.min(lo, Math.floor(seg.startMin / 60));
        hi = Math.max(hi, Math.ceil(seg.endMin / 60));
      }
    }
    return [Math.max(0, lo), Math.min(24, hi)] as const;
  }, [timedByDay]);

  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const gridHeight = (endHour - startHour) * HOUR_PX;
  const yOf = (minutes: number) => ((minutes - startHour * 60) * HOUR_PX) / 60;
  const gridTemplate = `${GUTTER_PX}px repeat(${dayCount}, minmax(0, 1fr))`;

  const minutesFromPointer = (clientY: number, rect: DOMRect) => startHour * 60 + ((clientY - rect.top) * 60) / HOUR_PX;

  function slotFor(clientY: number, rect: DOMRect, grabMin: number): number {
    const raw = minutesFromPointer(clientY, rect) - grabMin;
    return Math.max(0, Math.min(1425, snapMinutes(raw, 15)));
  }

  function handleBlockDragStart(event: DragEvent<HTMLButtonElement>, occ: ViewOccurrence) {
    const rect = event.currentTarget.getBoundingClientRect();
    const grabMin = ((event.clientY - rect.top) * 60) / HOUR_PX;
    const durationMin = Math.max(15, (new Date(occ.end).getTime() - new Date(occ.start).getTime()) / 60_000);
    dragRef.current = { grabMin, durationMin };

    const payload: DragPayload = {
      key: occ.key,
      eventId: occ.eventId,
      occurrenceStart: occ.occurrenceStart,
      start: occ.start,
      end: occ.end,
      allDay: occ.event.allDay,
      title: occ.event.title,
      canEdit: occ.event.canEdit,
    };
    const json = JSON.stringify(payload);
    event.dataTransfer.setData(DRAG_MIME, json);
    event.dataTransfer.setData("text/plain", json);
    event.dataTransfer.effectAllowed = "move";
    setDraggingKey(occ.key);
  }

  function resetDrag() {
    dragRef.current = null;
    setDraggingKey(null);
    setGhost(null);
    setAllDayHover(false);
  }

  function handleColumnDragOver(event: DragEvent<HTMLDivElement>, dayKey: string) {
    if (!dragRef.current) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const { grabMin, durationMin } = dragRef.current;
    const minutes = slotFor(event.clientY, rect, grabMin);
    const top = yOf(minutes);
    const height = Math.max(22, (durationMin * HOUR_PX) / 60 - 3);
    setGhost((prev) =>
      prev && prev.dayKey === dayKey && prev.top === top
        ? prev
        : { dayKey, top, height, label: `${hm(minutes)} – ${hm(minutes + durationMin)}` },
    );
  }

  function handleColumnDrop(event: DragEvent<HTMLDivElement>, dayKey: string) {
    event.preventDefault();
    const payload = readDragPayload(event.dataTransfer);
    const grabMin = dragRef.current?.grabMin ?? 0;
    const rect = event.currentTarget.getBoundingClientRect();
    const minutes = slotFor(event.clientY, rect, grabMin);
    resetDrag();
    if (!payload) return;
    if (payload.allDay) {
      onMove(payload, { kind: "day", dayKey });
    } else {
      onMove(payload, { kind: "slot", dayKey, minutes });
    }
  }

  function handleAllDayDragOver(event: DragEvent<HTMLDivElement>) {
    if (!dragRef.current && !event.dataTransfer.types.includes(DRAG_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setAllDayHover(true);
  }

  function handleAllDayDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const payload = readDragPayload(event.dataTransfer);
    const rect = event.currentTarget.getBoundingClientRect();
    const colWidth = (rect.width - GUTTER_PX) / dayCount;
    const index = Math.max(0, Math.min(dayCount - 1, Math.floor((event.clientX - rect.left - GUTTER_PX) / colWidth)));
    resetDrag();
    if (payload) onMove(payload, { kind: "day", dayKey: days[index] });
  }

  function handleColumnDoubleClick(event: MouseEvent<HTMLDivElement>, dayKey: string) {
    if (event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const minutes = Math.max(0, Math.min(1425, snapMinutes(minutesFromPointer(event.clientY, rect), 15)));
    onCreateAt(dayKey, minutes);
  }

  return (
    <div className="alp-glass overflow-hidden rounded-3xl">
      <div className="alp-scroll overflow-x-auto">
        <div style={{ minWidth: dayCount > 1 ? 840 : 0 }}>
          {/* En-têtes des jours */}
          <div className="grid border-b border-white/[0.07]" style={{ gridTemplateColumns: gridTemplate }}>
            <div className="flex flex-col items-center justify-end pb-2 text-[9px] uppercase tracking-[0.18em] text-zinc-600">
              Paris
            </div>
            {days.map((dayKey) => {
              const isToday = dayKey === todayKey;
              const count = dayCounts.get(dayKey) ?? 0;
              const heat = Math.min(1, count / 8);
              const heatColor = heat > 0.66 ? "#f97316" : heat > 0.33 ? "#eab308" : "#3ddc84";
              const single = dayCount === 1;
              return (
                <button
                  type="button"
                  key={dayKey}
                  onClick={() => !single && onOpenDay(dayKey)}
                  disabled={single}
                  className={`group relative flex flex-col items-center gap-1 px-2 pb-3.5 pt-3 transition-colors ${
                    single ? "cursor-default" : "hover:bg-white/[0.03]"
                  }`}
                  aria-label={`${formatDayLong(dayKey)} — ${eventCountLabel(count)}`}
                >
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                      isToday ? "text-alp-green" : "text-zinc-500"
                    }`}
                  >
                    {single ? formatDayLong(dayKey) : WEEKDAY_SHORT[weekdayIndex(dayKey)]}
                  </span>
                  {!single && (
                    <span
                      className={`grid h-9 w-9 place-items-center rounded-full text-base font-semibold tabular-nums transition ${
                        isToday
                          ? "bg-alp-green text-alp-ink shadow-[0_0_22px_rgba(61,220,132,0.5)]"
                          : "text-zinc-100 group-hover:bg-white/[0.06]"
                      }`}
                    >
                      {Number(dayKey.slice(8, 10))}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                    {eventCountLabel(count)}
                    {count >= 6 && (
                      <span className="rounded-full bg-orange-500/15 px-1.5 py-px text-[10px] font-semibold text-orange-300">
                        Chargée
                      </span>
                    )}
                  </span>
                  <span className="absolute inset-x-4 bottom-0 h-[3px] overflow-hidden rounded-full bg-white/[0.05]">
                    <span
                      className="block h-full rounded-full transition-[width] duration-500"
                      style={{ width: `${Math.max(heat, count > 0 ? 0.08 : 0) * 100}%`, background: heatColor }}
                    />
                  </span>
                </button>
              );
            })}
          </div>

          {/* Journée entière */}
          <div
            className="relative grid border-b border-white/[0.07] bg-white/[0.012] py-1.5"
            style={{ gridTemplateColumns: gridTemplate, gridTemplateRows: `repeat(${allDayRows}, 26px)`, rowGap: 4 }}
            onDragOver={handleAllDayDragOver}
            onDragLeave={() => setAllDayHover(false)}
            onDrop={handleAllDayDrop}
            data-hover={allDayHover || undefined}
          >
            <div className="row-span-full flex items-center justify-center px-1 text-center text-[9px] font-semibold uppercase leading-tight tracking-[0.14em] text-zinc-500">
              Journée
            </div>
            {allDaySpans.map((seg) => {
              const color = categoryColor(seg.occ.event.category);
              const cancelled = seg.occ.status === "cancelled";
              const done = seg.occ.status === "done";
              return (
                <button
                  type="button"
                  key={`${seg.occ.key}|allday`}
                  draggable={seg.occ.event.canEdit && !cancelled}
                  onDragStart={(e) => handleBlockDragStart(e, seg.occ)}
                  onDragEnd={resetDrag}
                  onClick={() => onOpen(seg.occ)}
                  className={`relative z-10 mx-0.5 flex min-w-0 items-center gap-1.5 truncate rounded-lg border-l-[3px] px-2 text-left text-[12px] font-medium text-zinc-100 transition hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alp-green ${
                    seg.occ.event.canEdit && !cancelled ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                  } ${done || cancelled ? "opacity-55" : ""} ${draggingKey === seg.occ.key ? "opacity-40" : ""}`}
                  style={{
                    gridColumn: `${seg.startMin + 2} / ${seg.endMin + 2}`,
                    gridRow: seg.lane + 1,
                    background: `linear-gradient(90deg, ${tint(color, 60)}, ${tint(color, 30)})`,
                    borderLeftColor: color,
                  }}
                  title={seg.occ.event.title}
                >
                  <CategoryIcon category={seg.occ.event.category} className="h-3.5 w-3.5 shrink-0" />
                  <span className={`truncate ${cancelled ? "line-through" : ""}`}>{seg.occ.event.title}</span>
                  {seg.occ.isRecurring && <RecurrenceMark />}
                  {done && <DoneMark />}
                </button>
              );
            })}
            {allDaySpans.length === 0 && (
              <div
                className="pointer-events-none flex items-center text-[11px] text-zinc-600"
                style={{ gridColumn: `2 / -1`, gridRow: 1 }}
              >
                Glissez un événement ici pour le passer en journée entière sur le jour visé.
              </div>
            )}
          </div>

          {/* Grille horaire */}
          <div className="relative grid" style={{ gridTemplateColumns: gridTemplate }}>
            <div className="relative select-none" style={{ height: gridHeight }}>
              {hours.map((h) => (
                <span
                  key={h}
                  className="absolute right-2 -translate-y-1/2 text-[11px] font-medium tabular-nums text-zinc-500"
                  style={{ top: yOf(h * 60) }}
                >
                  {pad2(h)}:00
                </span>
              ))}
            </div>

            {days.map((dayKey, idx) => {
              const isToday = dayKey === todayKey;
              const showNow = isToday && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60;
              return (
                <div
                  key={dayKey}
                  className={`relative border-l border-white/[0.06] ${isToday ? "bg-alp-green/[0.035]" : ""}`}
                  style={{ height: gridHeight }}
                  onDragOver={(e) => handleColumnDragOver(e, dayKey)}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setGhost(null);
                  }}
                  onDrop={(e) => handleColumnDrop(e, dayKey)}
                  onDoubleClick={(e) => handleColumnDoubleClick(e, dayKey)}
                >
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="pointer-events-none absolute inset-x-0 border-t border-white/[0.06]"
                      style={{ top: yOf(h * 60) }}
                    />
                  ))}
                  {hours.map((h) => (
                    <div
                      key={`half-${h}`}
                      className="pointer-events-none absolute inset-x-0 border-t border-dashed border-white/[0.03]"
                      style={{ top: yOf(h * 60 + 30) }}
                    />
                  ))}

                  {showNow && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-20 flex items-center"
                      style={{ top: yOf(nowMinutes) }}
                    >
                      <span className="-ml-1 h-2.5 w-2.5 rounded-full bg-alp-green shadow-[0_0_12px_#3ddc84] alp-pulse-dot" />
                      <span className="h-px flex-1 bg-gradient-to-r from-alp-green to-alp-green/10" />
                    </div>
                  )}

                  {ghost && ghost.dayKey === dayKey && (
                    <div
                      className="pointer-events-none absolute inset-x-1 z-30 flex items-start rounded-xl border border-dashed border-alp-green/80 bg-alp-green/10 px-2 py-1 text-[11px] font-semibold text-alp-green"
                      style={{ top: ghost.top, height: ghost.height }}
                    >
                      {ghost.label}
                    </div>
                  )}

                  {timedByDay[idx].map((seg) => {
                    const color = categoryColor(seg.occ.event.category);
                    const done = seg.occ.status === "done";
                    const cancelled = seg.occ.status === "cancelled";
                    const top = yOf(seg.startMin);
                    const height = Math.max(22, ((seg.endMin - seg.startMin) * HOUR_PX) / 60 - 3);
                    const compact = height < 46;
                    const canDrag = seg.occ.event.canEdit && !cancelled;
                    return (
                      <button
                        type="button"
                        key={`${seg.occ.key}|${seg.dayKey}`}
                        draggable={canDrag}
                        onDragStart={(e) => handleBlockDragStart(e, seg.occ)}
                        onDragEnd={resetDrag}
                        onClick={() => onOpen(seg.occ)}
                        onDoubleClick={(e) => e.stopPropagation()}
                        className={`group absolute z-10 overflow-hidden rounded-xl border border-white/[0.07] border-l-[3px] px-2 py-1 text-left shadow-[0_6px_18px_rgba(0,0,0,0.35)] backdrop-blur-sm transition-[box-shadow,filter,opacity] hover:z-40 hover:brightness-110 hover:shadow-[0_10px_28px_rgba(0,0,0,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alp-green ${
                          canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                        } ${done || cancelled ? "opacity-55" : ""} ${draggingKey === seg.occ.key ? "opacity-40" : ""}`}
                        style={{
                          top,
                          height,
                          left: `calc(${(seg.lane / seg.lanes) * 100}% + 3px)`,
                          width: `calc(${100 / seg.lanes}% - 6px)`,
                          background: `linear-gradient(135deg, ${tint(color, 52)} 0%, ${tint(color, 20)} 100%)`,
                          borderLeftColor: color,
                        }}
                        title={`${seg.occ.event.title} · ${hm(seg.startMin)}–${hm(seg.endMin)}`}
                      >
                        <span className="flex items-center gap-1 text-[10px] font-semibold tabular-nums text-zinc-300">
                          {hm(seg.startMin)} – {hm(seg.endMin)}
                          {seg.occ.isRecurring && <RecurrenceMark />}
                          {done && <DoneMark />}
                        </span>
                        <span
                          className={`block truncate text-[12px] font-semibold leading-tight text-white ${
                            cancelled ? "line-through" : ""
                          }`}
                        >
                          {seg.occ.event.title}
                        </span>
                        {!compact && seg.occ.event.location && (
                          <span className="block truncate text-[10px] text-zinc-400">{seg.occ.event.location}</span>
                        )}
                        {!compact && seg.occ.event.priority === "urgent" && (
                          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="border-t border-white/[0.05] px-4 py-2 text-[11px] text-zinc-500">
        Double-cliquez sur une case pour créer un événement · Glissez-déposez pour reprogrammer (ordinateur) · Heures de Paris
      </p>
    </div>
  );
}
