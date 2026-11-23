"use client";

import type { ReactNode } from "react";
import {
  Building2,
  CalendarDays,
  House,
  LogOut,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { AssistantLauncher } from "@/components/assistant/assistant-launcher";
import { AssistantProvider } from "@/components/assistant/assistant-context";
import { ROLE_LABELS } from "@/lib/calendar/constants";
import type { CalendarUser } from "@/lib/calendar/types";

type AppShellProps = {
  children: ReactNode;
  currentUser: CalendarUser;
};

const NAV_ITEMS = [
  { href: "/", label: "Accueil", icon: House },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/crm", label: "CRM", icon: Building2 },
  { href: "/assistant", label: "Assistant", icon: Sparkles },
];

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function AppShell({ children, currentUser }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  async function logout() {
    setLogoutError(null);
    setIsLoggingOut(true);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });

      if (!response.ok) {
        setLogoutError("La déconnexion a échoué. Réessayez.");
        setIsLoggingOut(false);
        return;
      }

      router.replace("/login");
      router.refresh();
    } catch {
      setLogoutError("Connexion au serveur impossible.");
      setIsLoggingOut(false);
    }
  }

  return (
    <AssistantProvider>
      <div className="min-h-screen">
        <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-alp-carbon/75 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-[1680px] items-center gap-2 px-3 sm:gap-3 sm:px-4 lg:px-6">
            <Link href="/" className="group flex shrink-0 items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-alp-green text-[13px] font-black tracking-tight text-alp-ink shadow-[0_8px_24px_rgba(61,220,132,0.35)] transition group-hover:scale-105">
                ALP
              </span>
              <span className="hidden leading-none lg:block">
                <span className="block text-[15px] font-semibold tracking-wide text-white">
                  ALP Manager
                </span>
                <span className="mt-1 block text-[10px] uppercase tracking-[0.22em] text-zinc-500">
                  Racing Suspension
                </span>
              </span>
            </Link>

            <nav
              className="ml-1 flex items-center gap-0.5 sm:ml-4 sm:gap-1 lg:ml-6"
              aria-label="Navigation principale"
            >
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors sm:px-3 ${
                      active
                        ? "bg-white/[0.08] text-white"
                        : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 ${active ? "text-alp-green" : ""}`}
                      aria-hidden
                    />
                    <span className="hidden md:inline">{item.label}</span>
                    {active && (
                      <span className="absolute inset-x-3 -bottom-[13px] h-[2px] rounded-full bg-alp-green shadow-[0_0_12px_rgba(61,220,132,0.8)]" />
                    )}
                  </Link>
                );
              })}
            </nav>

            <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
              <div className="flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] py-1.5 pl-1.5 pr-2 sm:gap-2.5 sm:pr-3">
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[11px] font-bold text-alp-ink"
                  style={{ background: currentUser.color }}
                  aria-hidden
                >
                  {initialsOf(currentUser.fullName)}
                </span>

                <span className="hidden min-w-0 flex-col leading-tight sm:flex">
                  <span className="max-w-[150px] truncate text-sm font-medium text-zinc-100">
                    {currentUser.fullName}
                  </span>
                  <span className="mt-1 text-[10px] uppercase tracking-[0.12em] text-zinc-500">
                    {ROLE_LABELS[currentUser.role]}
                  </span>
                </span>
              </div>

              <button
                type="button"
                onClick={logout}
                disabled={isLoggingOut}
                title="Déconnexion"
                aria-label="Déconnexion"
                className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm text-zinc-300 transition hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-wait disabled:opacity-50"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                <span className="hidden lg:inline">
                  {isLoggingOut ? "Déconnexion..." : "Déconnexion"}
                </span>
              </button>
            </div>
          </div>

          {logoutError && (
            <div className="alp-fade flex items-center gap-2 border-t border-red-500/20 bg-red-500/10 px-4 py-2 text-sm text-red-200">
              <TriangleAlert className="h-4 w-4" aria-hidden />
              {logoutError}
            </div>
          )}
        </header>

        {children}
      </div>
      <AssistantLauncher />
    </AssistantProvider>
  );
}
