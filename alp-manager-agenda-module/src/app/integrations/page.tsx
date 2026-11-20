import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  Database,
  KeyRound,
  Plug,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { AppShell } from "@/components/shell/AppShell";
import { getExternalSyncInfo } from "@/lib/events-service";
import { formatParisDateTime } from "@/lib/time";
import { getCurrentUser, listCollaborators } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Intégrations — ALP Manager",
};

const FIELDS = [
  ["source", "local · hubspot · outlook", "Origine de l'événement"],
  ["external_id", "identifiant externe", "Clé métier de l'objet source"],
  ["external_object_type", "task · deal · contact · project · custom", "Type d'objet HubSpot"],
  ["external_object_id", "identifiant d'objet", "Objet associé à l'événement"],
  ["external_url", "URL", "Lien direct vers la fiche HubSpot"],
  ["last_synced_at", "timestamptz", "Horodatage de la dernière synchronisation"],
  ["sync_status", "local · synced · pending · error", "État de synchronisation"],
  ["sync_direction", "inbound · outbound · both", "Sens de synchronisation"],
  ["recurrence_rule", "RRULE iCalendar", "Récurrence compatible Outlook"],
  ["external_unique_key", "unique", "Anti-doublon global pour les imports"],
];

export default async function IntegrationsPage() {
  const [user, collaborators, info] = await Promise.all([
    getCurrentUser(),
    listCollaborators(),
    getExternalSyncInfo(),
  ]);

  return (
    <AppShell user={user} collaborators={collaborators} syncConfigured={info.configured}>
      <div className="space-y-4 px-3 py-4 sm:px-4 lg:px-6">
        <header className="glass rounded-2xl px-4 py-3.5">
          <p className="text-[9.5px] font-semibold tracking-[0.24em] text-alp-green/80 uppercase">
            ALP Manager · connecteurs
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-[22px] font-black tracking-[0.18em] text-white uppercase">
            <Plug size={19} className="text-alp-green" /> Intégrations
          </h1>
          <p className="mt-1 max-w-3xl text-[11.5px] leading-relaxed text-alp-muted">
            Le module Agenda est prêt pour une future synchronisation HubSpot et Outlook.
            Aucune connexion n&apos;est simulée : tant que le connecteur n&apos;est pas livré,
            aucun événement externe n&apos;est importé et aucune tâche HubSpot n&apos;est inventée.
          </p>
        </header>

        <section
          className={`glass rounded-2xl border p-4 ${
            info.configured ? "border-alp-green/25" : "border-amber-400/20"
          }`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              {info.configured ? (
                <CheckCircle2 size={20} className="mt-0.5 text-alp-green" />
              ) : (
                <TriangleAlert size={20} className="mt-0.5 text-amber-300" />
              )}
              <div>
                <h2 className="text-[13px] font-semibold text-white">HubSpot</h2>
                <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-white/70">
                  {info.message}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="rounded border border-white/10 px-2 py-0.5 text-[9.5px] text-alp-muted">
                    Événements externes : {info.externalEventCount}
                  </span>
                  <span className="rounded border border-white/10 px-2 py-0.5 text-[9.5px] text-alp-muted">
                    En attente : {info.pendingCount}
                  </span>
                  <span className="rounded border border-white/10 px-2 py-0.5 text-[9.5px] text-alp-muted">
                    Dernière activité locale :{" "}
                    {info.lastLocalActivity
                      ? formatParisDateTime(info.lastLocalActivity)
                      : "aucune"}
                  </span>
                </div>
              </div>
            </div>
            <Link
              href="/agenda"
              className="inline-flex items-center gap-1.5 rounded-lg border border-alp-green/30 bg-alp-green/10 px-2.5 py-1.5 text-[11px] font-medium text-alp-green-soft transition hover:bg-alp-green/20"
            >
              Retour à l&apos;agenda <ArrowUpRight size={12} />
            </Link>
          </div>
        </section>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className="glass overflow-hidden rounded-2xl">
            <div className="border-b border-white/8 px-4 py-3">
              <h2 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.16em] text-white uppercase">
                <Database size={13} className="text-alp-green" /> Schéma prêt pour la synchronisation
              </h2>
              <p className="mt-1 text-[10.5px] text-alp-muted">
                Table <code className="text-alp-green-soft">calendar_events</code> — colonnes
                facultatives pour les événements locaux.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/8 bg-white/[0.03]">
                    <th className="px-3 py-1.5 text-[9px] font-semibold tracking-[0.14em] text-alp-dim uppercase">
                      Colonne
                    </th>
                    <th className="px-3 py-1.5 text-[9px] font-semibold tracking-[0.14em] text-alp-dim uppercase">
                      Valeurs
                    </th>
                    <th className="hidden px-3 py-1.5 text-[9px] font-semibold tracking-[0.14em] text-alp-dim uppercase sm:table-cell">
                      Rôle
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {FIELDS.map(([field, values, role]) => (
                    <tr key={field} className="border-b border-white/5 last:border-b-0">
                      <td className="px-3 py-1.5">
                        <code className="font-mono text-[10px] text-alp-green-soft">{field}</code>
                      </td>
                      <td className="px-3 py-1.5 text-[10px] text-white/70">{values}</td>
                      <td className="hidden px-3 py-1.5 text-[10px] text-alp-dim sm:table-cell">
                        {role}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="space-y-3">
            <section className="glass rounded-2xl p-4">
              <h2 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.16em] text-white uppercase">
                <KeyRound size={13} className="text-amber-300" /> Configuration attendue
              </h2>
              <p className="mt-1 text-[10.5px] leading-relaxed text-alp-muted">
                Aucune variable n&apos;est requise pour utiliser l&apos;agenda. Pour activer
                ultérieurement le connecteur, les secrets suivants devront être fournis côté
                serveur (jamais exposés au navigateur) :
              </p>
              <ul className="mt-2 space-y-1.5">
                {["HUBSPOT_PRIVATE_APP_TOKEN", "HUBSPOT_PORTAL_ID"].map((variable) => (
                  <li
                    key={variable}
                    className="flex items-center gap-2 rounded-lg border border-white/8 bg-white/[0.02] px-2.5 py-1.5"
                  >
                    <code className="font-mono text-[10.5px] text-white/80">{variable}</code>
                    <span
                      className={`ml-auto text-[9px] ${
                        info.missingEnvironment.includes(variable)
                          ? "text-amber-300"
                          : "text-alp-green"
                      }`}
                    >
                      {info.missingEnvironment.includes(variable) ? "non défini" : "défini"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="glass rounded-2xl p-4">
              <h2 className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.16em] text-white uppercase">
                <ShieldCheck size={13} className="text-alp-green" /> Garde-fous
              </h2>
              <ul className="mt-1.5 space-y-1.5 text-[10.5px] leading-relaxed text-alp-muted">
                <li>• Contrainte unique sur <code>source + external_id</code> et clé externe dédiée.</li>
                <li>• Les événements locaux restent <code>source = local</code> et ne sont jamais supprimés par un import.</li>
                <li>• Récurrences stockées en RRULE iCalendar, compatibles Outlook.</li>
                <li>• Aucune donnée HubSpot inventée : l&apos;interface est préparée, pas simulée.</li>
                <li>• Pas de RLS : la base est PostgreSQL local, l&apos;accès est contrôlé côté serveur.</li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
