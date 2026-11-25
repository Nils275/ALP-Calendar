"use client";

import { Globe2, Loader, Lock, MapPin, Repeat } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Modal } from "@/components/ui/modal";
import {
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
import type { AgendaCategory } from "./agenda-filters";

export type EditorTarget =
  | { mode: "create"; dayKey?: string; minutes?: number }
  | { mode: "edit"; eventId: string; occurrenceStart?: string | null };

type Form = {
  title: string;
  description: string;
  category: CategoryKey;
  subcategoryId: string;
  taskTypeId: string;
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
  customFields: Record<string, unknown>;
};
type WorkflowSubcategory = {
  id: string;
  categoryKey: string;
  label: string;
  isActive: boolean;
};

type WorkflowTaskType = {
  id: string;
  subcategoryId: string;
  label: string;
  isActive: boolean;
};

type WorkflowField = {
  id: string;
  taskTypeId: string;
  key: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  options: Array<{ label: string; value: string }>;
  isActive: boolean;
};

type CategoryField = {
  id: string;
  categoryKey: string;
  label: string;
  fieldType: string;
  isRequired: boolean;
  options: Array<{ label: string; value: string }>;
  sortOrder: number;
  isActive: boolean;
};

type WorkflowData = {
  subcategories: WorkflowSubcategory[];
  taskTypes: WorkflowTaskType[];
  fields: WorkflowField[];
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

function defaultForm(currentUser: CalendarUser, dayKey?: string, minutes?: number, defaultCategory = "commercial"): Form {
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
    subcategoryId: "",
    taskTypeId: "",
    title: "",
    description: "",
    category: defaultCategory,
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
    customFields: {},
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
    subcategoryId: e.subcategoryId ?? "",
    taskTypeId: e.taskTypeId ?? "",
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
    customFields: e.customFields ?? {},
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
  categories: AgendaCategory[];
  onSaved: (eventId: string, message: string) => void;
};

export function EventDialog({ open, onClose, target, users, currentUser, categories, onSaved }: Props) {
  const [form, setForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSeries, setIsSeries] = useState(false);
  const [workflowSubcategories, setWorkflowSubcategories] = useState<WorkflowSubcategory[]>([]);
  const [workflowTaskTypes, setWorkflowTaskTypes] = useState<WorkflowTaskType[]>([]);
  const [workflowFields, setWorkflowFields] = useState<WorkflowField[]>([]);
  const [categoryFields, setCategoryFields] = useState<CategoryField[]>([]);
  const [categoryFieldsLoading, setCategoryFieldsLoading] = useState(false);
  const currentCategoryKey = form?.category ?? null;

  // Champs personnalisés de la catégorie sélectionnée (rechargés à chaque changement de catégorie).
  useEffect(() => {
    if (!open || !currentCategoryKey) {
      setCategoryFields([]);
      return;
    }

    const controller = new AbortController();
    setCategoryFieldsLoading(true);

    apiRequest<{ fields: CategoryField[] }>(
      `/api/calendar/category-fields?categoryKey=${encodeURIComponent(currentCategoryKey)}`,
      { signal: controller.signal },
    )
      .then((data) => {
        setCategoryFields(data.fields ?? []);
        setCategoryFieldsLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        console.error("Chargement des champs de catégorie impossible :", err);
        setCategoryFields([]);
        setCategoryFieldsLoading(false);
      });

    return () => controller.abort();
  }, [open, currentCategoryKey]);

  const activeCategoryFields = categoryFields
    .filter((field) => field.isActive && field.categoryKey === currentCategoryKey)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));

  useEffect(() => {
    if (!open) return;

    const controller = new AbortController();

    apiRequest<WorkflowData>("/api/workflows", { signal: controller.signal })
      .then((data) => {
        setWorkflowSubcategories(data.subcategories);
        setWorkflowTaskTypes(data.taskTypes);
        setWorkflowFields(data.fields ?? []);

      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          console.error("Chargement des workflows impossible :", err);
        }
      });

    return () => controller.abort();
  }, [open]);
  useEffect(() => {
    if (!open || !target) return;
    setError(null);
    setSaving(false);

    if (target.mode === "create") {
      setForm(defaultForm(currentUser, target.dayKey, target.minutes, categories[0]?.key ?? "commercial"));
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

  // Les valeurs de customFields ne sont JAMAIS effacées lors d'un changement de
  // catégorie, de sous-catégorie ou de type de tâche : les valeurs historiques sont conservées.
  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((prev) => {
      if (!prev) return prev;

      if (key === "subcategoryId") {
        return { ...prev, subcategoryId: value as string, taskTypeId: "" };
      }

      if (key === "category") {
        return {
          ...prev,
          category: value as CategoryKey,
          subcategoryId: "",
          taskTypeId: "",
        };
      }

      return { ...prev, [key]: value };
    });

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
    for (const field of activeCategoryFields) {
      if (!field.isRequired || field.fieldType === "checkbox") continue;
      const value = f.customFields[field.id];
      if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
        return `Le champ « ${field.label} » est obligatoire.`;
      }
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

    // Normalisation des champs de catégorie (clé = UUID du champ) ; les autres clés sont conservées telles quelles.
    const customFields: Record<string, unknown> = { ...form.customFields };
    for (const field of activeCategoryFields) {
      const value = customFields[field.id];
      if (field.fieldType === "checkbox") {
        customFields[field.id] = value === true;
      } else if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
        delete customFields[field.id];
      } else if (field.fieldType === "number" && typeof value === "string") {
        customFields[field.id] = Number(value);
      }
    }

    const body = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      category: form.category,
      subcategoryId: form.subcategoryId || null,
      taskTypeId: form.taskTypeId || null,
      customFields,
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
              {categories.map((category) => {
                const selected = form.category === category.key;
                return (
                  <button
                    key={category.key}
                    type="button"
  onClick={() => {
  set("category", category.key);
  set("subcategoryId", "");
  set("taskTypeId", "");
}}
                    aria-pressed={selected}
                    className="flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-[13px] transition-all duration-200"
                    style={{
                      borderColor: selected ? category.color : "rgba(255,255,255,0.08)",
                      background: selected ? tint(category.color, 34) : "rgba(255,255,255,0.03)",
                      color: selected ? "#fff" : "#a1a1aa",
                      boxShadow: selected ? `0 0 0 1px ${tint(category.color, 90)}` : undefined,
                    }}
                  >
                    <CategoryIcon
                      category={category.key}
                      icon={category.icon}
                      color={category.color}
                      className="h-3.5 w-3.5 shrink-0"
                    />
                    <span className="truncate">{category.label}</span>
                  </button>
                );
              })}
              {!categories.some((category) => category.key === form.category) && (
                <div
                  className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[13px] text-amber-200"
                  title="Cette catégorie est désactivée. Elle est conservée sur cet événement historique."
                >
                  <CategoryIcon category={form.category} className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Catégorie désactivée · {form.category}</span>
                </div>
              )}
            </div>
          </div>
          {/* Sous-catégorie et type de tâche */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sous-catégorie">
              <select
                className="alp-input"
                value={form.subcategoryId}
                onChange={(e) => {
                  set("subcategoryId", e.target.value);
                  set("taskTypeId", "");
                }}
              >
                <option value="">Aucune sous-catégorie</option>

                {workflowSubcategories
                  .filter((item) => item.categoryKey === form.category)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}

                {form.subcategoryId &&
                  !workflowSubcategories.some((item) => item.id === form.subcategoryId) && (
                    <option value={form.subcategoryId}>
                      Sous-catégorie historique
                    </option>
                  )}
              </select>
            </Field>

            <Field label="Type de tâche">
              <select
                className="alp-input"
                value={form.taskTypeId}
                disabled={!form.subcategoryId}
                onChange={(e) => set("taskTypeId", e.target.value)}
              >
                <option value="">Aucun type de tâche</option>

                {workflowTaskTypes
                  .filter((item) => item.subcategoryId === form.subcategoryId)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}

                {form.taskTypeId &&
                  !workflowTaskTypes.some((item) => item.id === form.taskTypeId) && (
                    <option value={form.taskTypeId}>
                      Type de tâche historique
                    </option>
                  )}
              </select>
            </Field>
          </div>
{form.taskTypeId && (() => {
  const activeFields = workflowFields
    .filter(
      (field) =>
        field.taskTypeId === form.taskTypeId && field.isActive
    )
    .sort((a, b) => a.label.localeCompare(b.label));

  if (activeFields.length === 0) return null;

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      {activeFields.map((field) => {
        const value = form.customFields[field.key];

        return (
          <Field
            key={field.id}
            label={`${field.label}${field.isRequired ? " *" : ""}`}
          >
            {field.fieldType === "checkbox" ? (
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input
                  type="checkbox"
                  checked={value === true}
                  onChange={(e) =>
                    set("customFields", {
                      ...form.customFields,
                      [field.key]: e.target.checked,
                    })
                  }
                />
                {field.label}
              </label>
            ) : field.fieldType === "select" ? (
              <select
                className="alp-input"
                value={String(value ?? "")}
                required={field.isRequired}
                onChange={(e) =>
                  set("customFields", {
                    ...form.customFields,
                    [field.key]: e.target.value,
                  })
                }
              >
                <option value="">Sélectionner...</option>
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : field.fieldType === "user" ? (
  <select
    className="alp-input"
    value={String(value ?? "")}
    required={field.isRequired}
    onChange={(e) =>
      set("customFields", {
        ...form.customFields,
        [field.key]: e.target.value,
      })
    }
  >
    <option value="">Sélectionner un collaborateur...</option>
    {users.map((user) => (
      <option key={user.id} value={user.id}>
        {user.fullName}
      </option>
    ))}
  </select>
) : (
  <input
    className="alp-input"
    type={
      field.fieldType === "date"
        ? "date"
        : field.fieldType === "amount"
          ? "number"
          : "text"
    }
    step={field.fieldType === "amount" ? "0.01" : undefined}
    required={field.isRequired}
    value={String(value ?? "")}
    onChange={(e) =>
      set("customFields", {
        ...form.customFields,
        [field.key]: e.target.value,
      })
    }
  />
)}
          </Field>
        );
      })}
    </div>
  );
})()}
          {/* Champs personnalisés de la catégorie */}
          {activeCategoryFields.length > 0 && (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
              <span className="mb-3 block text-sm font-medium text-zinc-200">
                Informations de la catégorie
              </span>
              <div className="grid gap-3 sm:grid-cols-2">
                {activeCategoryFields.map((field) => {
                  const value = form.customFields[field.id];
                  const update = (next: unknown) =>
                    set("customFields", { ...form.customFields, [field.id]: next });

                  return (
                    <Field
                      key={field.id}
                      label={`${field.label}${field.isRequired && field.fieldType !== "checkbox" ? " *" : ""}`}
                    >
                      {field.fieldType === "checkbox" ? (
                        <label className="flex items-center gap-2 text-sm text-zinc-300">
                          <input
                            type="checkbox"
                            checked={value === true}
                            onChange={(e) => update(e.target.checked)}
                          />
                          {field.label}
                        </label>
                      ) : field.fieldType === "select" ? (
                        <select
                          className="alp-input"
                          value={String(value ?? "")}
                          required={field.isRequired}
                          onChange={(e) => update(e.target.value)}
                        >
                          <option value="">Sélectionner...</option>
                          {field.options.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                          {typeof value === "string" &&
                            value !== "" &&
                            !field.options.some((option) => option.value === value) && (
                              <option value={value}>{value} (valeur historique)</option>
                            )}
                        </select>
                      ) : (
                        <input
                          className="alp-input"
                          type={
                            field.fieldType === "date"
                              ? "date"
                              : field.fieldType === "number"
                                ? "number"
                                : "text"
                          }
                          step={field.fieldType === "number" ? "any" : undefined}
                          required={field.isRequired}
                          value={String(value ?? "")}
                          onChange={(e) => update(e.target.value)}
                        />
                      )}
                    </Field>
                  );
                })}
              </div>
            </div>
          )}
          {categoryFieldsLoading && activeCategoryFields.length === 0 && (
            <p className="text-xs text-zinc-500">Chargement des champs de la catégorie…</p>
          )}

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
