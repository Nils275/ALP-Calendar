"use client";

import { AlertTriangle, CalendarClock, CalendarRange, Truck, Wrench } from "lucide-react";
import type { ReactNode } from "react";
import type { AgendaItemDto, AgendaSummaryDto } from "@/lib/calendar/types";
import { dateKey, formatDayShort, timeOf } from "@/lib/calendar/time";
import { Avatar, categoryColor } from "./bits";

type Props = {
  summary: AgendaSummaryDto | null;
  loading: boolean;
  error: string | null;
  onOpen: (item: AgendaItemDto) => void;
  onRetry: () => void;
};

type Tone = "green" | "blue" | "red" | "orange" | "neutral";

const TONE_CLASS: Record<Tone, { text: string; bg: string; ring: string }> = {
  green: { text: "text-alp-green", bg: "bg-alp-green/10", ring: "ring-alp-green/25" },
  blue: { text: "text-sky-300", bg: "bg-sky-400/10", ring: "ring-sky-400/25" },
  red: { text: "text-red-300", bg: "bg-red-500/10", ring: "ring-red-500/30" },
  orange: { text: "text-orange-300", bg: "bg-orange-400/10", ring: "ring-orange-400/25" },
  neutral: { text: "text-zinc-300", bg: "bg-white/[0.04]", ring: "ring-white/10" },
};

function Indicator({ label, value, icon, tone }: { label: string; value: number; icon: ReactNode; tone: Tone }) {
  const t = TONE_CLASS[tone];
  return (
    <div className={`rounded-2xl p-3 ring-1 transition-transform duration-300 hover:-translate-y-0.5 ${t.bg} ${t.ring}`}>
      <div className={`flex items-center justify-between ${t.text}`}>
        {icon}
        <span className="text-2xl font-black tabular-nums">{value}</span>
      </div>
      <p className="mt-2 text-[11px] font-medium uppercase tracking-wider text-zinc-400">{label}</p>
    </div>
  );
}

function PanelItem({ item, onOpen, overdue }: { item: AgendaItemDto; onOpen: (item: AgendaItemDto) => void; overdue?: boolean }) {
  const start = new Date(item.start);
  const color = categoryColor(item.category);
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(item)}
        className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-alp-green"
      >
        <span className="h-9 w-1 shrink-0 rounded-full" style={{ background: overdue ? "#ef4444" : color }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-zinc-100 group-hover:text-white">{item.title}</p>
          <p className={`truncate text-[11px] ${overdue ? "text-red-300/90" : "text-zinc-500"}`}>
            {formatDayShort(dateKey(start))} · {item.allDay ? "Journée" : timeOf(start)}
            {item.location ? ` · ${item.location}` : ""}
          </p>
        </div>
        <Avatar user={item.assignee} size="xs" />
      </button>
    </li>
  );
}

function PanelSection({
  title,
  items,
  emptyText,
  onOpen,
  overdue,
}: {
  title: string;
  items: AgendaItemDto[];
  emptyText: string;
  onOpen: (item: AgendaItemDto) => void;
  overdue?: boolean;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between px-1">
        <h3 className={`alp-label ${overdue && items.length > 0 ? "!text-red-300/90" : ""}`}>{title}</h3>
        <span className="text-[10px] tabular-nums text-zinc-600">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-xs text-zinc-500">{emptyText}</p>
      ) : (
        <ul className="space-y-0.5">
          {items.map((item) => (
            <PanelItem key={item.key} item={item} onOpen={onOpen} overdue={overdue} />
          ))}
        </ul>
      )}
    </div>
  );
}

export function AgendaPanel({ summary, loading, error, onOpen, onRetry }: Props) {
  return (
    <aside aria-label="Événements à venir" className="alp-glass space-y-6 rounded-3xl p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className="h-2 w-2 rounded-full bg-alp-green alp-pulse-dot" />
        <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">À venir</h2>
      </div>

      {loading && !summary ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="alp-skeleton h-[78px] rounded-2xl" />
            ))}
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="alp-skeleton h-12 rounded-xl" />
          ))}
        </div>
      ) : error && !summary ? (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200">
          <p>{error}</p>
          <button type="button" onClick={onRetry} className="alp-btn mt-3 h-8 text-xs">
            Réessayer
          </button>
        </div>
      ) : summary ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Indicator label="Aujourd'hui" value={summary.counts.today} tone="green" icon={<CalendarClock className="h-4 w-4" aria-hidden />} />
            <Indicator label="Cette semaine" value={summary.counts.week} tone="blue" icon={<CalendarRange className="h-4 w-4" aria-hidden />} />
            <Indicator
              label="En retard"
              value={summary.counts.overdue}
              tone={summary.counts.overdue > 0 ? "red" : "neutral"}
              icon={<AlertTriangle className="h-4 w-4" aria-hidden />}
            />
            <Indicator label="Livraisons à venir" value={summary.counts.deliveries} tone="orange" icon={<Truck className="h-4 w-4" aria-hidden />} />
          </div>

          <PanelSection title="Échéances du jour" items={summary.today} emptyText="Rien de prévu aujourd'hui." onOpen={onOpen} />
          <PanelSection title="En retard" items={summary.overdue} emptyText="Aucune tâche en retard." onOpen={onOpen} overdue />
          <PanelSection title="Prochains événements" items={summary.upcoming} emptyText="Aucun événement à venir." onOpen={onOpen} />
          <PanelSection title="Prochaines livraisons" items={summary.deliveries} emptyText="Aucune livraison planifiée." onOpen={onOpen} />
          <div className="space-y-1">
            <PanelSection title="Prochaines révisions" items={summary.revisions} emptyText="Aucune révision planifiée." onOpen={onOpen} />
            <p className="flex items-center gap-1.5 px-1 pt-2 text-[10px] text-zinc-600">
              <Wrench className="h-3 w-3" aria-hidden />
              Indicateurs calculés sur les événements visibles par vous.
            </p>
          </div>
        </>
      ) : null}
    </aside>
  );
}
