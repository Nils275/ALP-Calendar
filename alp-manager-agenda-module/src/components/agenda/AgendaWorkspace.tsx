"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";

import { EventDetail, type EventScope } from "@/components/agenda/EventDetail";
import { EventForm } from "@/components/agenda/EventForm";
import { SidePanel } from "@/components/agenda/SidePanel";
import { SyncDialog } from "@/components/agenda/SyncDialog";
import {
  CalendarSkeleton,
  DayView,
  ListView,
  MonthView,
  WeekView,
} from "@/components/agenda/AgendaViews";
import { Modal } from "@/components/ui/Modal";
import { CategoryBadge, CategoryIcon, isLate } from "@/components/agenda/shared";
import {
  EVENT_CATEGORIES,
  canCreateEvents,
  categoryColor,
  categoryTint,
  statusMeta,
  VIEW_MODES,
  type ViewMode,
} from "@/lib/agenda-config";
import type {
  AgendaReminder,
  AgendaResponse,
  AgendaUser,
  EventOccurrence,
} from "@/lib/agenda-types";
import type { EventInput } from "@/lib/agenda-schema";
import {
  addDaysKey,
  addMonthsKey,
  capitalize,
  endOfWeekKey,
  formatKey,
  formatParisDate,
  formatParisTime,
  monthGridKeys,
  parisDateKey,
  parisMinutesOfDay,
  startOfWeekKey,
} from "@/lib/time";

type Toast = { id: number; message: string; tone: "success" | "error" | "info" };

type FormState = {
  occurrence: EventOccurrence | null;
  scope: EventScope;
  defaultDate: string;
  defaultMinutes: number;
};

export function AgendaWorkspace({
  currentUser,
  collaborators,
  initialAssignee = "all",
}: {
  currentUser: AgendaUser;
  collaborators: AgendaUser[];
  initialAssignee?: string;
}) {
  const todayKey = useMemo(() => parisDateKey(new Date()), []);
  const [view, setView] = useState<ViewMode>("week");
  const [cursor, setCursor] = useState(todayKey);
  const [selectedDay, setSelectedDay] = useState(todayKey);
  const [categories, setCategories] = useState<string[]>([]);
  const [assignee, setAssignee] = useState(initialAssignee);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState<"all" | "mine">("all");
  const [data, setData] = useState<AgendaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [detail, setDetail] = useState<EventOccurrence | null>(null);
  const [formState, setFormState] = useState<FormState | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ occurrence: EventOccurrence; scope: EventScope } | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const toastId = useRef(0);

  const canCreate = canCreateEvents(currentUser.role);

  const range = useMemo(() => {
    if (view === "day") return { from: cursor, to: cursor };
    if (view === "week") return { from: startOfWeekKey(cursor), to: endOfWeekKey(cursor) };
    if (view === "month") {
      const grid = monthGridKeys(cursor);
      return { from: grid[0], to: grid[grid.length - 1] };
    }
    return { from: addDaysKey(cursor, -30), to: addDaysKey(cursor, 180) };
  }, [view, cursor]);

  const pushToast = useCallback((message: string, tone: Toast["tone"] = "success") => {
    toastId.current += 1;
    const id = toastId.current;
    setToasts((previous) => [...previous, { id, message, tone }]);
    setTimeout(() => {
      setToasts((previous) => previous.filter((toast) => toast.id !== id));
    }, 4200);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 260);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ from: range.from, to: range.to, view });
      if (categories.length > 0) params.set("categories", categories.join(","));
      if (assignee !== "all") params.set("assignee", assignee);
      if (search) params.set("search", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (scopeFilter !== "all") params.set("scope", scopeFilter);
      try {
        const response = await fetch(`/api/events?${params.toString()}`, {
          cache: "no-store",
          signal,
        });
        const payload = (await response.json()) as {
          ok: boolean;
          data?: AgendaResponse;
          error?: string;
        };
        if (!response.ok || !payload.ok || !payload.data) {
          throw new Error(payload.error ?? "Chargement de l'agenda impossible");
        }
        setData(payload.data);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        if (caught instanceof Error && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Chargement impossible");
      } finally {
        setLoading(false);
      }
    },
    [range.from, range.to, view, categories, assignee, search, statusFilter, scopeFilter],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void load(controller.signal);
    }, 160);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load, refreshToken]);

  const refresh = useCallback(() => setRefreshToken((value) => value + 1), []);

  const mutate = useCallback(
    async (path: string, init: RequestInit, successMessage: string) => {
      setBusy(true);
      try {
        const response = await fetch(path, init);
        const payload = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (!response.ok || payload.ok === false) {
          throw new Error(payload.error ?? "Action impossible");
        }
        pushToast(successMessage, "success");
        refresh();
        return true;
      } catch (caught) {
        pushToast(caught instanceof Error ? caught.message : "Action impossible", "error");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [pushToast, refresh],
  );

  const step = (direction: number) => {
    if (view === "day") {
      const next = addDaysKey(cursor, direction);
      setCursor(next);
      setSelectedDay(next);
      return;
    }
    if (view === "week") {
      const next = addDaysKey(cursor, direction * 7);
      setCursor(next);
      setSelectedDay(next);
      return;
    }
    if (view === "month") {
      const next = addMonthsKey(cursor, direction);
      setCursor(next);
      setSelectedDay(next);
      return;
    }
    setCursor(addDaysKey(cursor, direction * 30));
  };

  const goToday = () => {
    setCursor(todayKey);
    setSelectedDay(todayKey);
  };

  const changeCursor = (value: string) => {
    if (!value) return;
    setCursor(value);
    setSelectedDay(value);
  };

  const openCreate = (dateKey = selectedDay, minutes = 9 * 60) => {
    if (!canCreate) {
      pushToast("Votre profil est en lecture seule : création désactivée.", "error");
      return;
    }
    setDetail(null);
    setFormError(null);
    setFormState({
      occurrence: null,
      scope: "series",
      defaultDate: dateKey,
      defaultMinutes: minutes,
    });
  };

  const openEdit = (occurrence: EventOccurrence, scope: EventScope) => {
    setDetail(null);
    setFormError(null);
    setFormState({
      occurrence,
      scope,
      defaultDate: occurrence.occurrenceDate,
      defaultMinutes: parisMinutesOfDay(new Date(occurrence.startAt)),
    });
  };

  const submitForm = async (input: EventInput, scope: EventScope) => {
    if (!formState) return;
    setFormSaving(true);
    setFormError(null);
    const editing = formState.occurrence;
    let success = false;
    if (editing) {
      success = await mutate(
        `/api/events/${editing.eventId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            scope: editing.isRecurring ? scope : "series",
            occurrenceDate: editing.occurrenceDate,
            event: input,
          }),
        },
        editing.isRecurring && scope === "occurrence"
          ? "Occurrence mise à jour"
          : "Événement mis à jour",
      );
    } else {
      success = await mutate(
        "/api/events",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        },
        "Événement créé dans l'agenda commun",
      );
    }
    setFormSaving(false);
    if (success) {
      setFormState(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { occurrence, scope } = deleteTarget;
    const params = new URLSearchParams({
      scope: occurrence.isRecurring ? scope : "series",
      ...(occurrence.occurrenceDate ? { occurrenceDate: occurrence.occurrenceDate } : {}),
    });
    const success = await mutate(
      `/api/events/${occurrence.eventId}?${params.toString()}`,
      { method: "DELETE" },
      occurrence.isRecurring && scope === "occurrence"
        ? "Occurrence supprimée de la série"
        : "Événement supprimé",
    );
    if (success) {
      setDeleteTarget(null);
      setDetail(null);
    }
  };

  const handleStatus = async (
    occurrence: EventOccurrence,
    nextStatus: string,
    scope: EventScope,
  ) => {
    const success = await mutate(
      `/api/events/${occurrence.eventId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "status",
          status: nextStatus,
          scope: occurrence.isRecurring ? scope : "series",
          occurrenceDate: occurrence.occurrenceDate,
        }),
      },
      nextStatus === "termine"
        ? "Événement marqué comme terminé"
        : nextStatus === "annule"
          ? "Événement annulé"
          : "Événement rouvert",
    );
    if (success) setDetail(null);
  };

  const handleDuplicate = async (occurrence: EventOccurrence) => {
    const success = await mutate(
      `/api/events/${occurrence.eventId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "duplicate", occurrenceDate: occurrence.occurrenceDate }),
      },
      "Événement dupliqué (décalé d'un jour)",
    );
    if (success) setDetail(null);
  };

  const handleReschedule = async (
    occurrence: EventOccurrence,
    startAt: string,
    endAt: string,
  ) => {
    if (!occurrence.canEdit) {
      pushToast("Vous n'avez pas les droits pour déplacer cet événement.", "error");
      return;
    }
    await mutate(
      `/api/events/${occurrence.eventId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reschedule",
          scope: occurrence.isRecurring ? "occurrence" : "series",
          occurrenceDate: occurrence.occurrenceDate,
          startAt,
          endAt,
        }),
      },
      occurrence.isRecurring
        ? `Occurrence déplacée au ${formatParisDate(startAt)} ${formatParisTime(startAt)}`
        : `Événement déplacé au ${formatParisDate(startAt)} ${formatParisTime(startAt)}`,
    );
  };

  const occurrenceBank = useMemo(() => {
    const map = new Map<string, EventOccurrence>();
    for (const occurrence of [
      ...(data?.events ?? []),
      ...(data?.upcoming ?? []),
      ...(data?.overdueEvents ?? []),
      ...(data?.nextDeliveries ?? []),
      ...(data?.nextRevisions ?? []),
    ]) {
      map.set(occurrence.occurrenceKey, occurrence);
    }
    return map;
  }, [data]);

  const openReminder = (reminder: AgendaReminder) => {
    const occurrence = occurrenceBank.get(reminder.occurrenceKey);
    setNotificationsOpen(false);
    if (occurrence) {
      setDetail(occurrence);
      return;
    }
    pushToast("Cet événement n'est pas dans la période affichée.", "info");
  };

  const activeFilterCount =
    categories.length + (assignee !== "all" ? 1 : 0) + (statusFilter !== "all" ? 1 : 0) + (scopeFilter !== "all" ? 1 : 0) + (search ? 1 : 0);

  const resetFilters = () => {
    setCategories([]);
    setAssignee("all");
    setStatusFilter("all");
    setScopeFilter("all");
    setSearchInput("");
    setSearch("");
  };

  const periodLabel =
    view === "day"
      ? capitalize(formatKey(cursor, "EEEE d MMMM yyyy"))
      : view === "week"
        ? `Semaine du ${formatKey(startOfWeekKey(cursor), "d MMM")} au ${formatKey(endOfWeekKey(cursor), "d MMMM yyyy")}`
        : view === "month"
          ? capitalize(formatKey(cursor, "MMMM yyyy"))
          : `Échéances · ${formatKey(range.from, "d MMM yyyy")} → ${formatKey(range.to, "d MMM yyyy")}`;

  const events = data?.events ?? [];
  const lateCount =
    data?.overdueEvents.length ??
    events.filter((occurrence) => isLate(occurrence)).length;

  return (
    <div className="px-3 pb-10 pt-3 sm:px-4 lg:px-6">
      <header className="glass grain relative overflow-hidden rounded-2xl px-4 py-3.5">
        <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-alp-green/12 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-black tracking-[0.26em] text-white sm:text-[26px]">
                AGENDA
              </h1>
              <span className="rounded-full border border-alp-green/25 bg-alp-green/10 px-2 py-0.5 text-[9px] font-semibold tracking-[0.16em] text-alp-green-soft uppercase">
                Agenda commun
              </span>
              <span className="hidden rounded-full border border-white/10 px-2 py-0.5 text-[9px] tracking-wide text-alp-muted sm:inline">
                Europe/Paris
              </span>
            </div>
            <p className="mt-1 text-[11.5px] text-alp-muted">
              {capitalize(formatKey(todayKey, "EEEE d MMMM yyyy"))} ·{" "}
              <span className="text-white/80">{data?.stats.today ?? 0}</span> événement(s) aujourd&apos;hui ·{" "}
              <span className={lateCount > 0 ? "text-red-300" : "text-alp-green"}>
                {lateCount} en retard
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-alp-dim" />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Rechercher titre, lieu, collaborateur…"
                className="w-[190px] rounded-lg border border-white/10 bg-black/35 py-1.5 pl-7 pr-7 text-[11.5px] text-white placeholder:text-alp-dim outline-none transition focus:border-alp-green/45 focus:ring-2 focus:ring-alp-green/10 sm:w-[235px]"
                aria-label="Rechercher dans l'agenda"
              />
              {searchInput ? (
                <button
                  onClick={() => setSearchInput("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-alp-dim hover:text-white"
                  aria-label="Effacer la recherche"
                >
                  <X size={12} />
                </button>
              ) : null}
            </div>

            <div className="relative">
              <button
                onClick={() => setNotificationsOpen((value) => !value)}
                className="relative rounded-lg border border-white/10 bg-white/[0.04] p-1.5 text-alp-muted transition hover:text-white"
                aria-label="Rappels in-app"
                title="Rappels in-app"
              >
                <Bell size={15} />
                {(data?.reminders.length ?? 0) > 0 ? (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-alp-green px-1 text-[8.5px] font-bold text-[#04150a]">
                    {data?.reminders.length}
                  </span>
                ) : null}
              </button>
              {notificationsOpen ? (
                <>
                  <button
                    className="fixed inset-0 z-30 cursor-default"
                    onClick={() => setNotificationsOpen(false)}
                    aria-label="Fermer les rappels"
                  />
                  <div className="absolute right-0 z-40 mt-1.5 w-[300px] rounded-xl border border-white/10 bg-[#0d1314] p-2 shadow-2xl animate-rise">
                    <div className="mb-1 flex items-center justify-between px-1">
                      <p className="text-[9.5px] font-semibold tracking-[0.16em] text-alp-muted uppercase">
                        Rappels · 24 h
                      </p>
                      <button
                        onClick={() => setNotificationsOpen(false)}
                        className="text-alp-dim hover:text-white"
                        aria-label="Fermer"
                      >
                        <X size={12} />
                      </button>
                    </div>
                    {(data?.reminders.length ?? 0) === 0 ? (
                      <p className="px-1 py-3 text-[10.5px] text-alp-dim">
                        Aucun rappel programmé dans les prochaines 24 heures.
                      </p>
                    ) : (
                      <ul className="max-h-64 space-y-1 overflow-y-auto scroll-thin">
                        {data?.reminders.map((reminder) => (
                          <li key={reminder.occurrenceKey}>
                            <button
                              onClick={() => openReminder(reminder)}
                              className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-white/8"
                            >
                              <span className={`mt-1 h-1.5 w-1.5 rounded-full ${reminder.due ? "bg-alp-green" : "bg-amber-400"}`} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[11px] text-white">{reminder.title}</span>
                                <span className="block text-[9.5px] text-alp-dim">
                                  {reminder.due ? "Rappel dû" : "Prévu"} ·{" "}
                                  {formatKey(reminder.occurrenceKey.slice(-10), "dd/MM")} à{" "}
                                  {formatParisTime(reminder.startAt)}
                                </span>
                              </span>
                              <CategoryIcon category={reminder.category} size={11} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-1 border-t border-white/8 px-1 pt-1.5 text-[9px] leading-relaxed text-alp-dim">
                      Notifications internes uniquement. Aucun email ni push système n&apos;est envoyé.
                    </p>
                  </div>
                </>
              ) : null}
            </div>

            <button
              onClick={() => setSyncOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-[11px] font-medium text-white/75 transition hover:border-alp-green/30 hover:text-alp-green-soft"
              title="État de la synchronisation HubSpot"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              <span className="hidden sm:inline">Synchroniser</span>
            </button>

            <button
              onClick={() => openCreate(selectedDay, 9 * 60)}
              disabled={!canCreate}
              title={canCreate ? "Créer un événement" : "Profil en lecture seule"}
              className="inline-flex items-center gap-1.5 rounded-lg bg-alp-green px-2.5 py-1.5 text-[11.5px] font-semibold text-[#04150a] shadow-[0_10px_30px_-14px_rgba(62,224,125,0.9)] transition hover:bg-alp-green-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={14} /> Nouvel événement
            </button>
          </div>
        </div>

        <div className="relative mt-3 flex flex-wrap items-center gap-2 border-t border-white/7 pt-2.5">
          <div className="flex items-center gap-1">
            <button
              onClick={() => step(-1)}
              className="rounded-lg border border-white/10 bg-white/[0.03] p-1.5 text-alp-muted transition hover:text-white"
              aria-label="Période précédente"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              onClick={goToday}
              className="rounded-lg border border-white/10 bg-white/[0.05] px-2 py-1 text-[11px] font-medium text-white/85 transition hover:border-alp-green/30 hover:text-alp-green-soft"
            >
              Aujourd&apos;hui
            </button>
            <button
              onClick={() => step(1)}
              className="rounded-lg border border-white/10 bg-white/[0.03] p-1.5 text-alp-muted transition hover:text-white"
              aria-label="Période suivante"
            >
              <ChevronRight size={15} />
            </button>
          </div>

          <input
            type="date"
            value={cursor}
            onChange={(event) => changeCursor(event.target.value)}
            className="rounded-lg border border-white/10 bg-black/35 px-2 py-1 text-[11px] text-white outline-none focus:border-alp-green/45"
            aria-label="Sélecteur de période"
          />

          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-white/85">
            <CalendarDays size={13} className="text-alp-green/80" />
            {periodLabel}
          </span>

          {loading && data ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-alp-muted">
              <Loader2 size={11} className="animate-spin" /> actualisation
            </span>
          ) : null}

          <div className="ml-auto flex items-center gap-1 rounded-lg border border-white/8 bg-black/25 p-0.5">
            {VIEW_MODES.map((mode) => (
              <button
                key={mode.key}
                onClick={() => setView(mode.key)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition ${
                  view === mode.key
                    ? "bg-alp-green/15 text-alp-green-soft shadow-[inset_0_0_0_1px_rgba(62,224,125,0.25)]"
                    : "text-alp-muted hover:text-white"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setFiltersOpen((value) => !value)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition ${
            filtersOpen || activeFilterCount > 0
              ? "border-alp-green/30 bg-alp-green/10 text-alp-green-soft"
              : "border-white/10 bg-white/[0.03] text-white/70 hover:text-white"
          }`}
        >
          <Filter size={12} /> Filtres
          {activeFilterCount > 0 ? (
            <span className="rounded-full bg-alp-green/20 px-1.5 text-[9px]">{activeFilterCount}</span>
          ) : null}
        </button>

        <button
          onClick={() => setCategories([])}
          className={`rounded-lg border px-2 py-1.5 text-[10.5px] transition ${
            categories.length === 0
              ? "border-white/20 bg-white/10 text-white"
              : "border-white/8 text-alp-muted hover:text-white"
          }`}
        >
          Toutes catégories
        </button>
        {EVENT_CATEGORIES.map((category) => {
          const active = categories.includes(category.key);
          const count = events.filter((occurrence) => occurrence.category === category.key).length;
          return (
            <button
              key={category.key}
              onClick={() =>
                setCategories((previous) =>
                  previous.includes(category.key)
                    ? previous.filter((key) => key !== category.key)
                    : [...previous, category.key],
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[10.5px] transition"
              style={{
                color: active ? category.color : "rgba(203,213,214,0.66)",
                borderColor: active ? categoryTint(category.key, 0.5) : "rgba(255,255,255,0.07)",
                background: active ? categoryTint(category.key, 0.14) : "rgba(255,255,255,0.02)",
              }}
              aria-pressed={active}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: categoryColor(category.key) }} />
              {category.label}
              <span className="text-[9px] opacity-60">{count}</span>
              {active ? <Check size={10} /> : null}
            </button>
          );
        })}
        <span className="ml-auto text-[10.5px] text-alp-dim">
          {loading && !data ? "Chargement…" : `${events.length} résultat(s)`}
        </span>
      </div>

      {filtersOpen ? (
        <div className="glass mt-2 grid gap-2 rounded-xl p-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-[9.5px] font-semibold tracking-[0.14em] text-alp-muted uppercase">
            Collaborateur
            <select
              value={assignee}
              onChange={(event) => setAssignee(event.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11.5px] font-normal tracking-normal text-white outline-none focus:border-alp-green/40"
            >
              <option value="all">Toute l&apos;équipe</option>
              {collaborators.map((collaborator) => (
                <option key={collaborator.id} value={collaborator.id}>
                  {collaborator.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[9.5px] font-semibold tracking-[0.14em] text-alp-muted uppercase">
            Statut
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-[11.5px] font-normal tracking-normal text-white outline-none focus:border-alp-green/40"
            >
              <option value="all">Tous les statuts</option>
              <option value="a_venir">À venir</option>
              <option value="en_cours">En cours</option>
              <option value="termine">Terminé</option>
              <option value="annule">Annulé</option>
              <option value="en_retard">En retard</option>
            </select>
          </label>
          <div className="text-[9.5px] font-semibold tracking-[0.14em] text-alp-muted uppercase">
            Périmètre
            <div className="mt-1 flex rounded-lg border border-white/10 bg-black/40 p-0.5">
              {(
                [
                  { key: "all", label: "Toute l'équipe" },
                  { key: "mine", label: "Mes événements" },
                ] as const
              ).map((option) => (
                <button
                  key={option.key}
                  onClick={() => setScopeFilter(option.key)}
                  className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium normal-case tracking-normal transition ${
                    scopeFilter === option.key
                      ? "bg-white/10 text-white"
                      : "text-alp-muted hover:text-white"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-end gap-1.5">
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2 py-1.5 text-[11px] text-white/70 transition hover:text-white"
            >
              <RotateCcw size={11} /> Réinitialiser
            </button>
            <button
              onClick={() => setFiltersOpen(false)}
              className="rounded-lg border border-white/10 px-2 py-1.5 text-[11px] text-alp-muted transition hover:text-white"
            >
              Fermer
            </button>
          </div>
        </div>
      ) : null}

      {activeFilterCount > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-white/7 bg-white/[0.025] px-2.5 py-1.5 text-[10.5px] text-alp-muted">
          <span className="font-medium text-white/70">Filtres actifs :</span>
          {categories.map((key) => {
            const category = EVENT_CATEGORIES.find((item) => item.key === key);
            return category ? <CategoryBadge key={key} category={key} /> : null;
          })}
          {assignee !== "all" ? (
            <span className="rounded-full bg-white/8 px-2 py-0.5">
              {collaborators.find((collaborator) => String(collaborator.id) === assignee)?.name ?? "Collaborateur"}
            </span>
          ) : null}
          {statusFilter !== "all" ? (
            <span className="rounded-full bg-white/8 px-2 py-0.5">
              {statusFilter === "en_retard" ? "En retard" : statusMeta(statusFilter).label}
            </span>
          ) : null}
          {scopeFilter === "mine" ? (
            <span className="rounded-full bg-alp-green/15 px-2 py-0.5 text-alp-green-soft">Mes événements</span>
          ) : null}
          {search ? (
            <span className="rounded-full bg-white/8 px-2 py-0.5">« {search} »</span>
          ) : null}
          <button onClick={resetFilters} className="ml-auto inline-flex items-center gap-1 text-[10px] text-alp-green/90 hover:text-alp-green">
            <X size={10} /> tout effacer
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11.5px] text-red-200">
          <AlertTriangle size={14} />
          <span className="flex-1">{error}</span>
          <button
            onClick={() => refresh()}
            className="rounded-lg border border-red-400/30 px-2 py-1 text-[10.5px] font-medium transition hover:bg-red-500/20"
          >
            Réessayer
          </button>
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_306px]">
        <div className={`min-w-0 transition ${loading && data ? "opacity-70" : ""}`}>
          {loading && !data ? (
            <CalendarSkeleton />
          ) : view === "day" ? (
            <DayView
              dateKey={cursor}
              todayKey={todayKey}
              events={events}
              onOpen={setDetail}
              onCreateAt={openCreate}
              onReschedule={handleReschedule}
            />
          ) : view === "week" ? (
            <WeekView
              anchorKey={cursor}
              todayKey={todayKey}
              events={events}
              onOpen={setDetail}
              onCreateAt={openCreate}
              onReschedule={handleReschedule}
              onSelectDay={(dateKey) => {
                setCursor(dateKey);
                setSelectedDay(dateKey);
                setView("day");
              }}
            />
          ) : view === "month" ? (
            <MonthView
              anchorKey={cursor}
              todayKey={todayKey}
              selectedDay={selectedDay}
              events={events}
              onOpen={setDetail}
              onCreateAt={openCreate}
              onReschedule={handleReschedule}
              onSelectDay={setSelectedDay}
            />
          ) : (
            <ListView
              events={events}
              todayKey={todayKey}
              onOpen={setDetail}
              onCreateAt={openCreate}
              onReschedule={handleReschedule}
            />
          )}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[9.5px] text-alp-dim">
            <span>Fuseau Europe/Paris · glisser-déposer pour reprogrammer</span>
            <span>·</span>
            <span>Les occurrences récurrentes sont gérées par exception de date</span>
            <span>·</span>
            <span>Source des événements : ALP Manager</span>
          </div>
        </div>

        <SidePanel
          data={data}
          loading={loading}
          onOpen={setDetail}
          onCreate={() => openCreate(selectedDay, 9 * 60)}
          onOpenSync={() => setSyncOpen(true)}
          onOpenReminder={openReminder}
        />
      </div>

      <EventDetail
        key={detail?.occurrenceKey ?? "detail-vide"}
        occurrence={detail}
        busy={busy}
        onClose={() => setDetail(null)}
        onEdit={openEdit}
        onDelete={(occurrence, scope) => setDeleteTarget({ occurrence, scope })}
        onDuplicate={handleDuplicate}
        onStatus={handleStatus}
      />

      {formState ? (
      <EventForm
        key={`${formState.occurrence?.occurrenceKey ?? "new"}-${formState.defaultDate}-${formState.defaultMinutes}`}
        open
        occurrence={formState?.occurrence ?? null}
        defaultDate={formState?.defaultDate ?? todayKey}
        defaultMinutes={formState?.defaultMinutes ?? 540}
        collaborators={collaborators}
        currentUser={currentUser}
        saving={formSaving}
        serverError={formError}
        onClose={() => setFormState(null)}
        onSubmit={submitForm}
      />
      ) : null}

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Supprimer l'événement"
        subtitle="Cette action est définitive."
        width="max-w-md"
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setDeleteTarget(null)}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-[11.5px] text-white/75 transition hover:bg-white/8"
            >
              Annuler
            </button>
            <button
              onClick={handleDelete}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-[11.5px] font-semibold text-white transition hover:bg-red-400 disabled:opacity-60"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : null}
              Supprimer définitivement
            </button>
          </div>
        }
      >
        {deleteTarget ? (
          <div className="space-y-2.5">
            <p className="text-[12.5px] font-medium text-white">{deleteTarget.occurrence.title}</p>
            <p className="text-[11.5px] leading-relaxed text-alp-muted">
              {deleteTarget.occurrence.isRecurring
                ? deleteTarget.scope === "occurrence"
                  ? `Seule l'occurrence du ${formatKey(deleteTarget.occurrence.occurrenceDate, "dd/MM/yyyy")} sera supprimée. Le reste de la série est conservé.`
                  : "Toute la série récurrente sera supprimée, y compris les occurrences à venir."
                : "L'événement et ses rappels associés seront supprimés de l'agenda commun."}
            </p>
            <p className="rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-2 text-[10.5px] text-alp-dim">
              {formatKey(deleteTarget.occurrence.occurrenceDate, "EEEE d MMMM yyyy")} ·{" "}
              {deleteTarget.occurrence.allDay ? "Journée entière" : formatParisTime(deleteTarget.occurrence.startAt)}
              {deleteTarget.occurrence.isRecurring
                ? ` · portée : ${deleteTarget.scope === "occurrence" ? "cette occurrence" : "toute la série"}`
                : ""}
            </p>
          </div>
        ) : null}
      </Modal>

      <SyncDialog open={syncOpen} onClose={() => setSyncOpen(false)} />

      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[300px] flex-col gap-1.5">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-3 py-2 text-[11.5px] shadow-2xl animate-rise ${
              toast.tone === "error"
                ? "border-red-500/35 bg-[#2a1113]/95 text-red-100"
                : toast.tone === "info"
                  ? "border-white/15 bg-[#111a1b]/95 text-white/85"
                  : "border-alp-green/30 bg-[#0c1a12]/95 text-alp-green-soft"
            }`}
          >
            {toast.tone === "error" ? (
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            ) : (
              <Check size={13} className="mt-0.5 shrink-0" />
            )}
            <span className="flex-1 leading-relaxed">{toast.message}</span>
            <button
              onClick={() => setToasts((previous) => previous.filter((item) => item.id !== toast.id))}
              className="text-white/50 hover:text-white"
              aria-label="Fermer la notification"
            >
              <X size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
