
import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  Users,
  Handshake,
  ClipboardList,
  FolderKanban,
  MessageSquare,
  Settings,
  Activity,
  Gauge,
  Package,
  ChevronRight,
} from "lucide-react";

const stats = [
  {
    label: "Clients",
    description: "Base de données commerciale",
    icon: Users,
    href: "/crm",
  },
  {
    label: "Opportunités",
    description: "Suivi des transactions",
    icon: Handshake,
    href: "/crm",
  },
  {
    label: "Tâches",
    description: "Actions à réaliser",
    icon: ClipboardList,
    href: "/agenda",
  },
  {
    label: "Projets",
    description: "Suivi des dossiers",
    icon: FolderKanban,
    href: "/projets",
  },
];

const shortcuts = [
  {
    label: "Agenda",
    description: "Gérer les rendez-vous et événements",
    icon: CalendarDays,
    href: "/agenda",
  },
  {
    label: "CRM commercial",
    description: "Accéder aux contacts et opportunités",
    icon: Users,
    href: "/crm",
  },
  {
    label: "Gestion des projets",
    description: "Suivre les dossiers en cours",
    icon: FolderKanban,
    href: "/projets",
  },
  {
    label: "Assistant IA",
    description: "Interroger votre assistant professionnel",
    icon: MessageSquare,
    href: "/assistant",
  },
];

export default function HomePage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-[1680px] px-4 py-8 sm:px-6 lg:px-8">

      {/* En-tête */}
      <section className="alp-rise mb-8 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-alp-green alp-pulse-dot" />
            <span className="alp-label text-alp-green">
              Espace de travail ALP Racing
            </span>
          </div>

          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Tableau de bord
          </h1>

          <p className="mt-2 text-sm text-zinc-400">
            Pilotez votre activité commerciale et opérationnelle.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
          <Activity className="h-4 w-4 text-alp-green" />
          <span className="text-xs text-zinc-300">
            Espace de gestion interne
          </span>
        </div>
      </section>

      {/* Indicateurs */}
      <section className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">
            Vue d'ensemble
          </h2>
          <span className="text-xs text-zinc-500">
            Données à connecter
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat, index) => {
            const Icon = stat.icon;

            return (
              <Link
                key={stat.label}
                href={stat.href}
                className="alp-glass group rounded-2xl p-5 transition duration-200 hover:-translate-y-1 hover:border-alp-green/30"
              >
                <div className="flex items-start justify-between">
                  <div className="grid h-10 w-10 place-items-center rounded-xl bg-alp-green/10">
                    <Icon className="h-5 w-5 text-alp-green" />
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-zinc-600 transition group-hover:text-alp-green" />
                </div>

                <div className="mt-5">
                  <p className="text-sm text-zinc-400">{stat.label}</p>
                  <p className="mt-1 text-2xl font-semibold text-white">
                    —
                  </p>
                  <p className="mt-2 text-xs text-zinc-500">
                    {stat.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Zone principale */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">

        {/* Accès rapides */}
        <section className="alp-glass rounded-2xl p-5 xl:col-span-2">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-white">
                Accès rapides
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Retrouvez vos principaux outils.
              </p>
            </div>
            <Gauge className="h-5 w-5 text-alp-green" />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {shortcuts.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className="group flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.025] p-4 transition hover:border-alp-green/30 hover:bg-white/[0.05]"
                >
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/[0.05] transition group-hover:bg-alp-green/10">
                    <Icon className="h-5 w-5 text-zinc-400 group-hover:text-alp-green" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-100">
                      {item.label}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {item.description}
                    </p>
                  </div>

                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600 transition group-hover:translate-x-1 group-hover:text-alp-green" />
                </Link>
              );
            })}
          </div>
        </section>

        {/* Informations */}
        <section className="alp-glass rounded-2xl p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-alp-green/10">
              <Package className="h-5 w-5 text-alp-green" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">
                ALP Racing
              </h2>
              <p className="text-xs text-zinc-500">
                Suspension & Motorsport
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="border-t border-white/[0.07] pt-4">
              <p className="alp-label">Environnement</p>
              <p className="mt-2 text-sm text-zinc-300">
                Gestion commerciale et opérationnelle
              </p>
            </div>

            <div className="border-t border-white/[0.07] pt-4">
              <p className="alp-label">Modules</p>
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">Agenda</span>
                  <span className="text-alp-green">Disponible</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">Assistant IA</span>
                  <span className="text-alp-green">Interface disponible</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">CRM HubSpot</span>
                  <span className="text-zinc-500">À vérifier</span>
                </div>
              </div>
            </div>

            <div className="border-t border-white/[0.07] pt-4">
              <p className="text-xs leading-relaxed text-zinc-500">
                Les indicateurs commerciaux seront alimentés par les données
                réelles de vos outils connectés.
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Pied de page */}
      <footer className="mt-8 flex flex-col justify-between gap-2 border-t border-white/[0.06] pt-5 sm:flex-row">
        <p className="text-xs text-zinc-600">
          ALP Manager · ALP Racing Suspension
        </p>
        <p className="text-xs text-zinc-600">
          Espace de travail interne
        </p>
      </footer>
    </main>
  );
}
