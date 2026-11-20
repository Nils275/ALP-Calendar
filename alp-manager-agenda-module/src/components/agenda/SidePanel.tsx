"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Loader2,
  Plug,
  RotateCw,
  Truck,
} from "lucide-react";

import { Avatar } from "@/components/ui/Avatar";
import {
  CategoryIcon,
  MiniStat,
  timeRangeLabel,
} from "@/components/agenda/shared";
import { categoryColor } from "@/lib/agenda-config";
import type {
  AgendaReminder,
  AgendaResponse,
  EventOccurrence,
} from "@/lib/agenda-types";
import { capitalize, formatKey, formatParisTime } from "@/lib/time";

function EventLine({
  occurrence,
  onOpen,
  tone = "default",
}: {
  occurrence: EventOccurrence;
  onOpen: (occurrence: EventOccurrence) => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      onClick={() => onOpen(occurrence)}
      className="group flex w-full items-start gap-2 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-white/[0.05]"
    >
      <span
        className="mt-1 h-6 w-[3px] shrink-0 rounded-full"
        style={{ background: tone === "danger" ? "#f87171" : categoryColor(occurrence.category) }}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <span className="truncate text-[11.5px] font-medium text-white/90 group-hover:text-white">
            {occurrence.title}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 text-[9.5px] text-alp-dim">
          <CategoryIcon category={occurrence.category} size={9} />
          <span className={tone === "danger" ? "text-red-300" : ""}>
            {capitalize(formatKey(occurrence.occurrenceDate, "EEE d MMM"))} ·{" "}
            {timeRangeLabel(occurrence)}
          </span>
        </span>
      </span>
      {occurrence.assignedTo ? <Avatar user={occurrence.assignedTo} size={18} /> : null}
    </button>
  );
}

function Section({
  title,
  icon: Icon,
  count,
  children,
  action,
}: {
  title: string;
  icon: React.ElementType;
  count?: number;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5">
        <Icon size={12} className="text-alp-muted" />
        <h3 className="text-[10px] font-semibold tracking-[0.16em] text-alp-muted uppercase">
          {title}
        </h3>
        {typeof count === "number" ? (
          <span className="rounded-full bg-white/8 px-1.5 text-[9px] text-alp-muted">{count}</span>
        ) : null}
        <span className="ml-auto">{action}</span>
      </div>
      {children}
    </div>
  );
}

export function SidePanel({
  data,
  loading,
  onOpen,
  onCreate,
  onOpenSync,
  onOpenReminder,
}: {
  data: AgendaResponse | null;
  loading: boolean;
  onOpen: (occurrence: EventOccurrence) => void;
  onCreate: () => void;
  onOpenSync: () => void;
  onOpenReminder: (reminder: AgendaReminder) => void;
}) {
  const stats = data?.stats;
  const isEmpty = !data;

  return (
    <aside className="space-y-3">
      <div className="glass rounded-2xl p-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <div>
            <h2 className="text-[11px] font-semibold tracking-[0.2em] text-white uppercase">
              À venir
            </h2>
            <p className="text-[9.5px] text-alp-dim">Vue d&apos;ensemble de l&apos;équipe ALP</p>
          </div>
          <button
            onClick={onCreate}
            className="rounded-lg border border-white/10 bg-white/[0.04] p-1.5 text-alp-muted transition hover:border-alp-green/30 hover:text-alp-green"
            aria-label="Créer un événement"
            title="Nouvel événement"
          >
            <CalendarPlus size={14} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <MiniStat label="Aujourd'hui" value={stats?.today ?? 0} icon={CalendarClock} tone="green" />
          <MiniStat label="Cette semaine" value={stats?.week ?? 0} icon={CalendarClock} tone="cyan" />
          <MiniStat
            label="En retard"
            value={stats?.overdue ?? 0}
            icon={AlertTriangle}
            tone={stats && stats.overdue > 0 ? "danger" : "default"}
            hint="Événements non terminés dont l'échéance est passée"
          />
          <MiniStat
            label="Livraisons"
            value={stats?.upcomingDeliveries ?? 0}
            icon={Truck}
            tone="amber"
            hint="Livraisons à venir"
          />
        </div>

        <div className="mt-1.5 flex items-center justify-between rounded-lg border border-white/7 bg-white/[0.025] px-2 py-1.5">
          <span className="inline-flex items-center gap-1 text-[9.5px] text-alp-muted">
            <RotateCw size={10} /> Révisions à venir
          </span>
          <span className="text-[11px] font-semibold text-amber-300">
            {stats?.upcomingRevisions ?? 0}
          </span>
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          {[
            { key: "local", label: "ALP", color: "#3ee07d", value: stats?.bySource.local ?? 0 },
            { key: "hubspot", label: "HubSpot", color: "#f97316", value: stats?.bySource.hubspot ?? 0 },
            { key: "outlook", label: "Outlook", color: "#38bdf8", value: stats?.bySource.outlook ?? 0 },
          ].map((source) => (
            <span
              key={source.key}
              className="inline-flex items-center gap-1 rounded border border-white/8 px-1.5 py-0.5 text-[9px] text-alp-muted"
              title={`${source.label} : ${source.value} occurrence(s) sur la période`}
            >
              <span className="h-1 w-1 rounded-full" style={{ background: source.color }} />
              {source.label} {source.value}
            </span>
          ))}
          <button
            onClick={onOpenSync}
            className="ml-auto inline-flex items-center gap-1 text-[9.5px] font-medium text-alp-green/90 hover:text-alp-green"
          >
            <Plug size={10} /> Sync
          </button>
        </div>
      </div>

      <div className="glass space-y-3 rounded-2xl p-3.5">
        {loading && isEmpty ? (
          <div className="flex items-center justify-center gap-2 py-8 text-[11px] text-alp-muted">
            <Loader2 size={14} className="animate-spin" /> Chargement de l&apos;agenda…
          </div>
        ) : null}

        {data ? (
          <>
            <Section
              title="Prochaines échéances"
              icon={CalendarClock}
              count={data.upcoming.length}
            >
              {data.upcoming.length === 0 ? (
                <p className="rounded-lg border border-dashed border-white/10 px-2 py-3 text-center text-[10.5px] text-alp-dim">
                  Aucun événement à venir. Créez le premier événement de l&apos;équipe.
                </p>
              ) : (
                <div className="space-y-0.5">
                  {data.upcoming.slice(0, 6).map((occurrence) => (
                    <EventLine key={occurrence.occurrenceKey} occurrence={occurrence} onOpen={onOpen} />
                  ))}
                </div>
              )}
            </Section>

            <div className="h-px bg-white/7" />

            <Section title="En retard" icon={AlertTriangle} count={data.overdueEvents.length}>
              {data.overdueEvents.length === 0 ? (
                <p className="flex items-center gap-1.5 rounded-lg border border-dashed border-white/10 px-2 py-2 text-[10.5px] text-alp-dim">
                  <CheckCircle2 size={12} className="text-alp-green/70" /> Aucun retard, tout est à jour.
                </p>
              ) : (
                <div className="space-y-0.5">
                  {data.overdueEvents.slice(0, 4).map((occurrence) => (
                    <EventLine
                      key={occurrence.occurrenceKey}
                      occurrence={occurrence}
                      onOpen={onOpen}
                      tone="danger"
                    />
                  ))}
                </div>
              )}
            </Section>

            <div className="h-px bg-white/7" />

            <Section title="Prochaines livraisons" icon={Truck} count={data.nextDeliveries.length}>
              {data.nextDeliveries.length === 0 ? (
                <p className="rounded-lg border border-dashed border-white/10 px-2 py-2 text-center text-[10.5px] text-alp-dim">
                  Aucune livraison planifiée.
                </p>
              ) : (
                <div className="space-y-0.5">
                  {data.nextDeliveries.map((occurrence) => (
                    <EventLine key={occurrence.occurrenceKey} occurrence={occurrence} onOpen={onOpen} />
                  ))}
                </div>
              )}
            </Section>

            {data.nextRevisions.length > 0 ? (
              <>
                <div className="h-px bg-white/7" />
                <Section title="Prochaines révisions" icon={RotateCw}>
                  <div className="space-y-0.5">
                    {data.nextRevisions.map((occurrence) => (
                      <EventLine key={occurrence.occurrenceKey} occurrence={occurrence} onOpen={onOpen} />
                    ))}
                  </div>
                </Section>
              </>
            ) : null}

            <div className="h-px bg-white/7" />

            <Section title="Rappels in-app" icon={Bell} count={data.reminders.length}>
              {data.reminders.length === 0 ? (
                <p className="rounded-lg border border-dashed border-white/10 px-2 py-2 text-center text-[10.5px] text-alp-dim">
                  Aucun rappel dans les prochaines 24 heures.
                </p>
              ) : (
                <div className="space-y-1">
                  {data.reminders.slice(0, 4).map((reminder) => (
                    <button
                      key={reminder.occurrenceKey}
                      onClick={() => onOpenReminder(reminder)}
                      className="flex w-full items-center gap-2 rounded-lg border border-white/7 bg-white/[0.025] px-2 py-1.5 text-left transition hover:border-alp-green/25"
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          reminder.due ? "bg-alp-green animate-pulse-soft" : "bg-amber-400"
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[10.5px] text-white/85">
                          {reminder.title}
                        </span>
                        <span className="block text-[9px] text-alp-dim">
                          {formatKey(reminder.occurrenceKey.slice(-10), "dd/MM")} ·{" "}
                          {formatParisTime(reminder.startAt)} ·{" "}
                          {reminder.due ? "rappel dû" : "rappel programmé"}
                        </span>
                      </span>
                      <ArrowUpRight size={11} className="text-alp-dim" />
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-1.5 text-[9px] leading-relaxed text-alp-dim">
                Rappels internes ALP Manager uniquement — aucun email ni notification système
                n&apos;est envoyé.
              </p>
            </Section>
          </>
        ) : null}
      </div>

      <div className="rounded-2xl border border-alp-green/15 bg-gradient-to-br from-alp-green/[0.09] to-transparent p-3">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] text-alp-green/90 uppercase">
          <Plug size={11} /> HubSpot
        </p>
        <p className="mt-1 text-[10.5px] leading-relaxed text-white/65">
          Connecteur non actif. Les champs de synchronisation sont déjà présents sur chaque
          événement pour éviter les doublons lors d&apos;un futur import.
        </p>
        <button
          onClick={onOpenSync}
          className="mt-2 inline-flex items-center gap-1 rounded-lg border border-alp-green/30 bg-alp-green/10 px-2 py-1 text-[10.5px] font-medium text-alp-green-soft transition hover:bg-alp-green/20"
        >
          Voir l&apos;état de préparation <ArrowUpRight size={11} />
        </button>
      </div>
    </aside>
  );
}
