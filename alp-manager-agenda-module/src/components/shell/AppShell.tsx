"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import {
  CalendarDays,
  ChevronDown,
  FileText,
  Menu,
  Package,
  Plug,
  Settings,
  ShieldCheck,
  Users,
  Wrench,
  X,
} from "lucide-react";

import { Avatar } from "@/components/ui/Avatar";
import type { AgendaUser } from "@/lib/agenda-types";
import { roleLabel } from "@/lib/agenda-config";

const NAV_ITEMS = [
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/equipe", label: "Équipe", icon: Users },
  { href: "/integrations", label: "Intégrations", icon: Plug },
];

const OTHER_MODULES = [
  { label: "CRM & Devis", icon: FileText },
  { label: "Projets", icon: Settings },
  { label: "Atelier", icon: Wrench },
  { label: "Stock", icon: Package },
];

export function AlpLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-[#3ee07d] via-[#22c55e] to-[#0f7c3d] shadow-[0_10px_30px_-12px_rgba(62,224,125,0.7)]">
        <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden>
          <path d="M3 26 13 5h5L8.4 26H3Z" fill="#04150b" />
          <path d="M12.5 26 22 7h7l-9 19h-7.5Z" fill="#04150b" fillOpacity="0.72" />
          <path d="M4 20.5h13" stroke="#d9ffe6" strokeWidth="2.1" strokeLinecap="round" />
        </svg>
      </span>
      {!compact ? (
        <span className="leading-none">
          <span className="block text-[15px] font-black tracking-[0.24em] text-white">
            ALP
          </span>
          <span className="mt-1 block text-[8.5px] font-medium tracking-[0.34em] text-alp-green/80">
            RACING SUSPENSION
          </span>
        </span>
      ) : null}
    </span>
  );
}

function UserSwitcher({
  user,
  collaborators,
}: {
  user: AgendaUser;
  collaborators: AgendaUser[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const switchUser = (userId: number) => {
    setOpen(false);
    startTransition(async () => {
      await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      router.refresh();
    });
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.035] px-2.5 py-2 text-left transition hover:border-alp-green/30 hover:bg-white/[0.06]"
        aria-expanded={open}
      >
        <Avatar user={user} size={30} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium text-white">
            {user.name}
          </span>
          <span className="block truncate text-[10px] tracking-wide text-alp-muted">
            {roleLabel(user.role)}
            {pending ? " · mise à jour…" : ""}
          </span>
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-alp-muted transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <>
          <button
            className="fixed inset-0 z-20 cursor-default"
            aria-label="Fermer le sélecteur de collaborateur"
            onClick={() => setOpen(false)}
          />
          <div className="absolute bottom-full left-0 z-30 mb-2 w-full overflow-hidden rounded-xl border border-white/10 bg-[#0e1415] shadow-2xl animate-rise">
            <div className="border-b border-white/8 px-3 py-2 text-[9.5px] font-semibold tracking-[0.2em] text-alp-dim uppercase">
              Changer de collaborateur
            </div>
            <div className="max-h-64 overflow-y-auto scroll-thin p-1.5">
              {collaborators.map((collaborator) => (
                <button
                  key={collaborator.id}
                  onClick={() => switchUser(collaborator.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/8 ${
                    collaborator.id === user.id ? "bg-alp-green/10" : ""
                  }`}
                >
                  <Avatar user={collaborator} size={24} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] text-white">
                      {collaborator.name}
                    </span>
                    <span className="block truncate text-[10px] text-alp-dim">
                      {roleLabel(collaborator.role)}
                    </span>
                  </span>
                  {collaborator.id === user.id ? (
                    <ShieldCheck size={14} className="text-alp-green" />
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function AppShell({
  user,
  collaborators,
  syncConfigured,
  children,
}: {
  user: AgendaUser;
  collaborators: AgendaUser[];
  syncConfigured: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebar = (
    <div className="flex h-full flex-col gap-5 p-4">
      <div className="flex items-center justify-between">
        <Link href="/agenda" onClick={() => setMobileOpen(false)}>
          <AlpLogo />
        </Link>
        <button
          className="rounded-lg p-1.5 text-alp-muted hover:bg-white/8 hover:text-white lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Fermer le menu"
        >
          <X size={18} />
        </button>
      </div>

      <div className="rounded-xl border border-white/7 bg-gradient-to-br from-white/[0.05] to-transparent p-3">
        <div className="flex items-center gap-2 text-[10px] font-semibold tracking-[0.18em] text-alp-muted uppercase">
          <span className="h-1.5 w-1.5 rounded-full bg-alp-green shadow-[0_0_10px_2px_rgba(62,224,125,0.55)]" />
          ALP Manager
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-alp-dim">
          Agenda commun de l&apos;équipe ALP Racing Suspension.
        </p>
      </div>

      <nav className="space-y-1">
        <p className="px-2 pb-1 text-[9.5px] font-semibold tracking-[0.2em] text-alp-dim uppercase">
          Espace de travail
        </p>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] transition ${
                active
                  ? "bg-alp-green/12 text-white shadow-[inset_0_0_0_1px_rgba(62,224,125,0.25)]"
                  : "text-alp-muted hover:bg-white/6 hover:text-white"
              }`}
            >
              <Icon
                size={16}
                className={active ? "text-alp-green" : "text-alp-dim group-hover:text-alp-green/80"}
              />
              <span className="flex-1">{item.label}</span>
              {active ? <span className="h-1.5 w-1.5 rounded-full bg-alp-green" /> : null}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1">
        <p className="px-2 pb-1 text-[9.5px] font-semibold tracking-[0.2em] text-alp-dim uppercase">
          Modules ALP
        </p>
        {OTHER_MODULES.map((module) => {
          const Icon = module.icon;
          return (
            <div
              key={module.label}
              title="Module existant d'ALP Manager — non modifié par le module Agenda"
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12px] text-alp-dim/80"
            >
              <Icon size={15} className="text-alp-dim/70" />
              <span className="flex-1">{module.label}</span>
              <span className="rounded border border-white/8 px-1 py-0.5 text-[8.5px] tracking-wide text-alp-dim">
                existant
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-auto space-y-2.5">
        <Link
          href="/integrations"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-2 rounded-lg border border-white/7 bg-white/[0.025] px-2.5 py-2 transition hover:border-white/15"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              syncConfigured ? "bg-alp-green" : "bg-amber-400"
            }`}
          />
          <span className="flex-1 text-[10.5px] leading-tight text-alp-muted">
            HubSpot : {syncConfigured ? "connecteur prêt" : "non connecté"}
          </span>
          <Plug size={13} className="text-alp-dim" />
        </Link>
        <UserSwitcher user={user} collaborators={collaborators} />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-alp-black">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute -top-40 left-1/4 h-[420px] w-[420px] rounded-full bg-alp-green/8 blur-[130px]" />
        <div className="absolute bottom-0 right-0 h-[380px] w-[380px] rounded-full bg-cyan-500/5 blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.045),transparent_45%)]" />
      </div>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] border-r border-white/7 bg-[#080c0d]/80 backdrop-blur-xl lg:block">
        {sidebar}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-label="Fermer le menu"
          />
          <aside className="animate-slide-right absolute inset-y-0 left-0 w-[86%] max-w-[290px] border-r border-white/10 bg-[#080c0d]">
            {sidebar}
          </aside>
        </div>
      ) : null}

      <div className="relative z-10 lg:pl-[252px]">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/7 bg-[#080c0d]/85 px-4 py-2.5 backdrop-blur-xl lg:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg border border-white/8 p-1.5 text-alp-muted hover:text-white"
            aria-label="Ouvrir le menu"
          >
            <Menu size={18} />
          </button>
          <AlpLogo compact />
          <span className="text-[11px] font-semibold tracking-[0.22em] text-white uppercase">
            Agenda
          </span>
          <span className="ml-auto flex items-center gap-2">
            <Avatar user={user} size={26} />
          </span>
        </div>
        <main className="min-h-screen">{children}</main>
      </div>
    </div>
  );
}
