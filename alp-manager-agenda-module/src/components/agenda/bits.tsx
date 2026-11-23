"use client";

import type { ReactNode } from "react";
import {
  Briefcase,
  CalendarSync,
  CheckCheck,
  Repeat,
  FileText,
  FolderKanban,
  Gauge,
  Globe2,
  Handshake,
  Lock,
  PackageCheck,
  Truck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import {
  CATEGORIES,
  PRIORITIES,
  SOURCE_LABELS,
  STATUSES,
  type CategoryKey,
} from "@/lib/calendar/constants";
import type { EventPriority, EventSource, EventStatus, EventVisibility, UserRef } from "@/lib/calendar/types";

const ICONS: Record<string, LucideIcon> = {
  briefcase: Briefcase,
  handshake: Handshake,
  wrench: Wrench,
  truck: Truck,
  "package-check": PackageCheck,
  gauge: Gauge,
  "folder-kanban": FolderKanban,
  users: Users,
  "file-text": FileText,
};

export function categoryColor(category: CategoryKey): string {
  return CATEGORIES[category].color;
}

export function categoryLabel(category: CategoryKey): string {
  return CATEGORIES[category].label;
}

export function CategoryIcon({ category, className }: { category: CategoryKey; className?: string }) {
  const Icon = ICONS[CATEGORIES[category].icon] ?? FileText;
  return <Icon className={className} style={{ color: categoryColor(category) }} aria-hidden />;
}

/** Couleur translucide (hex + alpha 0–255) pour les fonds d'événements. */
export function tint(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(255, Math.round(alpha))).toString(16).padStart(2, "0");
  return `${hex}${a}`;
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function Avatar({ user, size = "sm" }: { user: Pick<UserRef, "fullName" | "color"> | null; size?: "xs" | "sm" | "md" }) {
  const dims = size === "xs" ? "h-5 w-5 text-[9px]" : size === "md" ? "h-9 w-9 text-xs" : "h-6 w-6 text-[10px]";
  if (!user) {
    return (
      <span
        className={`grid ${dims} place-items-center rounded-lg border border-dashed border-white/15 text-zinc-500`}
        title="Non assigné"
        aria-label="Non assigné"
      >
        ?
      </span>
    );
  }
  return (
    <span
      className={`grid ${dims} shrink-0 place-items-center rounded-lg font-bold text-alp-ink`}
      style={{ background: user.color }}
      title={user.fullName}
      aria-label={user.fullName}
    >
      {initialsOf(user.fullName)}
    </span>
  );
}

export function StatusPill({ status }: { status: EventStatus }) {
  const s = STATUSES[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium"
      style={{ borderColor: tint(s.color, 80), color: s.color, background: tint(s.color, 18) }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

export function PriorityPill({ priority }: { priority: EventPriority }) {
  if (priority === "normal" || priority === "low") return null;
  const p = PRIORITIES[priority];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{ color: p.color, background: tint(p.color, 26) }}
    >
      {p.label}
    </span>
  );
}

export function SourceBadge({ source }: { source: EventSource }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
      {source === "local" ? null : <CalendarSync className="h-3 w-3" aria-hidden />}
      {SOURCE_LABELS[source]}
    </span>
  );
}

export function VisibilityIcon({ visibility }: { visibility: EventVisibility }) {
  const Icon = visibility === "private" ? Lock : Globe2;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400">
      <Icon className="h-3 w-3" aria-hidden />
      {visibility === "private" ? "Privé" : "Partagé"}
    </span>
  );
}

export function RecurrenceMark() {
  return <Repeat className="h-3 w-3 shrink-0 opacity-80" aria-label="Événement récurrent" />;
}

export function DoneMark() {
  return <CheckCheck className="h-3 w-3 shrink-0" aria-label="Terminé" />;
}

/** Libellé de section en capitales, espacé (identité ALP). */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="alp-label">{children}</h3>;
}
