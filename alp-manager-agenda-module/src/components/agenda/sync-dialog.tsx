"use client";

import { CalendarSync, CircleAlert, Loader, Plug, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { SOURCE_LABELS } from "@/lib/calendar/constants";
import { apiRequest, errorMessage } from "@/lib/calendar/client";
import { formatInstantLong } from "@/lib/calendar/time";

type SyncOverview = {
  provider: string;
  configured: boolean;
  missingVariables: string[];
  counts: Record<string, number>;
  lastSyncedAt: string | null;
  implemented: boolean;
  reachable?: boolean;
  error?: string | null;
};

type SyncOutcome = {
  ok: boolean;
  upserted: number;
  users: { created: number; mapped: number };
  parts: Array<{ source: string; ok: boolean; count: number; removed: number; message: string | null }>;
  warnings: string[];
};

const PART_LABELS: Record<string, string> = {
  owners: "Équipe",
  deals: "Transactions",
  projects: "Projets",
  tasks: "Tâches",
  meetings: "Réunions",
};

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SyncDialog({ open, onClose }: Props) {
  const [overview, setOverview] = useState<SyncOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchMessage, setLaunchMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    setLaunchMessage(null);
    apiRequest<SyncOverview>("/api/calendar/sync", { signal: controller.signal })
      .then(setOverview)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setLoadError(errorMessage(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open]);

  async function launch() {
    setLaunching(true);
    setLaunchMessage(null);
    try {
      const result = await apiRequest<SyncOutcome>("/api/calendar/sync", { method: "POST" });
      const lines = result.parts.map(
        (p) => `${PART_LABELS[p.source] ?? p.source} : ${p.ok ? `${p.count} importé(s)` : (p.message ?? "échec")}`,
      );
      setLaunchMessage({
        tone: result.ok ? "info" : "error",
        text: [`${result.upserted} événement(s) synchronisé(s).`, ...lines, ...result.warnings].join(" • "),
      });
      const refreshed = await apiRequest<SyncOverview>("/api/calendar/sync");
      setOverview(refreshed);
    } catch (err) {
      setLaunchMessage({ tone: "error", text: errorMessage(err) });
    } finally {
      setLaunching(false);
    }
  }

  const configured = overview?.configured ?? false;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Synchronisation HubSpot"
      description="Importe l'équipe, les tâches, les réunions et les dates des transactions et des projets depuis HubSpot. Lecture seule : rien n'est modifié dans HubSpot."
      size="md"
      footer={
        <>
          <button type="button" className="alp-btn" onClick={onClose}>
            Fermer
          </button>
          <button type="button" className="alp-btn alp-btn-primary" onClick={launch} disabled={launching || loading || !overview}>
            {launching ? <Loader className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            Lancer la synchronisation
          </button>
        </>
      }
    >
      {loading && !overview && (
        <div className="space-y-3" aria-busy="true">
          <div className="alp-skeleton h-16 rounded-2xl" />
          <div className="alp-skeleton h-24 rounded-2xl" />
        </div>
      )}

      {loadError && (
        <p className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4 text-sm text-red-200" role="alert">
          {loadError}
        </p>
      )}

      {overview && (
        <div className="alp-rise space-y-5">
          <div
            className={`flex items-start gap-3 rounded-2xl border p-4 ${
              configured ? "border-sky-400/25 bg-sky-400/10" : "border-amber-400/25 bg-amber-400/10"
            }`}
          >
            <Plug className={`mt-0.5 h-5 w-5 shrink-0 ${configured ? "text-sky-300" : "text-amber-300"}`} aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">
                {!configured ? "Connexion HubSpot non configurée" : overview.reachable ? "Connexion HubSpot active" : (overview.error ?? "HubSpot injoignable")}
              </p>
              {!configured && overview.missingVariables.length > 0 && (
                <p className="mt-1 text-[13px] text-zinc-300">
                  Variable d&apos;environnement manquante : <code className="rounded bg-black/40 px-1.5 py-0.5 text-amber-200">{overview.missingVariables.join(", ")}</code>
                </p>
              )}
            </div>
          </div>

          <div>
            <p className="alp-label mb-2">Événements par source</p>
            <div className="grid grid-cols-3 gap-2">
              {(["local", "hubspot", "outlook"] as const).map((source) => (
                <div key={source} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3 text-center">
                  <p className="text-2xl font-black tabular-nums text-white">{overview.counts[source] ?? 0}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-wider text-zinc-500">{SOURCE_LABELS[source]}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 flex items-center gap-2 text-[12px] text-zinc-400">
              <CalendarSync className="h-3.5 w-3.5" aria-hidden />
              Dernière synchronisation : {overview.lastSyncedAt ? formatInstantLong(new Date(overview.lastSyncedAt)) : "jamais"}
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-black/25 p-4 text-[13px] leading-relaxed text-zinc-400">
            <p className="mb-2 font-medium text-zinc-200">Ce qui est importé</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Tâches, réunions, et dates de livraison, de fermeture et de création des transactions et des projets.</li>
              <li>Pas de doublons : chaque événement importé est identifié par sa source et son identifiant HubSpot.</li>
              <li>Les événements importés se modifient dans HubSpot ; ils sont mis à jour à chaque synchronisation.</li>
            </ul>
          </div>

          {launchMessage && (
            <p
              role={launchMessage.tone === "error" ? "alert" : "status"}
              className={`flex items-start gap-2 rounded-2xl border px-4 py-3 text-[13px] ${
                launchMessage.tone === "error"
                  ? "border-red-500/25 bg-red-500/10 text-red-200"
                  : "border-sky-400/25 bg-sky-400/10 text-sky-100"
              }`}
            >
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {launchMessage.text}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
