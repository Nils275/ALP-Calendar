"use client";

import { useState, type DragEvent } from "react";
import { CalendarPlus, ChevronRight, Clock, MapPin, Plus } from "lucide-react";

import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import {
  CategoryBadge,
  CategoryIcon,
  EmptyState,
  EventChip,
  PriorityBadge,
  StatusBadge,
  SyncBadge,
  isLate,
  timeRangeLabel,
} from "@/components/agenda/shared";
import {
  categoryColor,
  categoryTint,
  DAY_LABELS,
  priorityMeta,
} from "@/lib/agenda-config";
import type { EventOccurrence } from "@/lib/agenda-types";
import {
  addDaysKey,
  capitalize,
  formatKey,
  fromParisWallTime,
  monthGridKeys,
  parisDateKey,
  parisMinutesOfDay,
  weekKeys,
  weekdayIndex,
} from "@/lib/time";

const HOUR_HEIGHT = 56;
const GRID_START = 7 * 60;
const GRID_END = 20 * 60;
const HOURS = Array.from({ length: (GRID_END - GRID_START) / 60 + 1 }, (_, index) => 7 + index);

type DaySegment = { startMin: number; endMin: number };

function segmentForDay(occurrence: EventOccurrence, dayKey: string): DaySegment | null {
  const dayStart = fromParisWallTime(dayKey, 0).getTime();
  const dayEnd = fromParisWallTime(addDaysKey(dayKey, 1), 0).getTime();
  const start = Math.max(new Date(occurrence.startAt).getTime(), dayStart);
  const end = Math.min(new Date(occurrence.endAt).getTime(), dayEnd);
  if (end <= start) return null;
  return {
    startMin: Math.round((start - dayStart) / 60_000),
    endMin: Math.round((end - dayStart) / 60_000),
  };
}

type Positioned = {
  occurrence: EventOccurrence;
  startMin: number;
  endMin: number;
  lane: number;
  laneCount: number;
};

function layoutDay(events: EventOccurrence[], dayKey: string): Positioned[] {
  const items = events
    .filter((occurrence) => !occurrence.allDay)
    .map((occurrence) => {
      const segment = segmentForDay(occurrence, dayKey);
      return segment ? { occurrence, ...segment } : null;
    })
    .filter((item): item is { occurrence: EventOccurrence; startMin: number; endMin: number } => Boolean(item))
    .filter((item) => item.endMin > GRID_START && item.startMin < GRID_END)
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);

  const clusters: (typeof items)[] = [];
  let current: typeof items = [];
  let clusterEnd = -1;
  for (const item of items) {
    if (current.length > 0 && item.startMin >= clusterEnd) {
      clusters.push(current);
      current = [];
      clusterEnd = -1;
    }
    current.push(item);
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  if (current.length > 0) clusters.push(current);

  const positioned: Positioned[] = [];
  for (const cluster of clusters) {
    const laneEnds: number[] = [];
    const assignments = cluster.map((item) => {
      let lane = laneEnds.findIndex((end) => end <= item.startMin);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(item.endMin);
      } else {
        laneEnds[lane] = item.endMin;
      }
      return { ...item, lane };
    });
    const laneCount = Math.max(1, laneEnds.length);
    for (const assignment of assignments) {
      positioned.push({ ...assignment, laneCount });
    }
  }
  return positioned;
}

function positionedStyle(item: Positioned) {
  const start = Math.max(item.startMin, GRID_START);
  const end = Math.min(item.endMin, GRID_END);
  const top = ((start - GRID_START) / 60) * HOUR_HEIGHT;
  const height = Math.max(22, ((end - start) / 60) * HOUR_HEIGHT - 2);
  const width = 100 / item.laneCount;
  return {
    position: "absolute" as const,
    top,
    height,
    left: `calc(${item.lane * width}% + 2px)`,
    width: `calc(${width}% - 4px)`,
    zIndex: 2,
  };
}

function currentTimeTop(): number | null {
  const now = new Date();
  const minutes = parisMinutesOfDay(now);
  if (minutes < GRID_START || minutes > GRID_END) return null;
  return ((minutes - GRID_START) / 60) * HOUR_HEIGHT;
}

function readDragged(event: DragEvent, events: EventOccurrence[]): EventOccurrence | null {
  const key = event.dataTransfer.getData("text/plain");
  return events.find((occurrence) => occurrence.occurrenceKey === key) ?? null;
}

function dragStartHandler(occurrence: EventOccurrence, event: DragEvent) {
  event.dataTransfer.setData("text/plain", occurrence.occurrenceKey);
  event.dataTransfer.effectAllowed = "move";
}

function computeReschedule(
  occurrence: EventOccurrence,
  dayKey: string,
  hour: number,
): { startAt: string; endAt: string } {
  if (occurrence.allDay) {
    const startAt = fromParisWallTime(dayKey, 0);
    const endAt = fromParisWallTime(dayKey, 23 * 60 + 59);
    return { startAt: startAt.toISOString(), endAt: endAt.toISOString() };
  }
  const duration =
    new Date(occurrence.endAt).getTime() - new Date(occurrence.startAt).getTime();
  const originalMinutes = parisMinutesOfDay(new Date(occurrence.startAt));
  const startAt = fromParisWallTime(dayKey, hour * 60 + (originalMinutes % 60));
  const endAt = new Date(startAt.getTime() + duration);
  return { startAt: startAt.toISOString(), endAt: endAt.toISOString() };
}

type ViewProps = {
  events: EventOccurrence[];
  onOpen: (occurrence: EventOccurrence) => void;
  onCreateAt: (dateKey: string, minutes: number) => void;
  onReschedule: (occurrence: EventOccurrence, startAt: string, endAt: string) => void;
};

function AllDayStrip({
  events,
  onOpen,
}: {
  events: EventOccurrence[];
  onOpen: (occurrence: EventOccurrence) => void;
}) {
  return (
    <div className="flex items-stretch border-b border-white/7 bg-white/[0.02]">
      <div className="flex w-14 shrink-0 items-center justify-end border-r border-white/7 px-1.5 py-1.5 text-[9px] font-medium tracking-wide text-alp-dim uppercase">
        Jour
      </div>
      <div className="flex min-h-[34px] flex-1 flex-wrap items-center gap-1 px-1.5 py-1">
        {events.length === 0 ? (
          <span className="text-[10px] text-alp-dim">Aucun événement sur la journée entière</span>
        ) : (
          events.map((occurrence) => (
            <div key={occurrence.occurrenceKey} className="w-full max-w-[280px]">
              <EventChip occurrence={occurrence} onOpen={onOpen} compact showTime={false} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TimeRail() {
  return (
    <div className="w-14 shrink-0 border-r border-white/7">
      {HOURS.slice(0, -1).map((hour) => (
        <div
          key={hour}
          className="relative border-b border-white/5"
          style={{ height: HOUR_HEIGHT }}
        >
          <span className="absolute -top-2 right-2 font-mono text-[9.5px] text-alp-dim">
            {String(hour).padStart(2, "0")}:00
          </span>
        </div>
      ))}
    </div>
  );
}

function HourRows({
  dayKey,
  events,
  onReschedule,
  onCreateAt,
  onHoverHour,
}: {
  dayKey: string;
  events: EventOccurrence[];
  onReschedule: ViewProps["onReschedule"];
  onCreateAt: ViewProps["onCreateAt"];
  onHoverHour?: (hour: number | null) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  return (
    <>
      {HOURS.slice(0, -1).map((hour) => (
        <div
          key={hour}
          onClick={() => onCreateAt(dayKey, hour * 60)}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDragEnter={() => {
            setHovered(hour);
            onHoverHour?.(hour);
          }}
          onDragLeave={() => {
            setHovered(null);
            onHoverHour?.(null);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setHovered(null);
            onHoverHour?.(null);
            const occurrence = readDragged(event, events);
            if (!occurrence) return;
            const next = computeReschedule(occurrence, dayKey, hour);
            onReschedule(occurrence, next.startAt, next.endAt);
          }}
          className={`group relative border-b border-white/5 transition ${
            hour % 2 === 0 ? "bg-white/[0.012]" : ""
          } ${hovered === hour ? "bg-alp-green/10" : "hover:bg-white/[0.035]"}`}
          style={{ height: HOUR_HEIGHT }}
        >
          <span className="pointer-events-none absolute left-1.5 top-1 flex items-center gap-1 text-[9px] text-alp-green/0 transition group-hover:text-alp-green/80">
            <Plus size={9} /> {String(hour).padStart(2, "0")}:00
          </span>
        </div>
      ))}
    </>
  );
}

export function DayView({
  dateKey,
  todayKey,
  events,
  onOpen,
  onCreateAt,
  onReschedule,
}: ViewProps & { dateKey: string; todayKey: string }) {
  const dayEvents = events.filter((occurrence) => segmentForDay(occurrence, dateKey));
  const allDay = dayEvents.filter((occurrence) => occurrence.allDay);
  const positioned = layoutDay(dayEvents, dateKey);
  const nowTop = dateKey === todayKey ? currentTimeTop() : null;

  return (
    <section className="glass overflow-hidden rounded-2xl">
      <header className="flex flex-wrap items-center gap-3 border-b border-white/8 px-4 py-3">
        <div className="flex h-11 w-11 flex-col items-center justify-center rounded-xl border border-white/8 bg-white/[0.04]">
          <span className="text-[8.5px] font-semibold tracking-[0.14em] text-alp-muted uppercase">
            {formatKey(dateKey, "MMM")}
          </span>
          <span className="text-[17px] font-semibold leading-none text-white">
            {formatKey(dateKey, "d")}
          </span>
        </div>
        <div>
          <h2 className="text-[14px] font-semibold text-white">
            {capitalize(formatKey(dateKey, "EEEE d MMMM yyyy"))}
          </h2>
          <p className="text-[11px] text-alp-muted">
            {dayEvents.length} événement{dayEvents.length > 1 ? "s" : ""} · fuseau Europe/Paris
          </p>
        </div>
        <button
          onClick={() => onCreateAt(dateKey, 9 * 60)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-alp-green/30 bg-alp-green/10 px-2.5 py-1.5 text-[11px] font-medium text-alp-green-soft transition hover:bg-alp-green/20"
        >
          <CalendarPlus size={13} /> Ajouter à cette journée
        </button>
      </header>
      <AllDayStrip events={allDay} onOpen={onOpen} />
      <div className="max-h-[calc(100vh-320px)] min-h-[520px] overflow-y-auto scroll-thin">
        <div className="flex">
          <TimeRail />
          <div className="relative flex-1">
            <HourRows
              dayKey={dateKey}
              events={events}
              onReschedule={onReschedule}
              onCreateAt={onCreateAt}
            />
            {positioned.map((item) => (
              <div key={item.occurrence.occurrenceKey} style={positionedStyle(item)}>
                <EventChip
                  occurrence={item.occurrence}
                  onOpen={onOpen}
                  onDragStart={dragStartHandler}
                  className="h-full"
                />
              </div>
            ))}
            {nowTop !== null ? (
              <div
                className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                style={{ top: nowTop }}
              >
                <span className="h-2 w-2 rounded-full bg-alp-green shadow-[0_0_10px_2px_rgba(62,224,125,0.55)]" />
                <span className="h-px flex-1 bg-alp-green/60" />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

export function WeekView({
  anchorKey,
  todayKey,
  events,
  onOpen,
  onCreateAt,
  onReschedule,
  onSelectDay,
}: ViewProps & {
  anchorKey: string;
  todayKey: string;
  onSelectDay: (dateKey: string) => void;
}) {
  const days = weekKeys(anchorKey);
  const allDayByDay = new Map<string, EventOccurrence[]>();
  for (const dayKey of days) {
    allDayByDay.set(
      dayKey,
      events.filter((occurrence) => occurrence.allDay && segmentForDay(occurrence, dayKey)),
    );
  }

  return (
    <section className="glass overflow-hidden rounded-2xl">
      <div className="overflow-x-auto scroll-thin">
        <div className="min-w-[860px]">
          <div className="flex border-b border-white/8 bg-black/20">
            <div className="w-14 shrink-0 border-r border-white/7" />
            {days.map((dayKey) => {
              const dayEvents = events.filter((occurrence) => segmentForDay(occurrence, dayKey));
              const isToday = dayKey === todayKey;
              return (
                <button
                  key={dayKey}
                  onClick={() => onSelectDay(dayKey)}
                  className={`group flex flex-1 items-center gap-2 border-r border-white/6 px-2.5 py-2 text-left transition last:border-r-0 hover:bg-white/[0.04] ${
                    isToday ? "bg-alp-green/[0.07]" : ""
                  }`}
                  title="Ouvrir la vue jour"
                >
                  <span className="text-[9.5px] font-semibold tracking-[0.14em] text-alp-muted uppercase">
                    {formatKey(dayKey, "EEE")}
                  </span>
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-[12.5px] font-semibold ${
                      isToday ? "bg-alp-green text-[#05140a]" : "text-white group-hover:text-alp-green-soft"
                    }`}
                  >
                    {formatKey(dayKey, "d")}
                  </span>
                  {dayEvents.length > 0 ? (
                    <span
                      className={`ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                        dayEvents.length >= 5
                          ? "bg-red-500/15 text-red-300"
                          : dayEvents.length >= 3
                            ? "bg-amber-400/15 text-amber-300"
                            : "bg-white/8 text-alp-muted"
                      }`}
                    >
                      {dayEvents.length}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="flex border-b border-white/8 bg-white/[0.02]">
            <div className="flex w-14 shrink-0 items-center justify-end border-r border-white/7 px-1.5 py-1 text-[9px] uppercase text-alp-dim">
              Jour
            </div>
            {days.map((dayKey) => (
              <div
                key={dayKey}
                className="min-h-[36px] flex-1 space-y-1 border-r border-white/6 px-1 py-1 last:border-r-0"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const occurrence = readDragged(event, events);
                  if (!occurrence) return;
                  const next = computeReschedule(occurrence, dayKey, 9);
                  onReschedule(occurrence, next.startAt, next.endAt);
                }}
              >
                {(allDayByDay.get(dayKey) ?? []).map((occurrence) => (
                  <EventChip
                    key={occurrence.occurrenceKey}
                    occurrence={occurrence}
                    onOpen={onOpen}
                    onDragStart={dragStartHandler}
                    compact
                    showTime={false}
                  />
                ))}
              </div>
            ))}
          </div>

          <div className="flex max-h-[calc(100vh-340px)] min-h-[540px] overflow-y-auto scroll-thin">
            <TimeRail />
            {days.map((dayKey) => {
              const positioned = layoutDay(events, dayKey);
              const nowTop = dayKey === todayKey ? currentTimeTop() : null;
              return (
                <div
                  key={dayKey}
                  className="relative flex-1 border-r border-white/6 last:border-r-0"
                >
                  <HourRows
                    dayKey={dayKey}
                    events={events}
                    onReschedule={onReschedule}
                    onCreateAt={onCreateAt}
                  />
                  {positioned.map((item) => (
                    <div key={item.occurrence.occurrenceKey} style={positionedStyle(item)}>
                      <EventChip
                        occurrence={item.occurrence}
                        onOpen={onOpen}
                        onDragStart={dragStartHandler}
                        className="h-full"
                        compact
                      />
                    </div>
                  ))}
                  {nowTop !== null ? (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
                      style={{ top: nowTop }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-alp-green" />
                      <span className="h-px flex-1 bg-alp-green/60" />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export function MonthView({
  anchorKey,
  todayKey,
  selectedDay,
  events,
  onOpen,
  onCreateAt,
  onReschedule,
  onSelectDay,
}: ViewProps & {
  anchorKey: string;
  todayKey: string;
  selectedDay: string;
  onSelectDay: (dateKey: string) => void;
}) {
  const cells = monthGridKeys(anchorKey);
  const month = anchorKey.slice(0, 7);
  const byDay = new Map<string, EventOccurrence[]>();
  for (const dayKey of cells) {
    byDay.set(
      dayKey,
      events
        .filter((occurrence) => segmentForDay(occurrence, dayKey))
        .sort((a, b) => Number(b.allDay) - Number(a.allDay) || new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
    );
  }
  const selectedEvents = byDay.get(selectedDay) ?? [];

  return (
    <div className="space-y-3">
      <section className="glass overflow-hidden rounded-2xl">
        <div className="grid grid-cols-7 border-b border-white/8 bg-black/25">
          {DAY_LABELS.map((label) => (
            <div
              key={label}
              className="border-r border-white/6 py-2 text-center text-[9.5px] font-semibold tracking-[0.14em] text-alp-muted uppercase last:border-r-0"
            >
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((dayKey) => {
            const dayEvents = byDay.get(dayKey) ?? [];
            const inMonth = dayKey.startsWith(month);
            const isToday = dayKey === todayKey;
            const isSelected = dayKey === selectedDay;
            return (
              <div
                key={dayKey}
                onClick={() => onSelectDay(dayKey)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  const occurrence = readDragged(event, events);
                  if (!occurrence) return;
                  const hour = occurrence.allDay ? 0 : Math.floor(parisMinutesOfDay(new Date(occurrence.startAt)) / 60);
                  const next = computeReschedule(occurrence, dayKey, hour);
                  onReschedule(occurrence, next.startAt, next.endAt);
                }}
                className={`group relative min-h-[104px] cursor-pointer border-b border-r border-white/6 p-1 transition last:border-r-0 ${
                  inMonth ? "bg-white/[0.012]" : "bg-black/25"
                } ${isSelected ? "ring-1 ring-inset ring-alp-green/50" : "hover:bg-white/[0.045]"}`}
              >
                <div className="flex items-center justify-between px-0.5">
                  <span
                    className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10.5px] font-semibold ${
                      isToday
                        ? "bg-alp-green text-[#04140a]"
                        : inMonth
                          ? "text-white/85"
                          : "text-alp-dim"
                    }`}
                  >
                    {formatKey(dayKey, "d")}
                  </span>
                  <span className="flex items-center gap-1">
                    {dayEvents.length > 0 ? (
                      <span
                        className={`rounded-full px-1 py-0.5 text-[8.5px] font-semibold ${
                          dayEvents.length >= 5
                            ? "bg-red-500/20 text-red-300"
                            : dayEvents.length >= 3
                              ? "bg-amber-400/20 text-amber-300"
                              : "bg-white/8 text-alp-muted"
                        }`}
                        title={`${dayEvents.length} événements`}
                      >
                        {dayEvents.length}
                      </span>
                    ) : null}
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onCreateAt(dayKey, 9 * 60);
                      }}
                      className="rounded p-0.5 text-alp-dim opacity-0 transition hover:text-alp-green group-hover:opacity-100"
                      aria-label={`Ajouter un événement le ${dayKey}`}
                    >
                      <Plus size={12} />
                    </button>
                  </span>
                </div>
                <div className="mt-1 space-y-1">
                  {dayEvents.slice(0, 3).map((occurrence) => (
                    <div
                      key={occurrence.occurrenceKey}
                      draggable={occurrence.canEdit}
                      onDragStart={(event) => dragStartHandler(occurrence, event)}
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpen(occurrence);
                      }}
                      className={`flex cursor-pointer items-center gap-1 truncate rounded px-1 py-0.5 text-[9.5px] transition hover:brightness-125 ${
                        occurrence.status === "termine" || occurrence.status === "annule"
                          ? "opacity-50"
                          : ""
                      }`}
                      style={{
                        background: categoryTint(occurrence.category, 0.2),
                        color: "#e9f1f2",
                        borderLeft: `2px solid ${categoryColor(occurrence.category)}`,
                      }}
                      title={`${occurrence.title} · ${timeRangeLabel(occurrence)}`}
                    >
                      {!occurrence.allDay ? (
                        <span className="font-mono text-[8.5px] text-white/60">
                          {formatKey(parisDateKey(new Date(occurrence.startAt)), "HH:mm")}
                        </span>
                      ) : null}
                      <span className="truncate">{occurrence.title}</span>
                    </div>
                  ))}
                  {dayEvents.length > 3 ? (
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelectDay(dayKey);
                      }}
                      className="px-1 text-[9px] font-medium text-alp-green/90 hover:text-alp-green"
                    >
                      +{dayEvents.length - 3} autres
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="glass rounded-2xl p-3.5">
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-[12.5px] font-semibold text-white">
              Détail du {capitalize(formatKey(selectedDay, "EEEE d MMMM"))}
            </h3>
            <p className="text-[10.5px] text-alp-muted">
              {selectedEvents.length} événement{selectedEvents.length > 1 ? "s" : ""} · cliquez sur une journée du calendrier
            </p>
          </div>
          <button
            onClick={() => onCreateAt(selectedDay, 9 * 60)}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10.5px] text-white/80 transition hover:border-alp-green/30 hover:text-alp-green-soft"
          >
            <Plus size={12} /> Ajouter
          </button>
        </div>
        {selectedEvents.length === 0 ? (
          <EmptyState
            title="Journée libre"
            description="Aucun événement sur cette date. Utilisez « Ajouter » ou cliquez sur un créneau dans la vue semaine."
          />
        ) : (
          <ul className="divide-y divide-white/6">
            {selectedEvents.map((occurrence) => (
              <li key={occurrence.occurrenceKey}>
                <button
                  onClick={() => onOpen(occurrence)}
                  className="flex w-full items-center gap-2.5 px-1 py-2 text-left transition hover:bg-white/[0.03]"
                >
                  <span
                    className="h-8 w-1 shrink-0 rounded-full"
                    style={{ background: categoryColor(occurrence.category) }}
                  />
                  <span className="w-24 shrink-0 text-[10.5px] text-alp-muted">
                    {timeRangeLabel(occurrence)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-white">
                      {occurrence.title}
                    </span>
                    <span className="flex items-center gap-2 text-[10px] text-alp-dim">
                      <CategoryIcon category={occurrence.category} size={10} />
                      {occurrence.location ?? "Sans lieu"}
                      {occurrence.participants.length > 0 ? (
                        <span>· {occurrence.participants.length} participant(s)</span>
                      ) : null}
                    </span>
                  </span>
                  {occurrence.assignedTo ? <Avatar user={occurrence.assignedTo} size={22} /> : null}
                  <ChevronRight size={14} className="text-alp-dim" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function ListView({
  events,
  todayKey,
  onOpen,
  onCreateAt,
}: ViewProps & { todayKey: string }) {
  const groups = new Map<string, EventOccurrence[]>();
  for (const occurrence of events) {
    const list = groups.get(occurrence.occurrenceDate) ?? [];
    list.push(occurrence);
    groups.set(occurrence.occurrenceDate, list);
  }
  const sortedKeys = [...groups.keys()].sort();

  if (events.length === 0) {
    return (
      <section className="glass rounded-2xl">
        <EmptyState
          title="Aucun événement sur la période"
          description="Ajustez les filtres, changez de période ou créez un nouvel événement pour alimenter l'agenda commun."
        />
      </section>
    );
  }

  return (
    <section className="glass overflow-hidden rounded-2xl">
      <header className="flex items-center justify-between border-b border-white/8 px-4 py-3">
        <div>
          <h2 className="text-[13px] font-semibold text-white">Tous les événements</h2>
          <p className="text-[10.5px] text-alp-muted">
            Triés par échéance · {events.length} résultat{events.length > 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => onCreateAt(todayKey, 9 * 60)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-alp-green/30 bg-alp-green/10 px-2.5 py-1.5 text-[11px] font-medium text-alp-green-soft transition hover:bg-alp-green/20"
        >
          <Plus size={13} /> Nouvel événement
        </button>
      </header>
      <div className="max-h-[calc(100vh-300px)] overflow-y-auto scroll-thin">
        {sortedKeys.map((dayKey) => {
          const dayEvents = groups.get(dayKey) ?? [];
          const isToday = dayKey === todayKey;
          const isPast = dayKey < todayKey;
          return (
            <div key={dayKey}>
              <div
                className={`sticky top-0 z-10 flex items-center gap-2 border-y border-white/7 px-4 py-1.5 backdrop-blur ${
                  isToday ? "bg-alp-green/10" : "bg-[#0b1112]/95"
                }`}
              >
                <span
                  className={`text-[10px] font-semibold tracking-[0.14em] uppercase ${
                    isToday ? "text-alp-green" : isPast ? "text-alp-dim" : "text-white/80"
                  }`}
                >
                  {isToday ? "Aujourd'hui" : capitalize(formatKey(dayKey, "EEEE"))}
                </span>
                <span className="text-[10.5px] text-alp-muted">
                  {formatKey(dayKey, "d MMMM yyyy")}
                </span>
                <span className="ml-auto rounded-full bg-white/6 px-2 py-0.5 text-[9.5px] text-alp-muted">
                  {dayEvents.length}
                </span>
              </div>
              <ul className="divide-y divide-white/5">
                {dayEvents.map((occurrence) => {
                  const late = isLate(occurrence);
                  return (
                    <li key={occurrence.occurrenceKey}>
                      <button
                        onClick={() => onOpen(occurrence)}
                        className="group flex w-full items-start gap-3 px-4 py-2.5 text-left transition hover:bg-white/[0.035]"
                      >
                        <span className="w-24 shrink-0 pt-0.5 font-mono text-[10.5px] text-alp-muted">
                          {occurrence.allDay ? "Journée" : timeRangeLabel(occurrence)}
                        </span>
                        <span
                          className="mt-0.5 h-9 w-1 shrink-0 rounded-full"
                          style={{ background: categoryColor(occurrence.category) }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`text-[12.5px] font-medium ${
                                occurrence.status === "termine" || occurrence.status === "annule"
                                  ? "text-white/55 line-through"
                                  : "text-white"
                              }`}
                            >
                              {occurrence.title}
                            </span>
                            <SyncBadge source={occurrence.source} syncStatus={occurrence.syncStatus} />
                            {late ? (
                              <span className="rounded-full bg-red-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-red-300">
                                En retard
                              </span>
                            ) : null}
                            {occurrence.isRecurring ? (
                              <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[9px] text-alp-muted">
                                récurrent
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-alp-dim">
                            <CategoryBadge category={occurrence.category} />
                            {occurrence.location ? (
                              <span className="inline-flex items-center gap-1">
                                <MapPin size={10} /> {occurrence.location}
                              </span>
                            ) : null}
                            <span className="inline-flex items-center gap-1">
                              <Clock size={10} /> maj {formatKey(parisDateKey(new Date(occurrence.updatedAt)), "dd/MM")}
                            </span>
                            {occurrence.priority !== "normale" ? (
                              <span
                                className="inline-flex items-center gap-1 font-medium"
                                style={{ color: priorityMeta(occurrence.priority).color }}
                              >
                                {priorityMeta(occurrence.priority).label}
                              </span>
                            ) : null}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {occurrence.participants.length > 0 ? (
                            <AvatarStack users={occurrence.participants} size={20} max={3} />
                          ) : occurrence.assignedTo ? (
                            <Avatar user={occurrence.assignedTo} size={22} />
                          ) : null}
                          <StatusBadge status={occurrence.status} />
                          <ChevronRight size={14} className="text-alp-dim transition group-hover:text-alp-green" />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function CalendarSkeleton() {
  return (
    <div className="glass overflow-hidden rounded-2xl">
      <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
        <div className="h-9 w-9 animate-pulse-soft rounded-lg bg-white/8" />
        <div className="space-y-1.5">
          <div className="h-3 w-40 animate-pulse-soft rounded bg-white/8" />
          <div className="h-2.5 w-24 animate-pulse-soft rounded bg-white/5" />
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px bg-white/5">
        {Array.from({ length: 35 }).map((_, index) => (
          <div key={index} className="min-h-[86px] space-y-2 bg-[#0b1112] p-2">
            <div className="h-2.5 w-5 animate-pulse-soft rounded bg-white/8" />
            {index % 3 === 0 ? (
              <div className="h-3 w-full animate-pulse-soft rounded bg-white/6" />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export { HOUR_HEIGHT, GRID_START, GRID_END };
