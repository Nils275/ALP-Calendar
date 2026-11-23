"use client";

import {
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Columns3,
  LayoutGrid,
  List,
  LoaderCircle,
  Plus,
  RefreshCw,
} from "lucide-react";
import type { ViewMode } from "@/lib/calendar/time";

type Props = {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  periodLabel: string;
  todayLabel: string;
  loading: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onNew: () => void;
  onSync: () => void;
};

const VIEWS: Array<{ key: ViewMode; label: string; icon: typeof Clock }> = [
  { key: "day", label: "Jour", icon: Clock },
  { key: "week", label: "Semaine", icon: Columns3 },
  { key: "month", label: "Mois", icon: LayoutGrid },
  { key: "list", label: "Liste", icon: List },
];

export function AgendaToolbar({
  view,
  onViewChange,
  periodLabel,
  todayLabel,
  loading,
  onPrev,
  onNext,
  onToday,
  onNew,
  onSync,
}: Props) {
  return (
    <section className="alp-glass alp-rise relative overflow-hidden rounded-3xl p-4 sm:p-5">
      <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-alp-green/10 blur-3xl" />

      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-alp-green/15 text-alp-green ring-1 ring-alp-green/30">
            <CalendarDays className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-black uppercase tracking-[0.14em] text-white sm:text-3xl">Agenda</h1>
            <p className="mt-0.5 truncate text-xs capitalize text-zinc-400">
              <span className="text-zinc-500">Aujourd&apos;hui · </span>
              {todayLabel}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onSync} className="alp-btn" title="Synchronisation HubSpot (préparation)">
            <RefreshCw className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Synchro HubSpot</span>
            <span className="sm:hidden">Sync</span>
          </button>
          <button type="button" onClick={onNew} className="alp-btn alp-btn-primary">
            <Plus className="h-4 w-4" aria-hidden />
            Nouvel événement
          </button>
        </div>
      </div>

      <div className="relative mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={onPrev} aria-label="Période précédente" className="alp-btn alp-btn-icon">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" onClick={onToday} className="alp-btn">
            <CalendarCheck className="h-4 w-4 text-alp-green" aria-hidden />
            <span className="hidden sm:inline">Aujourd&apos;hui</span>
          </button>
          <button type="button" onClick={onNext} aria-label="Période suivante" className="alp-btn alp-btn-icon">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
          <h2 className="ml-1 truncate text-base font-semibold capitalize text-white sm:text-lg" aria-live="polite">
            {periodLabel}
          </h2>
          <span className="ml-1 grid h-5 w-5 place-items-center" aria-live="polite">
            {loading && <LoaderCircle className="h-4 w-4 animate-spin text-alp-green" aria-label="Chargement" />}
          </span>
        </div>

        <div role="tablist" aria-label="Mode d'affichage" className="inline-flex rounded-2xl border border-white/10 bg-black/35 p-1">
          {VIEWS.map((item) => {
            const active = item.key === view;
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onViewChange(item.key)}
                className={`relative flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors duration-200 ${
                  active ? "text-alp-ink" : "text-zinc-400 hover:text-zinc-100"
                }`}
              >
                {active && (
                  <span className="absolute inset-0 -z-0 rounded-xl bg-alp-green shadow-[0_6px_20px_rgba(61,220,132,0.35)]" />
                )}
                <Icon className="relative h-3.5 w-3.5" aria-hidden />
                <span className="relative">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
