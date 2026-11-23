"use client";

import { SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ToastViewport, type ToastItem } from "@/components/ui/toaster";
import { CATEGORY_KEYS, type CategoryKey } from "@/lib/calendar/constants";
import { apiRequest, errorMessage, type DragPayload } from "@/lib/calendar/client";
import { concernsUser } from "@/lib/calendar/permissions";
import type {
  AgendaItemDto,
  AgendaSummaryDto,
  CalendarRangeDto,
  CalendarUser,
  ReminderDto,
  ViewOccurrence,
} from "@/lib/calendar/types";
import {
  PARIS_TZ,
  addDays,
  addMonths,
  dateKey,
  daysForView,
  diffDays,
  formatDayLong,
  formatDayShort,
  formatMonthTitle,
  instantFromKey,
  minutesOfDay,
  parseDateKey,
  rangeForView,
  startOfWeekKey,
  timeOf,
  todayKey,
  toWallClock,
  type ViewMode,
} from "@/lib/calendar/time";
import { AgendaFilters } from "./agenda-filters";
import { AgendaPanel } from "./agenda-panel";
import { AgendaToolbar } from "./agenda-toolbar";
import { EventDetailModal, type DetailTarget } from "./event-detail";
import { EventDialog, type EditorTarget } from "./event-dialog";
import { ListView } from "./list-view";
import { MonthView } from "./month-view";
import { SyncDialog } from "./sync-dialog";
import { TimeGrid, type MoveTarget } from "./time-grid";

type Props = {
  currentUser: CalendarUser;
  users: CalendarUser[];
};

const VIEW_STORAGE_KEY = "alp-agenda:view";
const REMINDER_STORAGE_KEY = "alp-agenda:reminders-seen";
const VIEWS: ViewMode[] = ["day", "week", "month", "list"];

const monthNameFormatter = new Intl.DateTimeFormat("fr-FR", { timeZone: PARIS_TZ, month: "long" });

function weekLabel(start: string, end: string): string {
  const s = parseDateKey(start);
  const e = parseDateKey(end);
  const endMonth = monthNameFormatter.format(instantFromKey(end, 12));
  if (s.month === e.month) return `${s.day} – ${e.day} ${endMonth} ${e.year}`;
  const startMonth = monthNameFormatter.format(instantFromKey(start, 12));
  return `${s.day} ${startMonth} – ${e.day} ${endMonth} ${e.year}`;
}

function periodLabel(view: ViewMode, anchor: string): string {
  if (view === "day") return formatDayLong(anchor);
  if (view === "week") {
    const start = startOfWeekKey(anchor);
    return weekLabel(start, addDays(start, 6));
  }
  if (view === "month") return formatMonthTitle(anchor);
  return `À venir · ${formatDayShort(anchor)} → ${formatDayShort(addDays(anchor, 59))}`;
}

function readSeenReminders(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(REMINDER_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const cutoff = Date.now() - 3 * 86_400_000;
    return Object.fromEntries(Object.entries(parsed).filter(([, shownAt]) => typeof shownAt === "number" && shownAt > cutoff));
  } catch {
    return {};
  }
}

function writeSeenReminders(seen: Record<string, number>): void {
  try {
    window.localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(seen));
  } catch {
    /* stockage indisponible : le rappel pourra être réaffiché */
  }
}

function occurrenceStartOf(key: string): string {
  return key.slice(key.indexOf("|") + 1);
}

function CalendarSkeleton({ view }: { view: ViewMode }) {
  if (view === "month") {
    return (
      <div className="alp-glass rounded-3xl p-4">
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 35 }, (_, i) => (
            <div key={i} className="alp-skeleton h-20 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }
  if (view === "list") {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="alp-skeleton h-20 rounded-2xl" />
        ))}
      </div>
    );
  }
  return (
    <div className="alp-glass rounded-3xl p-4">
      <div className="alp-skeleton h-[560px] rounded-2xl" />
    </div>
  );
}

export function CalendarApp({ currentUser, users }: Props) {
  const [view, setView] = useState<ViewMode>("week");
  const [anchor, setAnchor] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  const [data, setData] = useState<CalendarRangeDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [summary, setSummary] = useState<AgendaSummaryDto | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [enabledCategories, setEnabledCategories] = useState<Set<CategoryKey>>(() => new Set(CATEGORY_KEYS));
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const [detailTarget, setDetailTarget] = useState<DetailTarget | null>(null);
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  /* ------------------------------------------------------------ */
  /* Initialisation (client uniquement pour éviter les écarts SSR) */
  /* ------------------------------------------------------------ */
  useEffect(() => {
    setAnchor(todayKey());
    setSelectedDay(todayKey());
    setNow(new Date());
    try {
      const saved = window.localStorage.getItem(VIEW_STORAGE_KEY) as ViewMode | null;
      if (saved && VIEWS.includes(saved)) setView(saved);
    } catch {
      /* ignore */
    }
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const changeView = useCallback((next: ViewMode) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  /* ------------------------------------------------------------ */
  /* Notifications                                                */
  /* ------------------------------------------------------------ */
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast: Omit<ToastItem, "id">) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
      if (toast.tone !== "reminder") {
        window.setTimeout(() => dismissToast(id), 5200);
      }
    },
    [dismissToast],
  );

  const refresh = useCallback(() => setReloadToken((t) => t + 1), []);

  /* Rappels in-app : interrogation périodique, chaque occurrence n'est affichée qu'une fois par navigateur. */
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const { reminders } = await apiRequest<{ reminders: ReminderDto[] }>("/api/calendar/reminders");
        if (cancelled || reminders.length === 0) return;
        const seen = readSeenReminders();
        let changed = false;
        for (const r of reminders) {
          if (seen[r.key]) continue;
          seen[r.key] = Date.now();
          changed = true;
          const eventId = r.eventId;
          const occStart = occurrenceStartOf(r.key);
          pushToast({
            tone: "reminder",
            title: `Rappel · ${r.title}`,
            message: `Début à ${timeOf(new Date(r.start))}${r.location ? ` · ${r.location}` : ""}`,
            actionLabel: "Ouvrir",
            onAction: () => setDetailTarget({ eventId, occurrenceStart: occStart }),
          });
        }
        if (changed) writeSeenReminders(seen);
      } catch {
        /* les rappels seront retentés au prochain cycle */
      }
    };
    poll();
    const timer = window.setInterval(poll, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pushToast]);

  /* ------------------------------------------------------------ */
  /* Chargement des données                                       */
  /* ------------------------------------------------------------ */
  const range = useMemo(() => (anchor ? rangeForView(view, anchor) : null), [view, anchor]);
  const fromIso = range ? instantFromKey(range.fromKey).toISOString() : null;
  const toIso = range ? instantFromKey(range.toKey).toISOString() : null;

  useEffect(() => {
    if (!fromIso || !toIso) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    apiRequest<CalendarRangeDto>(
      `/api/calendar/events?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`,
      { signal: controller.signal },
    )
      .then((res) => setData(res))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(errorMessage(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [fromIso, toIso, reloadToken]);

  useEffect(() => {
    const controller = new AbortController();
    setSummaryLoading(true);
    setSummaryError(null);
    apiRequest<AgendaSummaryDto>("/api/calendar/summary", { signal: controller.signal })
      .then((res) => setSummary(res))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setSummaryError(errorMessage(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setSummaryLoading(false);
      });
    return () => controller.abort();
  }, [reloadToken]);

  /* ------------------------------------------------------------ */
  /* Dérivés : occurrences enrichies, filtres, compteurs          */
  /* ------------------------------------------------------------ */
  const allOccurrences: ViewOccurrence[] = useMemo(() => {
    if (!data) return [];
    const byId = new Map(data.events.map((e) => [e.id, e]));
    const out: ViewOccurrence[] = [];
    for (const o of data.occurrences) {
      const event = byId.get(o.eventId);
      if (event) out.push({ ...o, event });
    }
    return out;
  }, [data]);

  const categoryCounts = useMemo(() => {
    const counts = Object.fromEntries(CATEGORY_KEYS.map((k) => [k, 0])) as Record<CategoryKey, number>;
    for (const o of allOccurrences) {
      if (o.status !== "cancelled") counts[o.event.category] += 1;
    }
    return counts;
  }, [allOccurrences]);

  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    return allOccurrences.filter((o) => {
      const e = o.event;
      if (!enabledCategories.has(e.category)) return false;
      if (
        selectedUserId &&
        !concernsUser(selectedUserId, {
          createdById: e.createdBy?.id ?? null,
          assignedToId: e.assignedTo?.id ?? null,
          participantIds: e.participants.map((p) => p.id),
        })
      ) {
        return false;
      }
      if (tokens.length > 0) {
        const haystack = [
          e.title,
          e.description ?? "",
          e.location ?? "",
          e.assignedTo?.fullName ?? "",
          e.createdBy?.fullName ?? "",
          ...e.participants.map((p) => p.fullName),
        ]
          .join(" ")
          .toLowerCase();
        if (!tokens.every((t) => haystack.includes(t))) return false;
      }
      return true;
    });
  }, [allOccurrences, enabledCategories, selectedUserId, normalizedQuery]);

  const filtersActive = enabledCategories.size < CATEGORY_KEYS.length || selectedUserId !== null || query.trim() !== "";

  const today = dateKey(now ?? new Date(0));
  const nowMinutes = now ? minutesOfDay(now) : 0;
  const days = anchor && (view === "day" || view === "week") ? daysForView(view, anchor) : [];
  const todayLabel = now ? formatDayLong(today) : "";

  /* ------------------------------------------------------------ */
  /* Navigation                                                   */
  /* ------------------------------------------------------------ */
  const shift = useCallback(
    (dir: 1 | -1) => {
      setAnchor((a) => {
        if (!a) return a;
        if (view === "day") return addDays(a, dir);
        if (view === "week") return addDays(a, 7 * dir);
        if (view === "month") return addMonths(a, dir);
        return addDays(a, 30 * dir);
      });
    },
    [view],
  );

  const goToday = useCallback(() => {
    const t = todayKey();
    setAnchor(t);
    setSelectedDay(t);
  }, []);

  const openDay = useCallback(
    (key: string) => {
      setAnchor(key);
      setSelectedDay(key);
      changeView("day");
    },
    [changeView],
  );

  /* ------------------------------------------------------------ */
  /* Actions : détail, édition, création, déplacement             */
  /* ------------------------------------------------------------ */
  const openDetail = useCallback((occ: ViewOccurrence) => {
    setDetailTarget({ eventId: occ.eventId, occurrenceStart: occ.occurrenceStart });
  }, []);

  const openDetailFromItem = useCallback((item: AgendaItemDto) => {
    setDetailTarget({ eventId: item.eventId, occurrenceStart: occurrenceStartOf(item.key) });
  }, []);

  const openCreate = useCallback((dayKey?: string, minutes?: number) => {
    setEditorTarget({ mode: "create", dayKey, minutes });
  }, []);

  const openEdit = useCallback((eventId: string, occurrenceStart: string | null) => {
    setDetailTarget(null);
    setEditorTarget({ mode: "edit", eventId, occurrenceStart });
  }, []);

  const handleSaved = useCallback(
    (_eventId: string, message: string) => {
      setEditorTarget(null);
      pushToast({ tone: "success", title: message });
      refresh();
    },
    [pushToast, refresh],
  );

  const handleDetailChanged = useCallback(
    (message: string) => {
      pushToast({ tone: "success", title: message });
      refresh();
    },
    [pushToast, refresh],
  );

  const handleDuplicated = useCallback(
    (newEventId: string) => {
      setDetailTarget(null);
      pushToast({ tone: "success", title: "Événement dupliqué", message: "La copie est ouverte pour modification." });
      refresh();
      setEditorTarget({ mode: "edit", eventId: newEventId, occurrenceStart: null });
    },
    [pushToast, refresh],
  );

  const handleMove = useCallback(
    async (payload: DragPayload, target: MoveTarget) => {
      if (!payload.canEdit) {
        pushToast({ tone: "error", title: "Déplacement impossible", message: "Vous n'avez pas les droits sur cet événement." });
        return;
      }

      const start = new Date(payload.start);
      const end = new Date(payload.end);
      const durationMs = end.getTime() - start.getTime();
      let nextStart: Date;
      let nextEnd: Date;

      if (target.kind === "slot" && !payload.allDay) {
        nextStart = instantFromKey(target.dayKey, Math.floor(target.minutes / 60), target.minutes % 60);
        nextEnd = new Date(nextStart.getTime() + durationMs);
      } else if (payload.allDay) {
        const span = Math.max(1, diffDays(dateKey(start), dateKey(end)));
        nextStart = instantFromKey(target.dayKey);
        nextEnd = instantFromKey(addDays(target.dayKey, span));
      } else {
        const w = toWallClock(start);
        nextStart = instantFromKey(target.dayKey, w.hour, w.minute);
        nextEnd = new Date(nextStart.getTime() + durationMs);
      }

      if (nextStart.getTime() === start.getTime()) return;

      try {
        await apiRequest(`/api/calendar/events/${payload.eventId}`, {
          method: "PATCH",
          body: {
            kind: "reschedule",
            occurrenceStart: payload.occurrenceStart,
            startAt: nextStart.toISOString(),
            endAt: nextEnd.toISOString(),
            applyToSeries: false,
          },
        });
        pushToast({
          tone: "success",
          title: "Événement reprogrammé",
          message: `${payload.title} · ${formatDayShort(dateKey(nextStart))}${payload.allDay ? "" : ` à ${timeOf(nextStart)}`}`,
        });
        refresh();
      } catch (err) {
        pushToast({ tone: "error", title: "Reprogrammation impossible", message: errorMessage(err) });
        refresh();
      }
    },
    [pushToast, refresh],
  );

  const toggleCategory = useCallback((key: CategoryKey) => {
    setEnabledCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const setAllCategories = useCallback((enabled: boolean) => {
    setEnabledCategories(new Set(enabled ? CATEGORY_KEYS : []));
  }, []);

  const resetFilters = useCallback(() => {
    setEnabledCategories(new Set(CATEGORY_KEYS));
    setSelectedUserId(null);
    setQuery("");
  }, []);

  const label = anchor ? periodLabel(view, anchor) : "";
  const showSkeleton = !data && !loadError;

  return (
    <div className="mx-auto w-full max-w-[1680px] px-3 pb-24 pt-5 sm:px-6">
      <AgendaToolbar
        view={view}
        onViewChange={changeView}
        periodLabel={label}
        todayLabel={todayLabel}
        loading={loading && data !== null}
        onPrev={() => shift(-1)}
        onNext={() => shift(1)}
        onToday={goToday}
        onNew={() => openCreate()}
        onSync={() => setSyncOpen(true)}
      />

      {loadError && (
        <div
          role="alert"
          className="alp-rise mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200"
        >
          <span>Impossible de charger le calendrier : {loadError}</span>
          <button type="button" onClick={refresh} className="alp-btn h-8 px-3 text-xs">
            Réessayer
          </button>
        </div>
      )}

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[268px_minmax(0,1fr)_330px]">
        <div className="lg:sticky lg:top-24">
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
            className="alp-btn mb-3 w-full lg:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            Filtres et recherche
            {filtersActive && <span className="rounded-full bg-alp-green/20 px-2 text-[11px] text-alp-green">actifs</span>}
          </button>
          <div className={`${filtersOpen ? "block" : "hidden"} lg:block`}>
            <AgendaFilters
              categoryCounts={categoryCounts}
              enabledCategories={enabledCategories}
              onToggleCategory={toggleCategory}
              onSetAllCategories={setAllCategories}
              users={users}
              currentUserId={currentUser.id}
              selectedUserId={selectedUserId}
              onSelectUser={setSelectedUserId}
              query={query}
              onQueryChange={setQuery}
              filtersActive={filtersActive}
              onReset={resetFilters}
            />
          </div>
        </div>

        <section className="min-w-0 space-y-3" aria-label="Calendrier">
          {showSkeleton || !anchor ? (
            <CalendarSkeleton view={view} />
          ) : data ? (
            <>
              {view === "day" || view === "week" ? (
                <TimeGrid
                  days={days}
                  items={filtered}
                  todayKey={today}
                  nowMinutes={nowMinutes}
                  onOpen={openDetail}
                  onMove={handleMove}
                  onCreateAt={(dayKey, minutes) => openCreate(dayKey, minutes)}
                  onOpenDay={openDay}
                />
              ) : view === "month" ? (
                <MonthView
                  anchorKey={anchor}
                  items={filtered}
                  todayKey={today}
                  selectedKey={selectedDay}
                  onSelectDay={setSelectedDay}
                  onOpen={openDetail}
                  onMove={(payload, dayKey) => handleMove(payload, { kind: "day", dayKey })}
                  onOpenDay={openDay}
                  onCreateOnDay={(dayKey) => openCreate(dayKey, 9 * 60)}
                />
              ) : (
                <ListView items={filtered} todayKey={today} onOpen={openDetail} />
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[12px] text-zinc-500">
                <span>
                  {filtered.length} événement{filtered.length > 1 ? "s" : ""} affiché{filtered.length > 1 ? "s" : ""}
                  {filtered.length !== allOccurrences.length && ` sur ${allOccurrences.length}`} sur la période
                </span>
                {filtered.length === 0 && allOccurrences.length > 0 && (
                  <button type="button" onClick={resetFilters} className="text-alp-green hover:underline">
                    Réinitialiser les filtres
                  </button>
                )}
              </div>
            </>
          ) : null}
        </section>

        <div className="lg:col-span-2 xl:col-span-1 xl:sticky xl:top-24">
          <AgendaPanel
            summary={summary}
            loading={summaryLoading}
            error={summaryError}
            onOpen={openDetailFromItem}
            onRetry={refresh}
          />
        </div>
      </div>

      <EventDetailModal
        target={detailTarget}
        onClose={() => setDetailTarget(null)}
        onEdit={openEdit}
        onChanged={handleDetailChanged}
        onDuplicated={handleDuplicated}
      />
      <EventDialog
        open={editorTarget !== null}
        onClose={() => setEditorTarget(null)}
        target={editorTarget}
        users={users}
        currentUser={currentUser}
        onSaved={handleSaved}
      />
      <SyncDialog open={syncOpen} onClose={() => setSyncOpen(false)} />
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
