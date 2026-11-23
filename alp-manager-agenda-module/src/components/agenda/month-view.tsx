"use client";

import { ChevronRight, Plus, CalendarDays } from "lucide-react";
import { useMemo, useState, type DragEvent } from "react";
import { CATEGORIES, WEEKDAY_SHORT } from "@/lib/calendar/constants";
import { DRAG_MIME, readDragPayload, type DragPayload } from "@/lib/calendar/client";
import type { ViewOccurrence } from "@/lib/calendar/types";
import {
  dateKey,
  formatDayLong,
  formatDayNumber,
  lastDayKeyOf,
  monthGridKeys,
  parseDateKey,
  timeOf,
} from "@/lib/calendar/time";
import { Avatar, CategoryIcon, PriorityPill, RecurrenceMark, StatusPill, categoryColor, tint } from "./bits";

type Props = {
  anchorKey: string;
  items: ViewOccurrence[];
  todayKey: string;
  selectedKey: string | null;
  onSelectDay: (dayKey: string) => void;
  onOpen: (occurrence: ViewOccurrence) => void;
  onMove: (payload: DragPayload, dayKey: string) => void;
  onOpenDay: (dayKey: string) => void;
  onCreateOnDay: (dayKey: string) => void;
};

const MAX_PILLS = 3;

export function MonthView({
  anchorKey,
  items,
  todayKey,
  selectedKey,
  onSelectDay,
  onOpen,
  onMove,
  onOpenDay,
  onCreateOnDay,
}: Props) {
  const [overKey, setOverKey] = useState<string | null>(null);
  const keys = useMemo(() => monthGridKeys(anchorKey), [anchorKey]);
  const currentMonth = parseDateKey(anchorKey).month;

  const byDay = useMemo(() => {
    const map = new Map<string, ViewOccurrence[]>();
    for (const key of keys) map.set(key, []);
    for (const occ of items) {
      const startKey = dateKey(new Date(occ.start));
      const lastKey = lastDayKeyOf(new Date(occ.end));
      for (const key of keys) {
        if (key >= startKey && key <= lastKey) map.get(key)?.push(occ);
      }
    }
    return map;
  }, [keys, items]);

  const selectedItems = selectedKey ? (byDay.get(selectedKey) ?? []) : [];

  function handleDragOver(event: DragEvent<HTMLDivElement>, key: string) {
    if (!event.dataTransfer.types.includes(DRAG_MIME) && !event.dataTransfer.types.includes("text/plain")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setOverKey(key);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, key: string) {
    event.preventDefault();
    setOverKey(null);
    const payload = readDragPayload(event.dataTransfer);
    if (payload) onMove(payload, key);
  }

  function startDrag(event: DragEvent<HTMLButtonElement>, occ: ViewOccurrence) {
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
  }

  return (
    <div className="space-y-4">
      <div className="alp-glass overflow-hidden rounded-3xl">
        <div className="grid grid-cols-7 border-b border-white/[0.07] bg-white/[0.02]">
          {WEEKDAY_SHORT.map((label) => (
            <div key={label} className="py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {keys.map((key) => {
            const inMonth = parseDateKey(key).month === currentMonth;
            const dayItems = byDay.get(key) ?? [];
            const isToday = key === todayKey;
            const isSelected = key === selectedKey;
            const isOver = key === overKey;
            const visible = dayItems.slice(0, MAX_PILLS);
            const more = dayItems.length - visible.length;

            return (
              <div
                key={key}
                role="gridcell"
                tabIndex={0}
                aria-selected={isSelected}
                aria-label={`${formatDayLong(key)} — ${dayItems.length} événement(s)`}
                onClick={() => onSelectDay(key)}
                onDoubleClick={() => onOpenDay(key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onSelectDay(key);
                }}
                onDragOver={(e) => handleDragOver(e, key)}
                onDragLeave={() => setOverKey((k) => (k === key ? null : k))}
                onDrop={(e) => handleDrop(e, key)}
                className={`group relative flex min-h-[78px] cursor-pointer flex-col gap-1 border-b border-r border-white/[0.05] p-1.5 text-left outline-none transition-colors duration-200 last:border-r-0 sm:min-h-[122px] sm:p-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-alp-green ${
                  inMonth ? "" : "bg-black/25"
                } ${
                  isSelected
                    ? "bg-alp-green/[0.08] shadow-[inset_0_0_0_1px_rgba(61,220,132,0.55)]"
                    : "hover:bg-white/[0.03]"
                } ${isOver ? "bg-alp-green/15 shadow-[inset_0_0_0_1px_rgba(61,220,132,0.8)]" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`grid h-7 w-7 place-items-center rounded-full text-[13px] font-semibold tabular-nums ${
                      isToday
                        ? "bg-alp-green text-alp-ink shadow-[0_0_16px_rgba(61,220,132,0.45)]"
                        : inMonth
                          ? "text-zinc-100"
                          : "text-zinc-600"
                    }`}
                  >
                    {formatDayNumber(key)}
                  </span>
                  {dayItems.length > 0 && (
                    <span className="rounded-full bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-zinc-300">
                      {dayItems.length}
                    </span>
                  )}
                </div>

                {/* Pastilles (ordinateur / tablette) */}
                <div className="hidden flex-col gap-1 sm:flex">
                  {visible.map((occ) => {
                    const color = categoryColor(occ.event.category);
                    const cancelled = occ.status === "cancelled";
                    return (
                      <button
                        type="button"
                        key={`${occ.key}|${key}`}
                        draggable={occ.event.canEdit && !cancelled}
                        onDragStart={(e) => startDrag(e, occ)}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(occ);
                        }}
                        onDoubleClick={(e) => e.stopPropagation()}
                        className={`flex min-w-0 items-center gap-1.5 truncate rounded-md px-1.5 py-[3px] text-left text-[11px] text-zinc-100 transition hover:brightness-125 ${
                          occ.status === "done" || cancelled ? "opacity-55" : ""
                        } ${occ.event.canEdit && !cancelled ? "cursor-grab" : "cursor-pointer"}`}
                        style={{ background: `linear-gradient(90deg, ${tint(color, 60)}, ${tint(color, 22)})` }}
                        title={occ.event.title}
                      >
                        <span className="h-3 w-[3px] shrink-0 rounded-full" style={{ background: color }} />
                        <span className={`truncate ${cancelled ? "line-through" : ""}`}>
                          {occ.event.allDay ? "" : <span className="tabular-nums text-zinc-300">{timeOf(new Date(occ.start))} </span>}
                          {occ.event.title}
                        </span>
                        {occ.isRecurring && <RecurrenceMark />}
                      </button>
                    );
                  })}
                  {more > 0 && <span className="px-1 text-[10px] font-medium text-zinc-500">+{more} autre{more > 1 ? "s" : ""}</span>}
                </div>

                {/* Points (mobile) */}
                <div className="flex flex-wrap gap-1 sm:hidden">
                  {dayItems.slice(0, 4).map((occ) => (
                    <span
                      key={`${occ.key}|dot|${key}`}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: categoryColor(occ.event.category) }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <p className="border-t border-white/[0.05] px-4 py-2 text-[11px] text-zinc-500">
          Cliquez sur un jour pour voir son détail · double-cliquez pour ouvrir la journée · glissez un événement vers un autre jour pour le déplacer
        </p>
      </div>

      {selectedKey && (
        <section className="alp-glass alp-rise rounded-3xl p-5 sm:p-6" aria-label="Détail de la journée sélectionnée">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="alp-label">Journée sélectionnée</p>
              <h3 className="mt-1 text-lg font-semibold text-white">{formatDayLong(selectedKey)}</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="alp-btn" onClick={() => onOpenDay(selectedKey)}>
                <CalendarDays className="h-4 w-4" aria-hidden /> Voir la journée
              </button>
              <button type="button" className="alp-btn alp-btn-primary" onClick={() => onCreateOnDay(selectedKey)}>
                <Plus className="h-4 w-4" aria-hidden /> Ajouter
              </button>
            </div>
          </div>

          {selectedItems.length === 0 ? (
            <p className="mt-6 rounded-2xl border border-dashed border-white/10 py-8 text-center text-sm text-zinc-500">
              Aucun événement ce jour-là avec les filtres en cours.
            </p>
          ) : (
            <ul className="mt-5 space-y-2">
              {selectedItems.map((occ) => (
                <li key={`${occ.key}|sel`}>
                  <button
                    type="button"
                    onClick={() => onOpen(occ)}
                    className="group flex w-full items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3 text-left transition hover:border-white/15 hover:bg-white/[0.05]"
                  >
                    <span className="h-10 w-1 shrink-0 rounded-full" style={{ background: categoryColor(occ.event.category) }} />
                    <div className="w-14 shrink-0 text-[12px] tabular-nums text-zinc-400">
                      {occ.event.allDay ? (
                        <span className="text-[10px] uppercase tracking-wider text-zinc-500">Journée</span>
                      ) : (
                        <>
                          <span className="block font-semibold text-zinc-100">{timeOf(new Date(occ.start))}</span>
                          <span>{timeOf(new Date(occ.end))}</span>
                        </>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <CategoryIcon category={occ.event.category} className="h-3.5 w-3.5 shrink-0" />
                        <p className="truncate text-sm font-semibold text-white">{occ.event.title}</p>
                        {occ.isRecurring && <RecurrenceMark />}
                      </div>
                      <p className="mt-0.5 truncate text-[12px] text-zinc-500">
                        {CATEGORIES[occ.event.category].label}
                        {occ.event.location ? ` · ${occ.event.location}` : ""}
                      </p>
                    </div>
                    <div className="hidden items-center gap-2 sm:flex">
                      <PriorityPill priority={occ.event.priority} />
                      <StatusPill status={occ.status} />
                      <Avatar user={occ.event.assignedTo} />
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-alp-green" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
