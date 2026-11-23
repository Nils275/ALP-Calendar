"use client";

import {
  CalendarClock,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader,
  MapPin,
  Pencil,
  Repeat,
  RotateCcw,
  Trash2,
  Users,
  Bell,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/modal";
import { CATEGORIES, EXTERNAL_OBJECT_TYPE_LABELS, PRIORITIES, ROLE_LABELS, SOURCE_LABELS, SYNC_DIRECTION_LABELS, SYNC_STATUS_LABELS } from "@/lib/calendar/constants";
import { apiRequest, errorMessage } from "@/lib/calendar/client";
import { describeRecurrence } from "@/lib/calendar/recurrence";
import { addDays, dateKey, formatDayLong, formatInstantLong, formatPeriod, instantFromKey, lastDayKeyOf, parseTime, timeOf } from "@/lib/calendar/time";
import type { EventDetailDto } from "@/lib/calendar/types";
import { Avatar, CategoryIcon, PriorityPill, SourceBadge, StatusPill, VisibilityIcon, categoryColor, tint } from "./bits";

export type DetailTarget = { eventId: string; occurrenceStart: string | null };

type Props = {
  target: DetailTarget | null;
  onClose: () => void;
  onEdit: (eventId: string, occurrenceStart: string | null) => void;
  onChanged: (message: string) => void;
  onDuplicated: (newEventId: string) => void;
};

type View = "main" | "reschedule" | "delete";

type ReschedForm = {
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  applyToSeries: boolean;
};

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="alp-label mb-1">{label}</p>
      <div className="text-sm text-zinc-200">{children}</div>
    </div>
  );
}

export function EventDetailModal({ target, onClose, onEdit, onChanged, onDuplicated }: Props) {
  const [detail, setDetail] = useState<EventDetailDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [view, setView] = useState<View>("main");
  const [resched, setResched] = useState<ReschedForm | null>(null);

  const detailQuery = (t: DetailTarget) =>
    `/api/calendar/events/${t.eventId}${t.occurrenceStart ? `?occurrenceStart=${encodeURIComponent(t.occurrenceStart)}` : ""}`;

  const fetchDetail = useCallback(async (t: DetailTarget, signal?: AbortSignal) => {
    const data = await apiRequest<EventDetailDto>(detailQuery(t), { signal });
    setDetail(data);
    return data;
  }, []);

  useEffect(() => {
    if (!target) {
      setDetail(null);
      setView("main");
      setActionError(null);
      return;
    }
    const controller = new AbortController();
    setView("main");
    setActionError(null);
    setLoadError(null);
    setDetail(null);
    setLoading(true);
    fetchDetail(target, controller.signal)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setLoadError(errorMessage(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [target, fetchDetail]);

  if (!target) return null;

  const e = detail?.event;
  const occ = detail?.occurrence;
  const recurrenceText = e ? describeRecurrence(e.recurrenceRule) : null;

  async function runAction(request: () => Promise<unknown>, message: string) {
    if (!target) return;
    setBusy(true);
    setActionError(null);
    try {
      await request();
      onChanged(message);
      await fetchDetail(target);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function markDone() {
    if (!target) return;
    const status = occ?.status === "done" ? "upcoming" : "done";
    runAction(
      () =>
        apiRequest(`/api/calendar/events/${target.eventId}`, {
          method: "PATCH",
          body: { kind: "status", occurrenceStart: target.occurrenceStart, status },
        }),
      status === "done" ? "Marqué comme terminé." : "Événement rouvert.",
    );
  }

  function openReschedule() {
    if (!occ || !e) return;
    const start = new Date(occ.start);
    const end = new Date(occ.end);
    setResched({
      startDate: dateKey(start),
      startTime: timeOf(start),
      endDate: e.allDay ? lastDayKeyOf(end) : dateKey(end),
      endTime: timeOf(end),
      applyToSeries: false,
    });
    setActionError(null);
    setView("reschedule");
  }

  function submitReschedule() {
    if (!target || !resched || !e) return;
    let startAt: Date;
    let endAt: Date;
    if (e.allDay) {
      if (resched.endDate < resched.startDate) {
        setActionError("La date de fin doit être égale ou postérieure à la date de début.");
        return;
      }
      startAt = instantFromKey(resched.startDate);
      endAt = instantFromKey(addDays(resched.endDate, 1));
    } else {
      const [sh, sm] = parseTime(resched.startTime);
      const [eh, em] = parseTime(resched.endTime);
      startAt = instantFromKey(resched.startDate, sh, sm);
      endAt = instantFromKey(resched.endDate, eh, em);
      if (endAt.getTime() <= startAt.getTime()) {
        setActionError("La fin doit être postérieure au début.");
        return;
      }
    }
    runAction(
      () =>
        apiRequest(`/api/calendar/events/${target.eventId}`, {
          method: "PATCH",
          body: {
            kind: "reschedule",
            occurrenceStart: target.occurrenceStart,
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
            applyToSeries: resched.applyToSeries,
          },
        }),
      "Événement reprogrammé.",
    ).then(() => setView("main"));
  }

  async function duplicate() {
    if (!target) return;
    setBusy(true);
    setActionError(null);
    try {
      const res = await apiRequest<{ id: string }>(`/api/calendar/events/${target.eventId}/duplicate`, { method: "POST" });
      onDuplicated(res.id);
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(scope: "occurrence" | "series") {
    if (!target) return;
    setBusy(true);
    setActionError(null);
    try {
      const params = new URLSearchParams({ scope });
      if (scope === "occurrence" && target.occurrenceStart) params.set("occurrenceStart", target.occurrenceStart);
      await apiRequest(`/api/calendar/events/${target.eventId}?${params.toString()}`, { method: "DELETE" });
      onChanged(scope === "occurrence" ? "Occurrence supprimée." : occ?.isRecurring ? "Série supprimée." : "Événement supprimé.");
      onClose();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const title = e?.title ?? "Événement";
  const color = e ? categoryColor(e.category) : "#3ddc84";

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      size="lg"
      description={e ? `${CATEGORIES[e.category].label} · ${formatDayLong(dateKey(new Date(occ?.start ?? e.startAt)))}` : undefined}
    >
      {loading && (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="alp-skeleton h-14 rounded-2xl" />
          ))}
        </div>
      )}

      {loadError && (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-5 text-sm text-red-200" role="alert">
          <p className="font-medium">Impossible d&apos;ouvrir cet événement.</p>
          <p className="mt-1 text-red-200/80">{loadError}</p>
        </div>
      )}

      {e && occ && view === "main" && (
        <div className="alp-rise space-y-6">
          {/* Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium text-white"
              style={{ borderColor: tint(color, 110), background: tint(color, 30) }}
            >
              <CategoryIcon category={e.category} className="h-3.5 w-3.5" />
              {CATEGORIES[e.category].label}
            </span>
            <StatusPill status={occ.status} />
            <PriorityPill priority={e.priority} />
            <VisibilityIcon visibility={e.visibility} />
            <SourceBadge source={e.source} />
          </div>

          {/* Période */}
          <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
            <div className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />
            <div className="flex items-start gap-3 pl-2">
              <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-alp-green" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-semibold capitalize text-white">
                  {formatDayLong(dateKey(new Date(occ.start)))}
                </p>
                <p className="mt-0.5 text-[13px] text-zinc-300">
                  {formatPeriod(new Date(occ.start), new Date(occ.end), e.allDay)}
                </p>
                {occ.isRecurring && (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-zinc-400">
                    <Repeat className="h-3.5 w-3.5 text-alp-green" aria-hidden />
                    {recurrenceText}
                    {occ.isModified && <span className="ml-1 rounded bg-amber-400/15 px-1.5 text-[10px] text-amber-300">occurrence modifiée</span>}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Détails */}
          <div className="grid gap-5 sm:grid-cols-2">
            <Info label="Collaborateur responsable">
              {e.assignedTo ? (
                <div className="flex items-center gap-2.5">
                  <Avatar user={e.assignedTo} size="md" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{e.assignedTo.fullName}</p>
                    <p className="truncate text-[11px] text-zinc-500">
                      {ROLE_LABELS[e.assignedTo.role]}
                      {e.assignedTo.jobTitle ? ` · ${e.assignedTo.jobTitle}` : ""}
                    </p>
                  </div>
                </div>
              ) : (
                <span className="text-zinc-500">Non assigné</span>
              )}
            </Info>

            <Info label="Lieu">
              {e.location ? (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
                  {e.location}
                </span>
              ) : (
                <span className="text-zinc-500">Non renseigné</span>
              )}
            </Info>

            <Info label={`Participants (${e.participants.length})`}>
              {e.participants.length === 0 ? (
                <span className="text-zinc-500">Aucun participant</span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {e.participants.map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 py-0.5 pl-0.5 pr-2.5 text-xs">
                      <Avatar user={p} size="xs" />
                      {p.fullName}
                    </span>
                  ))}
                </div>
              )}
            </Info>

            <Info label="Priorité · Rappel">
              <span className="inline-flex flex-wrap items-center gap-2">
                <span style={{ color: PRIORITIES[e.priority].color }} className="font-medium">
                  {PRIORITIES[e.priority].label}
                </span>
                <span className="text-zinc-600">·</span>
                <span className="inline-flex items-center gap-1 text-zinc-300">
                  <Bell className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
                  {e.reminderMinutes === null
                    ? "Aucun"
                    : e.reminderMinutes >= 1440
                      ? `${e.reminderMinutes / 1440} jour avant`
                      : e.reminderMinutes >= 60
                        ? `${e.reminderMinutes / 60} h avant`
                        : `${e.reminderMinutes} min avant`}
                </span>
              </span>
            </Info>
          </div>

          {e.description && (
            <Info label="Description">
              <p className="whitespace-pre-wrap rounded-2xl border border-white/[0.06] bg-black/25 p-4 text-[13px] leading-relaxed text-zinc-300">
                {e.description}
              </p>
            </Info>
          )}

          {/* Traçabilité */}
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 text-[12px] text-zinc-400">
            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <p>
                <span className="text-zinc-500">Créé par </span>
                <span className="text-zinc-200">{e.createdBy?.fullName ?? "—"}</span>
                <span className="text-zinc-500"> le {formatInstantLong(new Date(e.createdAt))}</span>
              </p>
              <p>
                <span className="text-zinc-500">Modifié le </span>
                <span className="text-zinc-200">{formatInstantLong(new Date(e.updatedAt))}</span>
                {e.updatedBy && <span className="text-zinc-500"> par {e.updatedBy.fullName}</span>}
              </p>
            </div>

            <div className="mt-3 border-t border-white/[0.06] pt-3">
              {e.source === "local" ? (
                <p className="text-zinc-500">
                  Événement créé dans ALP Manager · <span className="text-zinc-400">non synchronisé avec un outil externe.</span>
                </p>
              ) : (
                <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                  <p>
                    <span className="text-zinc-500">Source : </span>
                    <span className="text-zinc-200">{SOURCE_LABELS[e.source]}</span>
                  </p>
                  <p>
                    <span className="text-zinc-500">Objet lié : </span>
                    <span className="text-zinc-200">
                      {e.externalObjectType ? EXTERNAL_OBJECT_TYPE_LABELS[e.externalObjectType] : "—"}
                      {e.externalObjectId ? ` #${e.externalObjectId}` : ""}
                    </span>
                  </p>
                  <p>
                    <span className="text-zinc-500">Synchronisation : </span>
                    <span className="text-zinc-200">{e.syncStatus ? SYNC_STATUS_LABELS[e.syncStatus] : "—"}</span>
                    {e.syncDirection && <span className="text-zinc-500"> · {SYNC_DIRECTION_LABELS[e.syncDirection]}</span>}
                  </p>
                  <p>
                    <span className="text-zinc-500">Dernière synchro : </span>
                    <span className="text-zinc-200">{e.lastSyncedAt ? formatInstantLong(new Date(e.lastSyncedAt)) : "jamais"}</span>
                  </p>
                  {e.externalUrl && (
                    <p className="sm:col-span-2">
                      <a href={e.externalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-alp-green hover:underline">
                        Ouvrir la fiche externe <ExternalLink className="h-3 w-3" aria-hidden />
                      </a>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {!e.canEdit && (
            <p className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-[12px] text-zinc-400">
              Lecture seule : seuls l&apos;auteur, le responsable ou la direction peuvent modifier cet événement.
            </p>
          )}

          {actionError && (
            <p className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
              {actionError}
            </p>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 border-t border-white/[0.07] pt-5">
            {e.canEdit && (
              <button type="button" className="alp-btn" disabled={busy} onClick={markDone}>
                {busy ? <Loader className="h-4 w-4 animate-spin" aria-hidden /> : occ.status === "done" ? <RotateCcw className="h-4 w-4" aria-hidden /> : <CheckCircle2 className="h-4 w-4 text-alp-green" aria-hidden />}
                {occ.status === "done" ? "Rouvrir" : "Marquer terminé"}
              </button>
            )}
            {e.canEdit && (
              <button type="button" className="alp-btn" disabled={busy} onClick={openReschedule}>
                <CalendarClock className="h-4 w-4" aria-hidden /> Reprogrammer
              </button>
            )}
            {e.canEdit && (
              <button
                type="button"
                className="alp-btn"
                disabled={busy}
                onClick={() => onEdit(target.eventId, target.occurrenceStart)}
              >
                <Pencil className="h-4 w-4" aria-hidden /> Modifier
              </button>
            )}
            <button type="button" className="alp-btn" disabled={busy} onClick={duplicate}>
              <Copy className="h-4 w-4" aria-hidden /> Dupliquer
            </button>
            {e.canDelete && (
              <button
                type="button"
                className="alp-btn alp-btn-danger ml-auto"
                disabled={busy}
                onClick={() => {
                  setActionError(null);
                  setView("delete");
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Supprimer
              </button>
            )}
          </div>
          {e.participants.length > 0 && (
            <p className="flex items-center gap-1.5 text-[11px] text-zinc-600">
              <Users className="h-3 w-3" aria-hidden /> {e.participants.length + (e.assignedTo ? 1 : 0)} personne(s) concernée(s)
            </p>
          )}
        </div>
      )}

      {/* Reprogrammation */}
      {e && occ && resched && view === "reschedule" && (
        <div className="alp-rise space-y-5">
          <p className="text-sm text-zinc-300">
            {occ.isRecurring
              ? "Reprogrammez cette occurrence, ou décalez toute la série."
              : "Choisissez la nouvelle date et l'heure de l'événement."}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="alp-label mb-1.5 block">Début — date</span>
              <input type="date" className="alp-input" value={resched.startDate} onChange={(ev) => setResched({ ...resched, startDate: ev.target.value })} />
            </label>
            {!e.allDay && (
              <label className="block">
                <span className="alp-label mb-1.5 block">Début — heure</span>
                <input type="time" className="alp-input" value={resched.startTime} onChange={(ev) => setResched({ ...resched, startTime: ev.target.value })} />
              </label>
            )}
            <label className="block">
              <span className="alp-label mb-1.5 block">{e.allDay ? "Fin — date (incluse)" : "Fin — date"}</span>
              <input type="date" className="alp-input" value={resched.endDate} onChange={(ev) => setResched({ ...resched, endDate: ev.target.value })} />
            </label>
            {!e.allDay && (
              <label className="block">
                <span className="alp-label mb-1.5 block">Fin — heure</span>
                <input type="time" className="alp-input" value={resched.endTime} onChange={(ev) => setResched({ ...resched, endTime: ev.target.value })} />
              </label>
            )}
          </div>
          {occ.isRecurring && (
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[#3ddc84]"
                checked={resched.applyToSeries}
                onChange={(ev) => setResched({ ...resched, applyToSeries: ev.target.checked })}
              />
              <span className="text-[13px] text-zinc-300">
                Appliquer à toute la série
                <span className="block text-[11px] text-zinc-500">
                  Décale l&apos;ensemble des occurrences du même écart. Sans cette option, seule cette occurrence est déplacée.
                </span>
              </span>
            </label>
          )}
          {actionError && (
            <p className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
              {actionError}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.07] pt-5">
            <button type="button" className="alp-btn" onClick={() => setView("main")} disabled={busy}>
              Retour
            </button>
            <button type="button" className="alp-btn alp-btn-primary" onClick={submitReschedule} disabled={busy}>
              {busy ? <Loader className="h-4 w-4 animate-spin" aria-hidden /> : <CalendarClock className="h-4 w-4" aria-hidden />}
              Reprogrammer
            </button>
          </div>
        </div>
      )}

      {/* Confirmation de suppression */}
      {e && occ && view === "delete" && (
        <div className="alp-rise space-y-5">
          <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-5">
            <p className="font-semibold text-red-100">Confirmer la suppression ?</p>
            <p className="mt-1 text-sm text-red-200/80">
              « {e.title} » sera supprimé définitivement
              {occ.isRecurring ? ". Vous pouvez supprimer uniquement cette occurrence ou toute la série." : "."}
            </p>
          </div>
          {actionError && (
            <p className="rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
              {actionError}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="alp-btn" onClick={() => setView("main")} disabled={busy}>
              Annuler
            </button>
            {occ.isRecurring && (
              <button type="button" className="alp-btn alp-btn-danger" onClick={() => remove("occurrence")} disabled={busy}>
                Cette occurrence
              </button>
            )}
            <button type="button" className="alp-btn alp-btn-danger" onClick={() => remove("series")} disabled={busy}>
              {busy ? <Loader className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
              {occ.isRecurring ? "Toute la série" : "Supprimer définitivement"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
