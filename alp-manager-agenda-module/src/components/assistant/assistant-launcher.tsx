"use client";

import { History, Maximize2, Plus, Sparkles, Sun, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AssistantChat } from "./assistant-chat";
import { useAssistant } from "./assistant-context";
import { AssistantHistory } from "./assistant-history";

/** Bouton flottant permanent et panneau latéral : ouvrables sans quitter la page en cours. */
export function AssistantLauncher() {
  const { open, prefill, openAssistant, closeAssistant, toggleAssistant, consumePrefill } = useAssistant();
  const pathname = usePathname();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [historyKey, setHistoryKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAssistant();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeAssistant]);

  // Sur la page dédiée, l'espace de travail remplace le panneau.
  if (pathname === "/assistant") return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={toggleAssistant}
          aria-label="Ouvrir l'assistant ALP"
          className="group fixed bottom-6 right-6 z-[55] flex h-14 items-center gap-2 rounded-2xl bg-alp-green pl-4 pr-5 text-sm font-semibold text-alp-ink shadow-[0_12px_40px_rgba(61,220,132,0.45)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_50px_rgba(61,220,132,0.55)]"
        >
          <Sparkles className="h-5 w-5 transition-transform group-hover:rotate-12" aria-hidden />
          <span className="hidden sm:inline">Assistant</span>
        </button>
      )}

      {open && (
        <>
          <button
            type="button"
            aria-label="Fermer l'assistant"
            onClick={closeAssistant}
            className="alp-fade fixed inset-0 z-[58] bg-black/35 backdrop-blur-[2px] sm:hidden"
          />
          <aside
            role="dialog"
            aria-label="Assistant ALP"
            className="alp-glass-strong alp-rise fixed inset-y-0 right-0 z-[59] flex w-full flex-col border-l border-white/10 sm:w-[470px]"
          >
            <header className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-alp-green text-alp-ink">
                <Sparkles className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">Assistant ALP</p>
                <p className="truncate text-[11px] text-zinc-500">Copilote commercial et organisationnel</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setView("chat");
                  openAssistant("Prépare-moi ma journée.");
                }}
                className="alp-btn h-8 px-2.5 text-xs"
                title="Briefing du jour"
              >
                <Sun className="h-3.5 w-3.5 text-alp-green" aria-hidden />
                Briefing
              </button>
              <button
                type="button"
                onClick={() => setView((v) => (v === "history" ? "chat" : "history"))}
                aria-label="Historique des conversations"
                aria-pressed={view === "history"}
                className="alp-btn alp-btn-icon h-8 w-8"
              >
                <History className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => {
                  setConversationId(null);
                  setView("chat");
                }}
                aria-label="Nouvelle conversation"
                className="alp-btn alp-btn-icon h-8 w-8"
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
              <Link
                href="/assistant"
                onClick={closeAssistant}
                aria-label="Ouvrir en plein écran"
                className="alp-btn alp-btn-icon hidden h-8 w-8 sm:inline-flex"
              >
                <Maximize2 className="h-4 w-4" aria-hidden />
              </Link>
              <button type="button" onClick={closeAssistant} aria-label="Fermer" className="alp-btn alp-btn-icon h-8 w-8">
                <X className="h-4 w-4" aria-hidden />
              </button>
            </header>

            {view === "history" ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <AssistantHistory
                  activeId={conversationId}
                  refreshKey={historyKey}
                  onSelect={(id) => {
                    setConversationId(id);
                    setView("chat");
                  }}
                />
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <AssistantChat
                  variant="panel"
                  conversationId={conversationId}
                  onConversationChange={setConversationId}
                  onHistoryChanged={() => setHistoryKey((k) => k + 1)}
                  prefill={prefill}
                  onPrefillConsumed={consumePrefill}
                />
              </div>
            )}
          </aside>
        </>
      )}
    </>
  );
}
