"use client";

import {
  Briefcase,
  CalendarClock,
  FileText,
  Package,
  RotateCw,
  Target,
  Truck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { DragEvent } from "react";

import { Avatar } from "@/components/ui/Avatar";
import {
  categoryColor,
  categoryLabel,
  categoryTint,
  priorityMeta,
  statusMeta,
  syncStatusMeta,
} from "@/lib/agenda-config";
import type { EventOccurrence } from "@/lib/agenda-types";
import { formatParisDate, formatParisTime } from "@/lib/time";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  commercial: Briefcase,
  rendez_vous: CalendarClock,
  atelier: Wrench,
  livraison: Truck,
  reception: Package,
  revision: RotateCw,
  projet: Target,
  reunion_interne: Users,
  administratif: FileText,
};

export function CategoryIcon({
  category,
  size = 13,
}: {
  category: string;
  size?: number;
}) {
  const Icon = CATEGORY_ICONS[category] ?? CalendarClock;
  return <Icon size={size} style={{ color: categoryColor(category) }} />;
}

export function CategoryBadge({
  category,
  withIcon = true,
}: {
  category: string;
  withIcon?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide"
      style={{
        color: categoryColor(category),
        borderColor: categoryTint(category, 0.35),
        background: categoryTint(category, 0.12),
      }}
    >
      {withIcon ? <CategoryIcon category={category} size={11} /> : null}
      {categoryLabel(category)}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const meta = statusMeta(status);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{
        color: meta.color,
        background: `${meta.color}18`,
        boxShadow: `inset 0 0 0 1px ${meta.color}33`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const meta = priorityMeta(priority);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ color: meta.color, background: `${meta.color}18` }}
    >
      <span className="h-1.5 w-1.5 rounded-sm" style={{ background: meta.color }} />
      {meta.label}
    </span>
  );
}

export function SyncBadge({
  source,
  syncStatus,
}: {
  source: string;
  syncStatus: string;
}) {
  const isLocal = source === "local";
  const sync = syncStatusMeta(syncStatus);
  const label = isLocal ? "ALP" : source === "hubspot" ? "HubSpot" : "Outlook";
  const color = isLocal ? "#94a3b8" : source === "hubspot" ? "#f97316" : "#38bdf8";
  return (
    <span
      className="inline-flex items-center gap-1 rounded border border-white/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-[0.08em] uppercase"
      style={{ color }}
      title={`Source ${label} · synchronisation ${sync.label}`}
    >
      {label}
      {!isLocal ? (
        <span className="h-1 w-1 rounded-full" style={{ background: sync.color }} />
      ) : null}
    </span>
  );
}

export function timeRangeLabel(occurrence: EventOccurrence): string {
  if (occurrence.allDay) return "Journée entière";
  const start = formatParisTime(occurrence.startAt);
  const end = formatParisTime(occurrence.endAt);
  const sameDay =
    formatParisDate(occurrence.startAt) === formatParisDate(occurrence.endAt);
  if (!sameDay) {
    return `${start} → ${formatParisDate(occurrence.endAt)} ${end}`;
  }
  return `${start} – ${end}`;
}

export function dateRangeLabel(occurrence: EventOccurrence): string {
  const start = formatParisDate(occurrence.startAt);
  const end = formatParisDate(occurrence.endAt);
  if (start === end) return start;
  return `du ${start} au ${end}`;
}

export function isLate(occurrence: EventOccurrence): boolean {
  const todayKey = formatParisDate(new Date());
  return (
    (occurrence.status === "a_venir" || occurrence.status === "en_cours") &&
    new Date(occurrence.endAt).getTime() < Date.now() &&
    (!occurrence.isRecurring || occurrence.occurrenceDate >= todayKey)
  );
}

export function EventChip({
  occurrence,
  onOpen,
  onDragStart,
  compact = false,
  showTime = true,
  className = "",
}: {
  occurrence: EventOccurrence;
  onOpen: (occurrence: EventOccurrence) => void;
  onDragStart?: (occurrence: EventOccurrence, event: DragEvent) => void;
  compact?: boolean;
  showTime?: boolean;
  className?: string;
}) {
  const color = categoryColor(occurrence.category);
  const late = isLate(occurrence);
  const done = occurrence.status === "termine" || occurrence.status === "annule";

  return (
    <button
      type="button"
      draggable={occurrence.canEdit}
      onDragStart={(event) => onDragStart?.(occurrence, event)}
      onClick={(event) => {
        event.stopPropagation();
        onOpen(occurrence);
      }}
      className={`group w-full overflow-hidden rounded-md border border-white/8 text-left transition hover:border-white/25 hover:brightness-110 ${
        occurrence.canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      } ${done ? "opacity-55" : ""} ${className}`}
      style={{
        background: `linear-gradient(100deg, ${categoryTint(occurrence.category, 0.3)} 0%, rgba(12,17,18,0.9) 65%)`,
        boxShadow: `inset 2.5px 0 0 0 ${color}`,
      }}
      title={`${occurrence.title} · ${timeRangeLabel(occurrence)}`}
    >
      <span className="flex min-w-0 items-start gap-1.5 px-1.5 py-1">
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-[11px] font-semibold leading-tight ${
              done ? "text-white/60 line-through" : "text-white"
            }`}
          >
            {occurrence.title}
          </span>
          {!compact ? (
            <span className="mt-0.5 flex items-center gap-1 text-[9.5px] text-white/55">
              {showTime ? <span>{timeRangeLabel(occurrence)}</span> : null}
              {late ? <span className="text-red-400">· en retard</span> : null}
            </span>
          ) : null}
        </span>
        {occurrence.assignedTo ? (
          <Avatar user={occurrence.assignedTo} size={compact ? 13 : 16} className="mt-0.5" />
        ) : null}
      </span>
    </button>
  );
}

export function MiniStat({
  label,
  value,
  icon: Icon,
  tone = "default",
  hint,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: "default" | "danger" | "green" | "amber" | "cyan";
  hint?: string;
}) {
  const tones: Record<string, { color: string; bg: string }> = {
    default: { color: "#cbd5d6", bg: "rgba(255,255,255,0.04)" },
    danger: { color: "#f87171", bg: "rgba(248,113,113,0.09)" },
    green: { color: "#3ee07d", bg: "rgba(62,224,125,0.09)" },
    amber: { color: "#fbbf24", bg: "rgba(251,191,36,0.09)" },
    cyan: { color: "#22d3ee", bg: "rgba(34,211,238,0.09)" },
  };
  const theme = tones[tone];
  return (
    <div
      className="rounded-xl border border-white/7 p-2.5"
      style={{ background: theme.bg }}
      title={hint}
    >
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-semibold tracking-[0.14em] text-alp-muted uppercase">
          {label}
        </span>
        <Icon size={12} style={{ color: theme.color }} />
      </div>
      <div className="mt-1 text-[19px] font-semibold leading-none" style={{ color: theme.color }}>
        {value}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex h-full min-h-32 flex-col items-center justify-center gap-1 px-4 py-8 text-center">
      <p className="text-[12.5px] font-medium text-white/80">{title}</p>
      <p className="max-w-xs text-[11px] leading-relaxed text-alp-dim">{description}</p>
    </div>
  );
}
