"use client";

import { Search, UserRound, X } from "lucide-react";
import { CATEGORY_KEYS, CATEGORIES, ROLE_LABELS, type CategoryKey } from "@/lib/calendar/constants";
import type { CalendarUser } from "@/lib/calendar/types";
import { Avatar, CategoryIcon, tint } from "./bits";

type Props = {
  categoryCounts: Record<CategoryKey, number>;
  enabledCategories: Set<CategoryKey>;
  onToggleCategory: (key: CategoryKey) => void;
  onSetAllCategories: (enabled: boolean) => void;
  users: CalendarUser[];
  currentUserId: string;
  selectedUserId: string | null;
  onSelectUser: (userId: string | null) => void;
  query: string;
  onQueryChange: (value: string) => void;
  filtersActive: boolean;
  onReset: () => void;
};

export function AgendaFilters({
  categoryCounts,
  enabledCategories,
  onToggleCategory,
  onSetAllCategories,
  users,
  currentUserId,
  selectedUserId,
  onSelectUser,
  query,
  onQueryChange,
  filtersActive,
  onReset,
}: Props) {
  return (
    <div className="alp-glass space-y-6 rounded-3xl p-4 sm:p-5">
      {/* Recherche */}
      <div>
        <label htmlFor="agenda-search" className="alp-label mb-2 block">
          Recherche
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
          <input
            id="agenda-search"
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Titre, description, collaborateur…"
            className="alp-input pl-9 pr-9"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Effacer la recherche"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-zinc-500 hover:text-zinc-200"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* Catégories */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="alp-label">Catégories</span>
          <span className="flex gap-2 text-[11px] font-medium">
            <button type="button" onClick={() => onSetAllCategories(true)} className="text-zinc-400 hover:text-alp-green">
              Tout
            </button>
            <span className="text-zinc-700">/</span>
            <button type="button" onClick={() => onSetAllCategories(false)} className="text-zinc-400 hover:text-alp-green">
              Aucun
            </button>
          </span>
        </div>
        <ul className="space-y-1">
          {CATEGORY_KEYS.map((key) => {
            const enabled = enabledCategories.has(key);
            const meta = CATEGORIES[key];
            return (
              <li key={key}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  onClick={() => onToggleCategory(key)}
                  className={`group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                    enabled ? "hover:bg-white/[0.04]" : "opacity-45 hover:opacity-70"
                  }`}
                >
                  <span
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors"
                    style={{
                      borderColor: enabled ? meta.color : "rgba(255,255,255,0.15)",
                      background: enabled ? tint(meta.color, 40) : "transparent",
                    }}
                    aria-hidden
                  >
                    {enabled && <span className="h-2 w-2 rounded-sm" style={{ background: meta.color }} />}
                  </span>
                  <CategoryIcon category={key} className="h-3.5 w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-zinc-200">{meta.label}</span>
                  <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-zinc-400">
                    {categoryCounts[key] ?? 0}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Collaborateurs */}
      <div>
        <span className="alp-label mb-2 block">Collaborateur</span>
        <div className="mb-2 flex gap-2">
          <button
            type="button"
            onClick={() => onSelectUser(null)}
            className={`alp-btn h-8 flex-1 px-2 text-xs ${selectedUserId === null ? "!border-alp-green/50 !text-alp-green" : ""}`}
          >
            Tous
          </button>
          <button
            type="button"
            onClick={() => onSelectUser(selectedUserId === currentUserId ? null : currentUserId)}
            className={`alp-btn h-8 flex-1 px-2 text-xs ${selectedUserId === currentUserId ? "!border-alp-green/50 !text-alp-green" : ""}`}
          >
            <UserRound className="h-3.5 w-3.5" aria-hidden />
            Moi
          </button>
        </div>
        <ul className="alp-scroll max-h-56 space-y-1 overflow-y-auto pr-1">
          {users.map((u) => {
            const selected = selectedUserId === u.id;
            return (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => onSelectUser(selected ? null : u.id)}
                  aria-pressed={selected}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${
                    selected ? "bg-alp-green/10 ring-1 ring-alp-green/40" : "hover:bg-white/[0.04]"
                  }`}
                >
                  <Avatar user={u} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-zinc-100">{u.fullName}</span>
                    <span className="block truncate text-[10px] uppercase tracking-wider text-zinc-500">
                      {ROLE_LABELS[u.role]}
                      {u.jobTitle ? ` · ${u.jobTitle}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {filtersActive && (
        <button type="button" onClick={onReset} className="alp-btn w-full text-xs">
          Réinitialiser les filtres
        </button>
      )}
    </div>
  );
}
