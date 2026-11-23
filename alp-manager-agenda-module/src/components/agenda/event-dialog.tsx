"use client";

import { Globe2, Loader, Lock, MapPin, Repeat } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Modal } from "@/components/ui/modal";
import {
  CATEGORIES,
  CATEGORY_KEYS,
  PRIORITIES,
  PRIORITY_KEYS,
  STATUSES,
  STATUS_KEYS,
  WEEKDAY_SHORT,
  type CategoryKey,
} from "@/lib/calendar/constants";
import { apiRequest, errorMessage } from "@/lib/calendar/client";
import { buildRule, describeRecurrence, parseRule, type RecurrenceFreq } from "@/lib/calendar/recurrence";
import { dateKey, lastDayKeyOf, pad2, timeOf, toWallClock, todayKey, weekdayIndex } from "@/lib/calendar/time";
import type { CalendarUser, EventDetailDto, EventPriority, EventStatus, EventVisibility } from "@/lib/calendar/types";
import { Avatar, CategoryIcon, tint } from "./bits";

export type EditorTarget =
  | { mode: "create"; dayKey?: string; minutes?: number }
  | { mode: "edit"; eventId: string; occurrenceStart?: string | null };

type Form = {
  title: string;
  description: string;
  category: CategoryKey;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  location: string;
  assignedToId: string;
  participantIds: string[];
  priority: EventPriority;
  status: EventStatus;
  visibility: EventVisibility;
  reminder: string;
  repeat: "none" | RecurrenceFreq;
  interval: number;
  weekdays: number[];
  until: string;
};

const REMINDER_OPTIONS: Array<[string, string]> = [
  ["none", "Aucun rappel"],
  ["15", "15 minutes avant"],
  ["30", "30 minutes avant"],
  ["60", "1 heure avant"],
  ["1440", "1 jour avant"],
];

const REPEAT_OPTIONS: Array<[Form["repeat"], string]> = [
  ["none", "Ne se répète pas"],
  ["DAILY", "Tous les jours"],
  ["WEEKLY", "Toutes les semaines"],
  ["MONTHLY", "Tous les mois"],
];

const INPUT_LABEL = "alp-label mb-1.5 block";

function hm(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function defaultForm(currentUser: CalendarUser, dayKey?: string, minutes?: number): Form {
  const day = dayKey ?? todayKey();
  let startMin: number;
  if (minutes !== undefined) {
    startMin = minutes;
  } else {
    const w = toWallClock(new Date());
    startMin = Math.min(22 * 60, (w.minute > 0 ? w.hour + 1 : w.hour) * 60);
  }
  const endMin = Math.min(startMin + 60, 23 * 60 + 45);
  return {
    title: "",
    description: "",
    category: "commercial",
    allDay: false,
    startDate: day,
    startTime: hm(startMin),
    endDate: day,
    endTime: hm(endMin),
    location: "",
    assignedToId: currentUser.id,
    participantIds: [],
    priority: "normal",
    status: "upcoming",
    visibility: "shared",
    reminder: "30",
    repeat: "none",
    interval: 1,
    weekdays: [weekdayIndex(day)],
    until: "",
  };
}

function formFromDetail(detail: EventDetailDto): Form {
  const e = detail.event;
  const start = new Date(e.startAt);
  const end = new Date(e.endAt);
  const startDate = dateKey(start);
  const rule = e.recurrenceRule ? parseRule(e.recurrenceRule) : null;
  return {
    title: e.title,
    description: e.description ?? "",
    category: e.category,
    allDay: e.allDay,
    startDate,
    startTime: e.allDay ? "09:00" : timeOf(start),
    endDate: e.allDay ? lastDayKeyOf(end) : dateKey(end),
    endTime: e.allDay ? "10:00" : timeOf(end),
    location: e.location ?? "",
    assignedToId: e.assignedTo?.id ?? "",
    participantIds: e.participants.map((p) => p.id),
    priority: e.priority,
    status: e.status,
    visibility: e.visibility,
    reminder: e.reminderMinutes === null ? "none" : String(e.reminderMinutes),
    repeat: rule?.freq ?? "none",
    interval: rule?.interval ?? 1,
    weekdays: rule && rule.weekdays.length > 0 ? rule.weekdays : [weekdayIndex(startDate)],
    until: rule?.until ?? "",
  };
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block min-w-0">
      <span className={INPUT_LABEL}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-zinc-500">{hint}</span>}
    </label>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  target: EditorTarget | null;
  users: CalendarUser[];
  currentUser: CalendarUser;
  onSaved: (eventId: string, message: string) => void;
};

export function EventDialog({ open, onClose, target, users, currentUser, onSaved }: Props) {
  const [form, setForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSeries, setIsSeries] = useState(false);

  useEffect(() => {
    if (!open || !target) return;
    setError(null);
    setSaving(false);

    if (target.mode === "create") {
      setForm(defaultForm(currentUser, target.dayKey, target.minutes));
      setIsSeries(false);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    const query = target.occurrenceStart ? `?occurrenceStart=${encodeURIComponent(target.occurrenceStart)}` : "";
    apiRequest<EventDetailDto>(`/api/calendar/events/${target.eventId}${query}`, { signal: controller.signal })
      .then((detail) => {
        setForm(formFromDetail(detail));
        setIsSeries(detail.event.recurrenceRule !== null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(errorMessage(err));
        setLoading(false);
      });
    return () => controller.abort();
  }, [open, target, currentUser]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  function toggleParticipant(id: string) {
    setForm((prev) => {
      if (!prev) return prev;
      const has = prev.participantIds.includes(id);
      return {
        ...prev,
        participantIds: has ? prev.participantIds.filter((x) => x !== id) : [...prev.participantIds, id],
      };
    });
  }

  function toggleWeekday(index: number) {
    setForm((prev) => {
      if (!prev) return prev;
      const has = prev.weekdays.includes(index);
      const next = has ? prev.weekdays.filter((d) => d !== index) : [...prev.weekdays, index];
      return { ...prev, weekdays: next.sort((a, b) => a - b) };
    });
  }

  function validate(f: Form): string | null {
    if (!f.title.trim()) return "Le titre est obligatoire.";
    if (f.allDay) {
      if (f.endDate < f.startDate) return "La date de fin doit être égale ou postérieure à la date de début.";
    } else if (`${f.endDate}T${f.endTime}` <= `${f.startDate}T${f.startTime}`) {
      return "La fin doit être postérieure au début.";
    }
    if (f.repeat !== "none" && (!Number.isInteger(f.interval) || f.interval < 1 || f.interval > 99)) {
      return "L'intervalle de récurrence doit être compris entre 1 et 99.";
    }
    if (f.repeat !== "none" && f.until && f.until < f.startDate) {
      return "La fin de récurrence doit être postérieure au début.";
    }
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || !target) return;
    const problem = validate(form);
    if (problem) {
      setError(problem);
      return;
    }

    const body = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category,
      allDay: form.allDay,
      startDate: form.startDate,
      startTime: form.allDay ? null : form.startTime,
      endDate: form.endDate,
      endTime: form.allDay ? null : form.endTime,
      location: form.location.trim() || null,
      assignedToId: form.assignedToId || null,
      participantIds: form.participantIds,
      priority: form.priority,
      status: form.status,
      visibility: form.visibility,
      reminderMinutes: form.reminder === "none" ? null : Number(form.reminder),
      recurrence:
        form.repeat === "none"
          ? null
          : {
              freq: form.repeat,
              interval: form.interval,
              weekdays: form.repeat === "WEEKLY" ? form.weekdays : [],
              until: form.until || null,
            },
    };

    setSaving(true);
    setError(null);
    try {
      if (target.mode === "create") {
        const res = await apiRequest<{ id: string }>("/api/calendar/events", { method: "POST", body });
        onSaved(res.id, "Événement créé.");
      } else {
        await apiRequest(`/api/calendar/events/${target.eventId}`, {
          method: "PATCH",
          body: { kind: "update", ...body },
        });
        onSaved(target.eventId, "Événement mis à jour.");
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const isEdit = target?.mode === "edit";
  const title = isEdit ? "Modifier l'événement" : "Nouvel événement";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      description={
        isEdit && isSeries
          ? "Cet événement est récurrent : la modification s'applique à toute la série."
          : "Les champs marqués d'un astérisque sont obligatoires. Heures en fuseau Europe/Paris."
      }
      footer={
        form && (
          <>
            {error && <p className="mr-auto text-sm text-red-300" role="alert">{error}</p>}
            <button type="button" className="alp-btn" onClick={onClose} disabled={saving}>
              Annuler
            </button>
            <button
              type="submit"
              form="event-form"
              className="alp-btn alp-btn-primary min-w-[160px]"
              disabled={saving || loading}
            >
              {saving ? (
                <>
                  <Loader className="h-4 w-4 animate-spin" aria-hidden /> Enregistrement…
                </>
              ) : isEdit ? (
                "Enregistrer les modifications"
              ) : (
                "Créer l'événement"
              )}
            </button>
          </>
        )
      }
    >
      {loading || !form ? (
        <div className="space-y-4" aria-busy="true">
          {error ? (
            <p className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200" role="alert">
              {error}
            </p>
          ) : (
            [0, 1, 2, 3].map((i) => <div key={i} className="alp-skeleton h-12 rounded-2xl" />)
          )}
        </div>
      ) : (
        <form id="event-form" onSubmit={handleSubmit} className="space-y-6">
          {/* Titre */}
          <Field label="Titre *">
            <input
              className="alp-input px-4 py-3 text-base font-medium"
              value={form.title}
              maxLength={160}
              autoFocus
              required
              onChange={(e) => set("title", e.target.value)}
              placeholder="Ex. Relance devis amortisseurs GT3"
            />
          </Field>

          {/* Catégorie */}
          <div>
            <span className={INPUT_LABEL}>Catégorie</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {CATEGORY_KEYS.map((key) => {
                const selected = form.category === key;
                const meta = CATEGORIES[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => set("category", key)}
                    aria-pressed={selected}
                    className="flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-[13px] transition-all duration-200"
                    style={{
                      borderColor: selected ? meta.color : "rgba(255,255,255,0.08)",
                      background: selected ? tint(meta.color, 34) : "rgba(255,255,255,0.03)",
                      color: selected ? "#fff" : "#a1a1aa",
                      boxShadow: selected ? `0 0 0 1px ${tint(meta.color, 90)}` : undefined,
                    }}
                  >
                    <CategoryIcon category={key} className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{meta.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dates */}
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-200">Journée entière</span>
              <button
                type="button"
                role="switch"
                aria-checked={form.allDay}
                onClick={() => set("allDay", !form.allDay)}
                className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${
                  form.allDay ? "bg-alp-green" : "bg-white/15"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                    form.allDay ? "translate-x-[22px]" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Field label="Date de début *">
                  <input type="date" required className="alp-input" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
                </Field>
                {!form.allDay && (
                  <Field label="Heure">
                    <input type="time" className="alp-input w-28" value={form.startTime} onChange={(e) => set("startTime", e.target.value)} />
                  </Field>
                )}
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <Field label={form.allDay ? "Date de fin (incluse) *" : "Date de fin *"}>
                  <input type="date" required className="alp-input" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
                </Field>
                {!form.allDay && (
                  <Field label="Heure">
                    <input type="time" className="alp-input w-28" value={form.endTime} onChange={(e) => set("endTime", e.target.value)} />
                  </Field>
                )}
              </div>
            </div>
          </div>

          {/* Récurrence */}
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-zinc-200">
              <Repeat className="h-4 w-4 text-alp-green" aria-hidden /> Récurrence
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Répéter">
                <select className="alp-input" value={form.repeat} onChange={(e) => set("repeat", e.target.value as Form["repeat"])}>
                  {REPEAT_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              {form.repeat !== "none" && (
                <>
                  <Field label="Intervalle">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-zinc-400">Tous les</span>
                      <input
                        type="number"
                        min={1}
                        max={99}
                        className="alp-input w-20"
                        value={form.interval}
                        onChange={(e) => set("interval", Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
                      />
                      <span className="text-sm text-zinc-400">
                        {form.repeat === "DAILY" ? "jour(s)" : form.repeat === "WEEKLY" ? "semaine(s)" : "mois"}
                      </span>
                    </div>
                  </Field>
                  <Field label="Se termine le (optionnel)">
                    <input type="date" className="alp-input" value={form.until} onChange={(e) => set("until", e.target.value)} />
                  </Field>
                </>
              )}
            </div>
            {form.repeat === "WEEKLY" && (
              <div className="mt-3">
                <span className="mb-1.5 block text-[11px] text-zinc-500">Jours de la semaine</span>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAY_SHORT.map((label, index) => {
                    const on = form.weekdays.includes(index);
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleWeekday(index)}
                        aria-pressed={on}
                        className={`h-8 min-w-[52px] rounded-lg border px-2 text-xs font-medium transition-colors ${
                          on
                            ? "border-alp-green/50 bg-alp-green/15 text-alp-green"
                            : "border-white/10 bg-white/[0.03] text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {form.repeat !== "none" && (
              <p className="mt-3 text-[12px] text-zinc-400">
                {describeRecurrence(
                  buildRule({
                    freq: form.repeat,
                    interval: form.interval,
                    weekdays: form.repeat === "WEEKLY" ? form.weekdays : [],
                    until: form.until || null,
                  }),
                )}
              </p>
            )}
          </div>

          {/* Responsable et participants */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Collaborateur responsable">
              <div className="flex items-center gap-2">
                <Avatar user={users.find((u) => u.id === form.assignedToId) ?? null} size="md" />
                <select className="alp-input" value={form.assignedToId} onChange={(e) => set("assignedToId", e.target.value)}>
                  <option value="">Non assigné</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                    </option>
                  ))}
                </select>
              </div>
            </Field>
            <div>
              <span className={INPUT_LABEL}>Participants</span>
              <div className="flex flex-wrap gap-1.5">
                {users.map((u) => {
                  const on = form.participantIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleParticipant(u.id)}
                      aria-pressed={on}
                      className={`flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-xs transition-colors ${
                        on ? "border-alp-green/50 bg-alp-green/10 text-white" : "border-white/10 text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      <Avatar user={u} size="xs" />
                      {u.fullName.split(" ")[0]}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Priorité, statut, visibilité, rappel */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className={INPUT_LABEL}>Priorité</span>
              <div className="grid grid-cols-4 gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
                {PRIORITY_KEYS.map((key) => {
                  const on = form.priority === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => set("priority", key)}
                      aria-pressed={on}
                      className={`rounded-lg px-1 py-1.5 text-[12px] font-medium transition-colors ${
                        on ? "text-alp-ink" : "text-zinc-400 hover:text-zinc-100"
                      }`}
                      style={on ? { background: PRIORITIES[key].color } : undefined}
                    >
                      {PRIORITIES[key].label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <span className={INPUT_LABEL}>Visibilité</span>
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
                {(["shared", "private"] as const).map((key) => {
                  const on = form.visibility === key;
                  const Icon = key === "private" ? Lock : Globe2;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => set("visibility", key)}
                      aria-pressed={on}
                      className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium transition-colors ${
                        on ? "bg-white/10 text-white" : "text-zinc-400 hover:text-zinc-100"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden />
                      {key === "private" ? "Privé" : "Partagé"}
                    </button>
                  );
                })}
              </div>
            </div>
            <Field label="Statut">
              <select className="alp-input" value={form.status} onChange={(e) => set("status", e.target.value as EventStatus)}>
                {STATUS_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {STATUSES[key].label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Rappel">
              <select className="alp-input" value={form.reminder} onChange={(e) => set("reminder", e.target.value)}>
                {REMINDER_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* Lieu */}
          <Field label="Lieu">
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
              <input
                className="alp-input pl-9"
                value={form.location}
                maxLength={200}
                onChange={(e) => set("location", e.target.value)}
                placeholder="Atelier, salle de réunion, adresse client…"
              />
            </div>
          </Field>

          <Field label="Description">
            <textarea
              className="alp-input min-h-[96px] resize-y"
              value={form.description}
              maxLength={5000}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Contexte, référence du dossier, éléments à préparer…"
            />
          </Field>

          {error && (
            <p className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
              {error}
            </p>
          )}
        </form>
      )}
    </Modal>
  );
}
