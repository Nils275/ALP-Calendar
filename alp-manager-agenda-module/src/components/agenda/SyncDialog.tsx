"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { Modal } from "@/components/ui/Modal";
import type { ExternalSyncInfo } from "@/lib/agenda-types";
import { formatParisDateTime } from "@/lib/time";

const FIELD_HELP: Record<string, string> = {
  source: "local / hubspot / outlook",
  external_id: "identifiant externe de l'événement",
  external_object_type: "task, deal, contact, project, custom",
  external_object_id: "identifiant de l'objet associé",
  external_url: "lien vers la fiche externe",
  last_synced_at: "horodatage de la dernière synchronisation",
  sync_status: "local / synced / pending / error",
  sync_direction: "inbound / outbound / both",
};

export function SyncDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [info, setInfo] = useState<ExternalSyncInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setTestMessage(null);
    try {
      const response = await fetch("/api/integrations/hubspot", { cache: "no-store" });
      const payload = (await response.json()) as {
        ok: boolean;
        data?: ExternalSyncInfo;
        error?: string;
      };
      if (!payload.ok || !payload.data) throw new Error(payload.error ?? "État indisponible");
      setInfo(payload.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "État indisponible");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      void load();
    }, 30);
    return () => clearTimeout(timer);
  }, [open, load]);

  const testConnection = async () => {
    setTesting(true);
    setTestMessage(null);
    try {
      const response = await fetch("/api/integrations/hubspot", { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      setTestMessage(
        payload.error ??
          "Le connecteur n'est pas encore disponible : aucune synchronisation n'a été effectuée.",
      );
    } catch {
      setTestMessage("Impossible de contacter le connecteur. Aucune synchronisation effectuée.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Synchronisation HubSpot"
      subtitle="Préparation de la future connexion — aucune API n'est appelée."
      width="max-w-xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            onClick={load}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-white/75 transition hover:bg-white/8"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Rafraîchir l&apos;état
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={testConnection}
              disabled={testing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-200 transition hover:bg-amber-400/20 disabled:opacity-60"
            >
              {testing ? <Loader2 size={12} className="animate-spin" /> : <AlertTriangle size={12} />}
              Tester la connexion
            </button>
            <button
              onClick={onClose}
              className="rounded-lg bg-alp-green px-3 py-1.5 text-[11.5px] font-semibold text-[#05150a] transition hover:bg-alp-green-soft"
            >
              Fermer
            </button>
          </div>
        </div>
      }
    >
      {loading && !info ? (
        <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-alp-muted">
          <Loader2 size={15} className="animate-spin" /> Vérification de la configuration…
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11.5px] text-red-200">
          {error}
        </div>
      ) : null}

      {info ? (
        <div className="space-y-3">
          <div
            className={`rounded-xl border p-3 ${
              info.configured
                ? "border-alp-green/25 bg-alp-green/[0.07]"
                : "border-amber-400/25 bg-amber-400/[0.07]"
            }`}
          >
            <div className="flex items-center gap-2">
              {info.configured ? (
                <CheckCircle2 size={16} className="text-alp-green" />
              ) : (
                <AlertTriangle size={16} className="text-amber-300" />
              )}
              <p className="text-[12.5px] font-semibold text-white">
                {info.configured ? "Jeton HubSpot détecté" : "Aucune connexion HubSpot configurée"}
              </p>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-white/70">{info.message}</p>
          </div>

          {testMessage ? (
            <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] leading-relaxed text-white/75">
              <span className="font-semibold text-amber-200">Connecteur non livré · </span>
              {testMessage}
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-1.5">
            {[
              { label: "Événements ALP", value: info.externalEventCount === 0 ? "local" : "mixte" },
              { label: "Importés", value: String(info.externalEventCount) },
              { label: "En attente", value: String(info.pendingCount) },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-white/8 bg-white/[0.025] p-2">
                <p className="text-[9px] font-semibold tracking-[0.12em] text-alp-dim uppercase">
                  {item.label}
                </p>
                <p className="mt-0.5 text-[13px] font-semibold text-white">{item.value}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] text-alp-muted uppercase">
              <Database size={11} /> Champs prêts en base (calendar_events)
            </p>
            <div className="overflow-hidden rounded-lg border border-white/8">
              {info.readyFields.map((field) => (
                <div
                  key={field}
                  className="flex items-center justify-between gap-3 border-b border-white/6 bg-white/[0.02] px-2.5 py-1.5 last:border-b-0"
                >
                  <code className="font-mono text-[10.5px] text-alp-green-soft">{field}</code>
                  <span className="text-right text-[9.5px] text-alp-dim">
                    {FIELD_HELP[field] ?? "—"}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[9.5px] leading-relaxed text-alp-dim">
              Contrainte d&apos;unicité sur <code>source + external_id</code> et sur la clé
              externe : les futurs imports ne créeront pas de doublons.
            </p>
          </div>

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] text-alp-muted uppercase">
              <ShieldCheck size={11} /> Variables d&apos;environnement attendues
            </p>
            {info.missingEnvironment.length === 0 ? (
              <p className="flex items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.02] px-2.5 py-2 text-[11px] text-alp-green-soft">
                <CheckCircle2 size={12} /> Variables présentes côté serveur.
              </p>
            ) : (
              <ul className="space-y-1">
                {info.missingEnvironment.map((variable) => (
                  <li
                    key={variable}
                    className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-2.5 py-1.5"
                  >
                    <XCircle size={11} className="text-amber-300" />
                    <code className="font-mono text-[10.5px] text-white/80">{variable}</code>
                    <span className="ml-auto text-[9px] text-alp-dim">non défini</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-[9.5px] leading-relaxed text-alp-dim">
            Dernière activité locale :{" "}
            {info.lastLocalActivity ? formatParisDateTime(info.lastLocalActivity) : "aucune"}. Aucun
            appel réseau vers HubSpot n&apos;est effectué par cette interface.
          </p>
        </div>
      ) : null}
    </Modal>
  );
}
