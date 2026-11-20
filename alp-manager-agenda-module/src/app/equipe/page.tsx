import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, gte, ne, sql } from "drizzle-orm";
import { ArrowUpRight, CheckCircle2, ShieldCheck, Users } from "lucide-react";

import { AppShell } from "@/components/shell/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { db } from "@/db";
import { calendarEvents } from "@/db/schema";
import { canCreateEvents, canManageAll, roleLabel } from "@/lib/agenda-config";
import { getCurrentUser, listCollaborators } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Équipe — ALP Manager",
};

const PERMISSIONS = [
  {
    role: "admin",
    label: "Administrateur",
    can: "Créer, modifier et supprimer tous les événements, y compris privés.",
  },
  {
    role: "manager",
    label: "Manager",
    can: "Gérer tous les événements de l'équipe et consulter les événements privés.",
  },
  {
    role: "collaborateur",
    label: "Collaborateur",
    can: "Créer des événements et modifier ceux dont il est responsable, auteur ou participant.",
  },
  {
    role: "lecture",
    label: "Lecture seule",
    can: "Consulter l'agenda partagé, sans création ni modification.",
  },
];

export default async function TeamPage() {
  const [user, collaborators] = await Promise.all([getCurrentUser(), listCollaborators()]);
  const now = new Date();

  const counts = await db
    .select({
      userId: calendarEvents.assignedTo,
      total: sql<number>`count(*)::int`,
      upcoming: sql<number>`count(*) filter (where ${calendarEvents.endAt} >= ${now.toISOString()} and ${calendarEvents.status} <> 'annule')::int`,
      late: sql<number>`count(*) filter (where ${calendarEvents.endAt} < ${now.toISOString()} and ${calendarEvents.status} in ('a_venir','en_cours'))::int`,
    })
    .from(calendarEvents)
    .where(and(ne(calendarEvents.status, "annule"), gte(calendarEvents.endAt, new Date(now.getTime() - 90 * 24 * 3600_000))))
    .groupBy(calendarEvents.assignedTo);

  const countMap = new Map(
    counts
      .filter((row) => row.userId !== null)
      .map((row) => [row.userId as number, row]),
  );

  const syncConfigured = Boolean(
    process.env.HUBSPOT_PRIVATE_APP_TOKEN || process.env.HUBSPOT_API_KEY,
  );

  return (
    <AppShell user={user} collaborators={collaborators} syncConfigured={syncConfigured}>
      <div className="space-y-4 px-3 py-4 sm:px-4 lg:px-6">
        <header className="glass rounded-2xl px-4 py-3.5">
          <p className="text-[9.5px] font-semibold tracking-[0.24em] text-alp-green/80 uppercase">
            ALP Manager · collaborateurs
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-[22px] font-black tracking-[0.18em] text-white uppercase">
            <Users size={19} className="text-alp-green" /> Équipe
          </h1>
          <p className="mt-1 text-[11.5px] text-alp-muted">
            Les utilisateurs de l&apos;agenda sont ceux du système de collaborateurs ALP Manager :
            aucun second système d&apos;authentification n&apos;a été créé.
          </p>
        </header>

        <section className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {collaborators.map((collaborator) => {
            const stats = countMap.get(collaborator.id);
            const isCurrent = collaborator.id === user.id;
            return (
              <article
                key={collaborator.id}
                className={`glass rounded-2xl p-3.5 transition hover:border-white/20 ${
                  isCurrent ? "border-alp-green/30 shadow-[0_0_0_1px_rgba(62,224,125,0.15)]" : ""
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <Avatar user={collaborator} size={40} />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[13px] font-semibold text-white">
                      {collaborator.name}
                      {isCurrent ? (
                        <span className="ml-1.5 rounded-full bg-alp-green/15 px-1.5 py-0.5 text-[8.5px] font-semibold tracking-wide text-alp-green-soft uppercase">
                          vous
                        </span>
                      ) : null}
                    </h2>
                    <p className="truncate text-[10.5px] text-alp-muted">
                      {collaborator.jobTitle ?? roleLabel(collaborator.role)}
                    </p>
                    <p className="truncate text-[10px] text-alp-dim">{collaborator.email}</p>
                  </div>
                </div>
                <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                  {[
                    { label: "À venir", value: stats?.upcoming ?? 0, tone: "text-alp-green" },
                    { label: "En retard", value: stats?.late ?? 0, tone: "text-red-300" },
                    { label: "Total", value: stats?.total ?? 0, tone: "text-white" },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-lg border border-white/7 bg-white/[0.025] px-2 py-1.5"
                    >
                      <p className="text-[8.5px] tracking-[0.12em] text-alp-dim uppercase">
                        {item.label}
                      </p>
                      <p className={`text-[14px] font-semibold ${item.tone}`}>{item.value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 rounded border border-white/10 px-1.5 py-0.5 text-[9px] text-alp-muted">
                    {canManageAll(collaborator.role) ? (
                      <ShieldCheck size={10} className="text-alp-green" />
                    ) : canCreateEvents(collaborator.role) ? (
                      <CheckCircle2 size={10} className="text-cyan-300" />
                    ) : (
                      <Users size={10} />
                    )}
                    {roleLabel(collaborator.role)}
                  </span>
                  <Link
                    href={`/agenda?collaborateur=${collaborator.id}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[10px] font-medium text-white/75 transition hover:border-alp-green/30 hover:text-alp-green-soft"
                  >
                    Voir son agenda <ArrowUpRight size={10} />
                  </Link>
                </div>
              </article>
            );
          })}
        </section>

        <section className="glass rounded-2xl p-4">
          <h2 className="text-[11px] font-semibold tracking-[0.18em] text-white uppercase">
            Règles d&apos;accès du module Agenda
          </h2>
          <p className="mt-1 text-[10.5px] text-alp-muted">
            Les règles sont appliquées côté serveur (API events) et reflétées dans l&apos;interface.
            Les événements privés ne sont visibles que par leur auteur, leur responsable, leurs
            participants et les administrateurs/managers.
          </p>
          <div className="mt-2.5 overflow-hidden rounded-xl border border-white/8">
            {PERMISSIONS.map((permission) => (
              <div
                key={permission.role}
                className="flex flex-col gap-1 border-b border-white/6 bg-white/[0.02] px-3 py-2 last:border-b-0 sm:flex-row sm:items-center sm:gap-3"
              >
                <span className="w-32 shrink-0 text-[11px] font-medium text-white">
                  {permission.label}
                </span>
                <span className="text-[10.5px] text-alp-muted">{permission.can}</span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[9.5px] text-alp-dim">
            Vous êtes connecté en tant que <strong className="text-white/80">{user.name}</strong> (
            {roleLabel(user.role)}). Utilisez le sélecteur en bas de la barre latérale pour changer de
            collaborateur — il n&apos;existe qu&apos;une seule source d&apos;utilisateurs.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
