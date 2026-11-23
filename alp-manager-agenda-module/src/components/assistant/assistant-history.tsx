"use client";

import { MessageSquare, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { apiRequest, errorMessage } from "@/lib/calendar/client";

type ConversationItem = { id: string; title: string; lastMessageAt: string };

type Props = {
  activeId: string | null;
  onSelect: (id: string | null) => void;
  refreshKey: number;
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Historique des conversations de l'utilisateur, avec nouvelle conversation et suppression. */
export function AssistantHistory({ activeId, onSelect, refreshKey }: Props) {
  const [items, setItems] = useState<ConversationItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    apiRequest<{ conversations: ConversationItem[] }>("/api/assistant/conversations", { signal: controller.signal })
      .then((res) => setItems(res.conversations))
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(err));
      });
    return () => controller.abort();
  }, [refreshKey]);

  async function remove(id: string) {
    try {
      await apiRequest(`/api/assistant/conversations/${id}`, { method: "DELETE" });
      setItems((prev) => prev?.filter((i) => i.id !== id) ?? null);
      if (activeId === id) onSelect(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <span className="alp-label">Historique</span>
        <button type="button" onClick={() => onSelect(null)} className="alp-btn h-8 px-2.5 text-xs">
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Nouvelle
        </button>
      </div>

      {error && <p className="mx-4 mb-2 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-200">{error}</p>}

      <ul className="alp-scroll min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {items === null &&
          [0, 1, 2].map((i) => (
            <li key={i} className="alp-skeleton mx-2 my-1 h-11 rounded-xl" />
          ))}
        {items?.length === 0 && (
          <li className="px-4 py-8 text-center text-xs text-zinc-500">Aucune conversation pour le moment.</li>
        )}
        {items?.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <div
                className={`group flex items-center gap-1 rounded-xl pr-1 transition-colors ${
                  active ? "bg-white/[0.08] ring-1 ring-alp-green/25" : "hover:bg-white/[0.04]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-current={active ? "true" : undefined}
                  className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left"
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-zinc-200">{item.title}</span>
                    <span className="block text-[10px] text-zinc-500">{formatWhen(item.lastMessageAt)}</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => remove(item.id)}
                  aria-label="Supprimer la conversation"
                  className="rounded-lg p-1.5 text-zinc-600 opacity-0 transition hover:bg-red-500/10 hover:text-red-300 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
