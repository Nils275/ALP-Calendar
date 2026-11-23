"use client";

import { History, Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import { AssistantChat } from "./assistant-chat";
import { AssistantHistory } from "./assistant-history";

/** Espace de travail plein écran : historique à gauche, conversation à droite. */
export function AssistantWorkspace() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [mobileHistory, setMobileHistory] = useState(false);

  return (
    <div className="mx-auto grid h-[calc(100dvh-4rem)] max-w-[1400px] gap-4 p-3 sm:p-5 lg:grid-cols-[290px_minmax(0,1fr)]">
      <aside className="alp-glass hidden min-h-0 flex-col overflow-hidden rounded-3xl lg:flex">
        <AssistantHistory
          activeId={conversationId}
          refreshKey={historyKey}
          onSelect={(id) => setConversationId(id)}
        />
      </aside>

      <section className="alp-glass flex min-h-0 flex-col overflow-hidden rounded-3xl">
        <header className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3.5 sm:px-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-alp-green/15 ring-1 ring-alp-green/30">
            <Sparkles className="h-5 w-5 text-alp-green" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold text-white">Assistant ALP</h1>
            <p className="truncate text-[11px] text-zinc-500">Copilote commercial et organisationnel · heure de Paris</p>
          </div>
          <button
            type="button"
            onClick={() => setMobileHistory((v) => !v)}
            aria-pressed={mobileHistory}
            className="alp-btn h-9 px-3 text-xs lg:hidden"
          >
            <History className="h-3.5 w-3.5" aria-hidden />
            Historique
          </button>
          <button
            type="button"
            onClick={() => {
              setConversationId(null);
              setMobileHistory(false);
            }}
            className="alp-btn h-9 px-3 text-xs"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Nouvelle
          </button>
        </header>

        {mobileHistory && (
          <div className="alp-glass-strong max-h-[45vh] min-h-0 overflow-hidden border-b border-white/[0.07] lg:hidden">
            <AssistantHistory
              activeId={conversationId}
              refreshKey={historyKey}
              onSelect={(id) => {
                setConversationId(id);
                setMobileHistory(false);
              }}
            />
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col">
          <AssistantChat
            variant="page"
            conversationId={conversationId}
            onConversationChange={setConversationId}
            onHistoryChanged={() => setHistoryKey((k) => k + 1)}
          />
        </div>
      </section>
    </div>
  );
}
