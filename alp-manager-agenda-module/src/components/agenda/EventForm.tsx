"use client";

import { useState } from "react";
import { CalendarPlus, Loader2, Repeat, Save, Users } from "lucide-react";

import { Modal } from "@/components/ui/Modal";
import { Avatar } from "@/components/ui/Avatar";
import {
  EVENT_CATEGORIES,
  PRIORITIES,
  REMINDER_OPTIONS,
  STATUSES,
  categoryColor,
  categoryTint,
} from "@/lib/agenda-config";
import type { AgendaUser, EventOccurrence } from "@/lib/agenda-types";
import type { EventInput } from "@/lib/agenda-schema";
import { DAY_LABELS } from "@/lib/agenda-config";
import { parseRecurrence } from "@/lib/recurrence";
import { formatParisTime, parisDateKey, weekdayIndex } from "@/lib/time";

type FormState = {
  title: string;
  description: string;
  category: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  allDay: boolean;
  location: string;
  assignedTo: number | null;
  participantIds: number[];
  priority: string;
  status: string;
  visibility: string;
  reminder: number;
  recurrenceFreq: "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";
  recurrenceInterval: number;
  recurrenceByDay: number[];
  recurrenceUntil: string;
  customRecurrence: boolean;
};

const inputClass =
  "w-full rounded-lg border border-white/10 bg-black/35 px-2.5 py-1.5 text-[12.5px] text-white placeholder:text-alp-dim outline-none transition focus:border-alp-green/50 focus:ring-2 focus:ring-alp-green/10";
const labelClass =
  "mb-1 block text-[9.5px] font-semibold tracking-[0.16em] text-alp-muted uppercase";

function minutesToTime(minutes: number): string {
  const clamped = Math.min(Math.max(minutes, 0), 23 * 60 + 59);
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 9 * 60;
  return hours * 60 + minutes;
}

function buildInitialState(
  occurrence: EventOccurrence | null,
  defaultDate: string,
  defaultMinutes: number,
  currentUser: AgendaUser,
): FormState {
  if (occurrence) {
    const start = new Date(occurrence.startAt);
    const end = new Date(occurrence.endAt);
    const spec = parseRecurrence(occurrence.recurrenceRule);
    return {
      title: occurrence.title,
      description: occurrence.description ?? "",
      category: occurrence.category,
      startDate: parisDateKey(start),
      startTime: formatParisTime(start),
      endDate: parisDateKey(end),
      endTime: formatParisTime(end),
      allDay: occurrence.allDay,
      location: occurrence.location ?? "",
      assignedTo: occurrence.assignedTo?.id ?? currentUser.id,
      participantIds: occurrence.participants.map((participant) => participant.id),
      priority: occurrence.priority,
      status: occurrence.status,
      visibility: occurrence.visibility,
      reminder: occurrence.reminder,
      recurrenceFreq: spec?.freq ?? "NONE",
      recurrenceInterval: spec?.interval ?? 1,
      recurrenceByDay: spec?.byDay ?? [],
      recurrenceUntil: spec?.until ?? "",
      customRecurrence: (spec?.interval ?? 1) > 1 || (spec?.byDay?.length ?? 0) > 0,
    };
  }
  return {
    title: "",
    description: "",
    category: "rendez_vous",
    startDate: defaultDate,
    startTime: minutesToTime(defaultMinutes),
    endDate: defaultDate,
    endTime: minutesToTime(defaultMinutes + 60),
    allDay: false,
    location: "",
    assignedTo: currentUser.id,
    participantIds: [],
    priority: "normale",
    status: "a_venir",
    visibility: "partage",
    reminder: 30,
    recurrenceFreq: "NONE",
    recurrenceInterval: 1,
    recurrenceByDay: [],
    recurrenceUntil: "",
    customRecurrence: false,
  };
}

export function EventForm({
  open,
  occurrence,
  defaultDate,
  defaultMinutes,
  collaborators,
  currentUser,
  saving,
  serverError,
  onClose,
  onSubmit,
}: {
  open: boolean;
  occurrence: EventOccurrence | null;
  defaultDate: string;
  defaultMinutes: number;
  collaborators: AgendaUser[];
  currentUser: AgendaUser;
  saving: boolean;
  serverError: string | null;
  onClose: () => void;
  onSubmit: (input: EventInput, scope: "series" | "occurrence") => void;
}) {
  const [form, setForm] = useState<FormState>(() =>
    buildInitialState(occurrence, defaultDate, defaultMinutes, currentUser),
  );
  const [scope, setScope] = useState<"series" | "occurrence">(
    occurrence?.isRecurring ? "occurrence" : "series",
  );
  const [localError, setLocalError] = useState<string | null>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const toggleDay = (day: number) => {
    setForm((previous) => ({
      ...previous,
      customRecurrence: true,
      recurrenceByDay: previous.recurrenceByDay.includes(day)
        ? previous.recurrenceByDay.filter((value) => value !== day)
        : [...previous.recurrenceByDay, day].sort(),
    }));
  };

  const handleFreqChange = (freq: FormState["recurrenceFreq"]) => {
    setForm((previous) => ({
      ...previous,
      recurrenceFreq: freq,
      recurrenceByDay:
        freq === "WEEKLY"
          ? previous.recurrenceByDay.length > 0
            ? previous.recurrenceByDay
            : [weekdayIndex(previous.startDate)]
          : [],
      customRecurrence: false,
      recurrenceInterval: 1,
    }));
  };

  const submit = () => {
    setLocalError(null);
    if (form.title.trim().length < 2) {
      setLocalError("Le titre de l'événement est obligatoire (2 caractères minimum).");
      return;
    }
    if (form.endDate < form.startDate) {
      setLocalError("La date de fin ne peut pas précéder la date de début.");
      return;
    }
    if (
      !form.allDay &&
      form.endDate === form.startDate &&
      timeToMinutes(form.endTime) <= timeToMinutes(form.startTime)
    ) {
      setLocalError("L'heure de fin doit être postérieure à l'heure de début.");
      return;
    }
    if (
      form.recurrenceFreq === "WEEKLY" &&
      form.customRecurrence &&
      form.recurrenceByDay.length === 0
    ) {
      setLocalError("Sélectionnez au moins un jour pour la récurrence hebdomadaire.");
      return;
    }

    const payload: EventInput = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category,
      startDate: form.startDate,
      startTime: form.startTime,
      endDate: form.endDate,
      endTime: form.endTime,
      allDay: form.allDay,
      location: form.location.trim() || null,
      assignedTo: form.assignedTo,
      participantIds: form.participantIds,
      priority: form.priority as EventInput["priority"],
      status: form.status as EventInput["status"],
      visibility: form.visibility as EventInput["visibility"],
      reminder: form.reminder,
      recurrence:
        form.recurrenceFreq === "NONE"
          ? null
          : {
              freq: form.recurrenceFreq,
              interval: form.recurrenceInterval,
              byDay: form.recurrenceFreq === "WEEKLY" ? form.recurrenceByDay : [],
              until: form.recurrenceUntil || null,
              count: null,
            },
    };
    onSubmit(payload, scope);
  };

  const isEdit = Boolean(occurrence);
  const error = localError ?? serverError;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Modifier l'événement" : "Nouvel événement"}
      subtitle={
        isEdit
          ? "Les champs modifiés sont enregistrés dans l'agenda commun ALP."
          : "Créez un événement partagé avec l'équipe ALP Racing."
      }
      width="max-w-3xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[10px] text-alp-dim">
            Heure locale Europe/Paris · les rappels restent internes à ALP Manager.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-white/75 transition hover:bg-white/8"
            >
              Annuler
            </button>
            <button
              type="submit"
              form="alp-event-form"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-alp-green px-3.5 py-1.5 text-[12px] font-semibold text-[#05150a] transition hover:bg-alp-green-soft disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : isEdit ? (
                <Save size={14} />
              ) : (
                <CalendarPlus size={14} />
              )}
              {saving ? "Enregistrement…" : isEdit ? "Enregistrer" : "Créer l'événement"}
            </button>
          </div>
        </div>
      }
    >
      <form
        id="alp-event-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="space-y-4"
      >
        {error ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11.5px] text-red-200">
            {error}
          </div>
        ) : null}

        {occurrence?.isRecurring ? (
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
            <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] text-alp-muted uppercase">
              <Repeat size={12} /> Événement récurrent
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  { key: "occurrence", label: "Cette occurrence uniquement" },
                  { key: "series", label: "Toute la série" },
                ] as const
              ).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setScope(option.key)}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] transition ${
                    scope === option.key
                      ? "border-alp-green/40 bg-alp-green/15 text-alp-green-soft"
                      : "border-white/10 text-alp-muted hover:text-white"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <label className={labelClass} htmlFor="event-title">
            Titre de l&apos;événement
          </label>
          <input
            id="event-title"
            autoFocus
            value={form.title}
            onChange={(event) => update("title", event.target.value)}
            placeholder="Ex. Relance devis Enduro, révision amortisseurs…"
            className={`${inputClass} text-[14px] font-medium`}
            maxLength={180}
          />
        </div>

        <div>
          <label className={labelClass} htmlFor="event-description">
            Description
          </label>
          <textarea
            id="event-description"
            value={form.description}
            onChange={(event) => update("description", event.target.value)}
            rows={2}
            placeholder="Contexte, références, informations utiles pour l'équipe…"
            className={`${inputClass} resize-y leading-relaxed`}
          />
        </div>

        <div>
          <span className={labelClass}>Catégorie</span>
          <div className="flex flex-wrap gap-1.5">
            {EVENT_CATEGORIES.map((category) => {
              const active = form.category === category.key;
              return (
                <button
                  key={category.key}
                  type="button"
                  onClick={() => update("category", category.key)}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition"
                  style={{
                    color: active ? category.color : "rgba(203,213,214,0.75)",
                    borderColor: active ? categoryTint(category.key, 0.6) : "rgba(255,255,255,0.1)",
                    background: active ? categoryTint(category.key, 0.16) : "transparent",
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: categoryColor(category.key) }}
                  />
                  {category.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold tracking-[0.16em] text-alp-muted uppercase">
              Période
            </span>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-white/75">
              <input
                type="checkbox"
                checked={form.allDay}
                onChange={(event) => update("allDay", event.target.checked)}
                className="h-3.5 w-3.5 accent-[#3ee07d]"
              />
              Journée entière
            </label>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="start-date">
                Date de début
              </label>
              <input
                id="start-date"
                type="date"
                value={form.startDate}
                onChange={(event) => {
                  const value = event.target.value;
                  setForm((previous) => ({
                    ...previous,
                    startDate: value,
                    endDate: previous.endDate < value ? value : previous.endDate,
                  }));
                }}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="start-time">
                Heure de début
              </label>
              <input
                id="start-time"
                type="time"
                value={form.startTime}
                onChange={(event) => update("startTime", event.target.value)}
                disabled={form.allDay}
                className={`${inputClass} disabled:opacity-40`}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="end-date">
                Date de fin
              </label>
              <input
                id="end-date"
                type="date"
                value={form.endDate}
                min={form.startDate}
                onChange={(event) => update("endDate", event.target.value)}
                className={inputClass}
                required
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="end-time">
                Heure de fin
              </label>
              <input
                id="end-time"
                type="time"
                value={form.endTime}
                onChange={(event) => update("endTime", event.target.value)}
                disabled={form.allDay}
                className={`${inputClass} disabled:opacity-40`}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2">
          <div>
            <label className={labelClass} htmlFor="assigned-to">
              Collaborateur responsable
            </label>
            <select
              id="assigned-to"
              value={form.assignedTo ?? ""}
              onChange={(event) =>
                update("assignedTo", event.target.value ? Number(event.target.value) : null)
              }
              className={inputClass}
            >
              <option value="">Non attribué</option>
              {collaborators.map((collaborator) => (
                <option key={collaborator.id} value={collaborator.id}>
                  {collaborator.name} — {collaborator.jobTitle ?? collaborator.role}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="event-location">
              Lieu
            </label>
            <input
              id="event-location"
              value={form.location}
              onChange={(event) => update("location", event.target.value)}
              placeholder="Atelier ALP, visio, client…"
              className={inputClass}
              maxLength={220}
            />
          </div>
        </div>

        <div>
          <span className={`${labelClass} flex items-center gap-1.5`}>
            <Users size={11} /> Participants
          </span>
          <div className="flex flex-wrap gap-1.5">
            {collaborators
              .filter((collaborator) => collaborator.id !== form.assignedTo)
              .map((collaborator) => {
                const active = form.participantIds.includes(collaborator.id);
                return (
                  <button
                    key={collaborator.id}
                    type="button"
                    onClick={() =>
                      update(
                        "participantIds",
                        active
                          ? form.participantIds.filter((id) => id !== collaborator.id)
                          : [...form.participantIds, collaborator.id],
                      )
                    }
                    className={`inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-[11px] transition ${
                      active
                        ? "border-alp-green/40 bg-alp-green/12 text-white"
                        : "border-white/10 text-alp-muted hover:text-white"
                    }`}
                  >
                    <Avatar user={collaborator} size={18} />
                    {collaborator.name.split(" ")[0]}
                  </button>
                );
              })}
          </div>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={labelClass} htmlFor="event-priority">
              Priorité
            </label>
            <select
              id="event-priority"
              value={form.priority}
              onChange={(event) => update("priority", event.target.value)}
              className={inputClass}
            >
              {PRIORITIES.map((priority) => (
                <option key={priority.key} value={priority.key}>
                  {priority.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="event-status">
              Statut
            </label>
            <select
              id="event-status"
              value={form.status}
              onChange={(event) => update("status", event.target.value)}
              className={inputClass}
            >
              {STATUSES.map((status) => (
                <option key={status.key} value={status.key}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="event-reminder">
              Rappel
            </label>
            <select
              id="event-reminder"
              value={form.reminder}
              onChange={(event) => update("reminder", Number(event.target.value))}
              className={inputClass}
            >
              {REMINDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="event-visibility">
              Visibilité
            </label>
            <select
              id="event-visibility"
              value={form.visibility}
              onChange={(event) => update("visibility", event.target.value)}
              className={inputClass}
            >
              <option value="partage">Partagé à l&apos;équipe</option>
              <option value="prive">Privé</option>
            </select>
          </div>
        </div>

        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.16em] text-alp-muted uppercase">
              <Repeat size={12} /> Récurrence
            </span>
            <select
              value={form.recurrenceFreq}
              onChange={(event) =>
                handleFreqChange(event.target.value as FormState["recurrenceFreq"])
              }
              className={`${inputClass} max-w-[220px]`}
              aria-label="Fréquence de récurrence"
            >
              <option value="NONE">Aucune</option>
              <option value="DAILY">Tous les jours</option>
              <option value="WEEKLY">Toutes les semaines</option>
              <option value="MONTHLY">Tous les mois</option>
            </select>
            {form.recurrenceFreq !== "NONE" ? (
              <button
                type="button"
                onClick={() => update("customRecurrence", !form.customRecurrence)}
                className={`rounded-lg border px-2.5 py-1 text-[11px] transition ${
                  form.customRecurrence
                    ? "border-alp-green/40 bg-alp-green/12 text-alp-green-soft"
                    : "border-white/10 text-alp-muted hover:text-white"
                }`}
              >
                Personnaliser
              </button>
            ) : null}
          </div>

          {form.recurrenceFreq !== "NONE" && form.customRecurrence ? (
            <div className="mt-2.5 space-y-2.5">
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="recurrence-interval">
                    Toutes les
                  </label>
                  <select
                    id="recurrence-interval"
                    value={form.recurrenceInterval}
                    onChange={(event) => update("recurrenceInterval", Number(event.target.value))}
                    className={inputClass}
                  >
                    {[1, 2, 3, 4, 6, 8, 12].map((interval) => (
                      <option key={interval} value={interval}>
                        {interval}{" "}
                        {form.recurrenceFreq === "DAILY"
                          ? "jour(s)"
                          : form.recurrenceFreq === "WEEKLY"
                            ? "semaine(s)"
                            : "mois"}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="recurrence-until">
                    Jusqu&apos;au (optionnel)
                  </label>
                  <input
                    id="recurrence-until"
                    type="date"
                    value={form.recurrenceUntil}
                    min={form.startDate}
                    onChange={(event) => update("recurrenceUntil", event.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
              {form.recurrenceFreq === "WEEKLY" ? (
                <div>
                  <span className={labelClass}>Jours de la semaine</span>
                  <div className="flex flex-wrap gap-1">
                    {DAY_LABELS.map((label, index) => {
                      const active = form.recurrenceByDay.includes(index);
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => toggleDay(index)}
                          className={`h-7 w-9 rounded-md border text-[10.5px] transition ${
                            active
                              ? "border-alp-green/45 bg-alp-green/15 text-alp-green-soft"
                              : "border-white/10 text-alp-muted hover:text-white"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          {form.recurrenceFreq !== "NONE" ? (
            <p className="mt-2 text-[10px] leading-relaxed text-alp-dim">
              Les heures locales Europe/Paris sont conservées pour chaque occurrence. Les
              occurrences passées restent visibles dans l&apos;agenda.
            </p>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}

