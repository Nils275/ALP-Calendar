"use client";

import { ChevronRight, MapPin } from "lucide-react";
import { useMemo } from "react";
import { CATEGORIES } from "@/lib/calendar/constants";
import type { ViewOccurrence } from "@/lib/calendar/types";
import { dateKey, formatDayLong, formatPeriod, parseDateKey, timeOf, formatDayShort } from "@/lib/calendar/time";
import { Avatar, CategoryIcon, PriorityPill, RecurrenceMark, SourceBadge, StatusPill, categoryColor } from "./bits";

type Props = {
  items: ViewOccurrence[];
  todayKey: string;
  onOpen: (occurrence: ViewOccurrence) => void;
};

export function ListView({ items, todayKey, onOpen }: Props) {
  const groups = useMemo(() => {
    const map = new Map<string, ViewOccurrence[]>();
    const sorted = [...items].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
    for (const occ of sorted) {
      const key = dateKey(new Date(occ.start));
      const list = map.get(key) ?? [];
      list.push(occ);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [items]);

  if (groups.length === 0) {
    return (
      <div className="alp-glass grid place-items-center rounded-3xl px-6 py-16 text-center">
        <p className="text-base font-medium text-zinc-200">Aucun événement à venir sur cette période</p>
        <p className="mt-1 text-sm text-zinc-500">Ajustez les filtres ou créez un nouvel événement.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map(([dayKey, list]) => {
        const isToday = dayKey === todayKey;
        const { day } = parseDateKey(dayKey);
        return (
          <section key={dayKey} className="alp-rise">
            <div className="mb-3 flex items-center gap-3">
              <span
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-center leading-none ${
                  isToday
                    ? "bg-alp-green text-alp-ink shadow-[0_0_20px_rgba(61,220,132,0.4)]"
                    : "border border-white/10 bg-white/[0.05] text-zinc-200"
                }`}
              >
                <span className="text-base font-bold tabular-nums">{day}</span>
              </span>
              <div>
                <p className="text-sm font-semibold capitalize text-white">{formatDayLong(dayKey)}</p>
                <p className="text-[11px] text-zinc-500">
                  {list.length} événement{list.length > 1 ? "s" : ""}
                  {isToday ? " · aujourd'hui" : ""}
                </p>
              </div>
              <span className="ml-2 h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
            </div>

            <ul className="space-y-2">
              {list.map((occ) => {
                const e = occ.event;
                const color = categoryColor(e.category);
                const multiDay = formatPeriod(new Date(occ.start), new Date(occ.end), e.allDay);
                const cancelled = occ.status === "cancelled";
                return (
                  <li key={occ.key}>
                    <button
                      type="button"
                      onClick={() => onOpen(occ)}
                      className="group flex w-full items-stretch overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.025] text-left transition-[background-color,border-color,transform] duration-200 hover:-translate-y-px hover:border-white/15 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alp-green"
                    >
                      <span className="w-1 shrink-0" style={{ background: color }} />
                      <div className="flex w-[84px] shrink-0 flex-col justify-center px-3 py-3 text-[12px] tabular-nums sm:w-[96px]">
                        {e.allDay ? (
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Journée</span>
                        ) : (
                          <>
                            <span className="font-semibold text-white">{timeOf(new Date(occ.start))}</span>
                            <span className="text-zinc-500">{timeOf(new Date(occ.end))}</span>
                          </>
                        )}
                      </div>
                      <div className="min-w-0 flex-1 py-3 pr-3">
                        <div className="flex items-center gap-2">
                          <CategoryIcon category={e.category} className="h-4 w-4 shrink-0" />
                          <p className={`truncate font-semibold text-white ${cancelled ? "line-through opacity-60" : ""}`}>
                            {e.title}
                          </p>
                          {occ.isRecurring && <RecurrenceMark />}
                          <PriorityPill priority={e.priority} />
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-zinc-400">
                          <span style={{ color }} className="font-medium">
                            {CATEGORIES[e.category].label}
                          </span>
                          {e.location && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" aria-hidden />
                              {e.location}
                            </span>
                          )}
                          {multiDay && !e.allDay && formatDayShort(dateKey(new Date(occ.start))) !== formatDayShort(dateKey(new Date(occ.end))) && (
                            <span className="text-zinc-500">{multiDay}</span>
                          )}
                          {e.assignedTo && (
                            <span className="inline-flex items-center gap-1.5">
                              <Avatar user={e.assignedTo} size="xs" />
                              {e.assignedTo.fullName}
                            </span>
                          )}
                          <StatusPill status={occ.status} />
                          <SourceBadge source={e.source} />
                        </div>
                      </div>
                      <div className="flex items-center pr-3">
                        <ChevronRight className="h-4 w-4 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-alp-green" aria-hidden />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
