"use client";

import { useState } from "react";
import {
  Ban,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Link2,
  Lock,
  MapPin,
  Pencil,
  Repeat,
  Trash2,
} from "lucide-react";

import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import {
  CategoryBadge,
  PriorityBadge,
  StatusBadge,
  SyncBadge,
  dateRangeLabel,
  isLate,
  timeRangeLabel,
} from "@/components/agenda/shared";
import {
  externalObjectLabel,
  reminderLabel,
  syncStatusMeta,
  visibilityLabel,
} from "@/lib/agenda-config";
import type { EventOccurrence } from "@/lib/agenda-types";
import { describeRecurrence } from "@/lib/recurrence";
import { formatParisDateTime } from "@/lib/time";

export type EventScope = "series" | "occurrence";

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-white/6 py-1.5 last:border-b-0">
      <span className="text-[10px] font-medium tracking-[0.1em] text-alp-dim uppercase">
        {label}
      </span>
      <span className="max-w-[62%] text-right text-[11.5px] text-white/85">{children}</span>
    </div>
  );
}

export function EventDetail({
  occurrence,
  onClose,
  onEdit,
  onDelete,
  onDuplicate,
  onStatus,
  busy,
}: {
  occurrence: EventOccurrence | null;
  onClose: () => void;
  onEdit: (occurrence: EventOccurrence, scope: EventScope) => void;
  onDelete: (occurrence: EventOccurrence, scope: EventScope) => void;
  onDuplicate: (occurrence: EventOccurrence) => void;
  onStatus: (occurrence: EventOccurrence, status: string, scope: EventScope) => void;
  busy: boolean;
}) {
  const [scope, setScope] = useState<EventScope>(
    occurrence?.isRecurring ? "occurrence" : "series",
  );

  if (!occurrence) return null;

  const recurrence = describeRecurrence(occurrence.recurrenceRule);
  const late = isLate(occurrence);
  const sync = syncStatusMeta(occurrence.syncStatus);
  const closed = occurrence.status === "termine" || occurrence.status === "annule";

  const actionButton =
    "inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <Modal
      open={Boolean(occurrence)}
      onClose={onClose}
      title="Fiche événement"
      subtitle={
        occurrence.isRecurring
          ? "Événement récurrent — choisissez la portée des actions."
          : "Événement de l'agenda commun ALP Racing."
      }
      width="max-w-lg"
      align="right"
      footer={
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => onStatus(occurrence, "termine", scope)}
            disabled={busy || !occurrence.canEdit || occurrence.status === "termine"}
            className={`${actionButton} border-alp-green/30 bg-alp-green/10 text-alp-green-soft hover:bg-alp-green/20`}
          >
            <CheckCircle2 size={13} />
            {occurrence.status === "termine" ? "Terminé" : "Marquer terminé"}
          </button>
          <button
            onClick={() => onStatus(occurrence, "annule", scope)}
            disabled={busy || !occurrence.canEdit || occurrence.status === "annule"}
            className={`${actionButton} border-white/10 text-white/70 hover:border-red-400/30 hover:text-red-200`}
          >
            <Ban size={13} /> Annuler
          </button>
          <button
            onClick={() => onDuplicate(occurrence)}
            disabled={busy || !occurrence.canEdit}
            className={`${actionButton} border-white/10 text-white/70 hover:text-white`}
          >
            <Copy size={13} /> Dupliquer
          </button>
          <button
            onClick={() => onDelete(occurrence, scope)}
            disabled={busy || !occurrence.canEdit}
            className={`${actionButton} ml-auto border-red-500/25 bg-red-500/10 text-red-300 hover:bg-red-500/20`}
          >
            <Trash2 size={13} /> Supprimer
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <CategoryBadge category={occurrence.category} />
            <StatusBadge status={occurrence.status} />
            <PriorityBadge priority={occurrence.priority} />
            <SyncBadge source={occurrence.source} syncStatus={occurrence.syncStatus} />
            {late ? (
              <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[9.5px] font-semibold text-red-300">
                En retard
              </span>
            ) : null}
            {occurrence.visibility === "prive" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/8 px-2 py-0.5 text-[9.5px] text-white/70">
                <Lock size={9} /> Privé
              </span>
            ) : null}
          </div>
          <h2 className="text-[17px] font-semibold leading-snug text-white">
            {occurrence.title}
          </h2>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-alp-muted">
            <span className="inline-flex items-center gap-1">
              <Clock size={12} className="text-alp-green/80" />
              {dateRangeLabel(occurrence)} · {timeRangeLabel(occurrence)}
            </span>
            {occurrence.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin size={12} className="text-alp-green/80" />
                {occurrence.location}
              </span>
            ) : null}
          </p>
        </div>

        {occurrence.description ? (
          <div className="rounded-xl border border-white/8 bg-white/[0.025] p-3">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-alp-dim uppercase">
              Description
            </p>
            <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-white/80">
              {occurrence.description}
            </p>
          </div>
        ) : null}

        {occurrence.isRecurring ? (
          <div className="rounded-xl border border-alp-green/20 bg-alp-green/[0.06] p-2.5">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] text-alp-green/90 uppercase">
              <Repeat size={11} /> Récurrence
            </p>
            <p className="mt-1 text-[11.5px] text-white/85">
              {recurrence ?? "Récurrence personnalisée"} · occurrence du{" "}
              {occurrence.occurrenceDate.split("-").reverse().join("/")}
            </p>
            <div className="mt-2 flex gap-1.5">
              {(
                [
                  { key: "occurrence", label: "Cette occurrence" },
                  { key: "series", label: "Toute la série" },
                ] as const
              ).map((option) => (
                <button
                  key={option.key}
                  onClick={() => setScope(option.key)}
                  className={`rounded-md border px-2 py-0.5 text-[10px] transition ${
                    scope === option.key
                      ? "border-alp-green/40 bg-alp-green/15 text-alp-green-soft"
                      : "border-white/10 text-alp-muted hover:text-white"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[9.5px] leading-relaxed text-alp-dim">
              « Cette occurrence » crée une exception : seule cette date est modifiée ou
              supprimée, le reste de la série est conservé.
            </p>
          </div>
        ) : null}

        <div>
          <p className="mb-1 text-[10px] font-semibold tracking-[0.14em] text-alp-dim uppercase">
            Organisation
          </p>
          <DetailRow label="Responsable">
            {occurrence.assignedTo ? (
              <span className="inline-flex items-center gap-1.5">
                <Avatar user={occurrence.assignedTo} size={18} />
                {occurrence.assignedTo.name}
              </span>
            ) : (
              "Non attribué"
            )}
          </DetailRow>
          <DetailRow label="Participants">
            {occurrence.participants.length === 0 ? (
              "Aucun"
            ) : (
              <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                <AvatarStack users={occurrence.participants} size={18} max={5} />
                <span className="text-[10.5px] text-alp-muted">
                  {occurrence.participants.map((participant) => participant.name.split(" ")[0]).join(", ")}
                </span>
              </span>
            )}
          </DetailRow>
          <DetailRow label="Rappel">
            <span className="inline-flex items-center gap-1">
              {occurrence.reminder > 0 ? reminderLabel(occurrence.reminder) : "Aucun"}
            </span>
          </DetailRow>
          <DetailRow label="Visibilité">{visibilityLabel(occurrence.visibility)}</DetailRow>
          <DetailRow label="Créé par">
            {occurrence.createdBy ? occurrence.createdBy.name : "—"}
          </DetailRow>
          <DetailRow label="Créé le">{formatParisDateTime(occurrence.createdAt)}</DetailRow>
          <DetailRow label="Dernière modification">
            {formatParisDateTime(occurrence.updatedAt)}
          </DetailRow>
        </div>

        <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] text-alp-dim uppercase">
            <Link2 size={11} /> Synchronisation
          </p>
          <DetailRow label="Source">
            <SyncBadge source={occurrence.source} syncStatus={occurrence.syncStatus} />
          </DetailRow>
          <DetailRow label="Statut sync">
            <span style={{ color: sync.color }}>{sync.label}</span>
          </DetailRow>
          <DetailRow label="Sens">{occurrence.syncDirection}</DetailRow>
          <DetailRow label="Objet externe">
            {occurrence.externalObjectType
              ? externalObjectLabel(occurrence.externalObjectType)
              : "—"}
          </DetailRow>
          <DetailRow label="ID externe">{occurrence.externalId ?? "—"}</DetailRow>
          <DetailRow label="ID objet">{occurrence.externalObjectId ?? "—"}</DetailRow>
          <DetailRow label="Dernière synchro">
            {occurrence.lastSyncedAt ? formatParisDateTime(occurrence.lastSyncedAt) : "Jamais"}
          </DetailRow>
          {occurrence.externalUrl ? (
            <a
              href={occurrence.externalUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-[10.5px] font-medium text-alp-green hover:underline"
            >
              Ouvrir la fiche externe <ExternalLink size={11} />
            </a>
          ) : (
            <p className="mt-1.5 text-[9.5px] leading-relaxed text-alp-dim">
              Événement local ALP Manager. Les champs HubSpot / Outlook sont prévus mais
              aucune synchronisation n&apos;est active : l&apos;événement ne sera pas écrasé
              par un import futur grâce à la clé externe unique.
            </p>
          )}
        </div>

        {closed ? (
          <button
            onClick={() => onStatus(occurrence, "a_venir", scope)}
            disabled={busy || !occurrence.canEdit}
            className={`${actionButton} w-full border-white/10 text-white/70 hover:text-white`}
          >
            Rouvrir l&apos;événement
          </button>
        ) : null}

        {occurrence.canEdit ? (
          <button
            onClick={() => onEdit(occurrence, scope)}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-alp-green px-3 py-2 text-[12px] font-semibold text-[#05150a] transition hover:bg-alp-green-soft disabled:opacity-60"
          >
            <Pencil size={13} /> Modifier l&apos;événement
          </button>
        ) : (
          <p className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-[10.5px] text-alp-muted">
            Votre profil ne permet pas de modifier cet événement. Contactez un administrateur
            ou le responsable de l&apos;événement.
          </p>
        )}

        <p className="text-center text-[9.5px] text-alp-dim">
          Fiche mise à jour le {formatParisDateTime(occurrence.updatedAt)} · heures Europe/Paris
        </p>
      </div>
    </Modal>
  );
}
