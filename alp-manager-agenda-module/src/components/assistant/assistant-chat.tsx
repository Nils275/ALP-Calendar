"use client";

import { Send, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { DEFAULT_SUGGESTIONS, type ActionSnapshot, type Block, type ViewMessage } from "@/lib/assistant/types";
import { apiRequest, errorMessage } from "@/lib/calendar/client";
import { MessageBlocks } from "./message-blocks";

type AssistantStatus = {
  mode: "llm" | "rules";
  model: string | null;
  hubspot: { configured: boolean; reachable: boolean; missingScopes: string[]; error: string | null };
};

type Props = {
  variant: "panel" | "page";
  conversationId: string | null;
  onConversationChange: (id: string) => void;
  onHistoryChanged?: () => void;
  prefill?: string | null;
  onPrefillConsumed?: () => void;
};

const TYPING_ID = "typing";

function Avatar() {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-alp-green/15 ring-1 ring-alp-green/30">
      <Sparkles className="h-4 w-4 text-alp-green" aria-hidden />
    </span>
  );
}

function MessageRow({
  message,
  onSuggest,
  onActionChange,
}: {
  message: ViewMessage;
  onSuggest: (text: string) => void;
  onActionChange: (next: ActionSnapshot) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="alp-rise flex justify-end">
        <div className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-alp-green/25 bg-alp-green/15 px-4 py-2.5 text-[13.5px] leading-relaxed text-zinc-50">
          {message.content}
        </div>
      </div>
    );
  }

  if (message.id === TYPING_ID) {
    return (
      <div className="alp-rise flex gap-3">
        <Avatar />
        <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-white/[0.07] bg-white/[0.04] px-4 py-3" aria-live="polite">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-alp-green [animation-delay:-0.3s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-alp-green [animation-delay:-0.15s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-alp-green" />
          <span className="ml-2 text-[12px] text-zinc-400">Analyse de vos données…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="alp-rise flex gap-3">
      <Avatar />
      <div className="min-w-0 flex-1 space-y-3">
        {message.content && (
          <div className="whitespace-pre-wrap rounded-2xl rounded-bl-md border border-white/[0.07] bg-white/[0.04] px-4 py-3 text-[13.5px] leading-relaxed text-zinc-100">
            {message.content}
          </div>
        )}
        <MessageBlocks blocks={message.blocks} onSuggest={onSuggest} onActionChange={onActionChange} />
      </div>
    </div>
  );
}

export function AssistantChat({ variant, conversationId, onConversationChange, onHistoryChanged, prefill, onPrefillConsumed }: Props) {
  const [messages, setMessages] = useState<ViewMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const skipLoadFor = useRef<string | null>(null);
  const sendingRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<AssistantStatus>("/api/assistant/status", { signal: controller.signal })
      .then(setStatus)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!conversationId) {
      if (!sendingRef.current) setMessages([]);
      return;
    }
    if (skipLoadFor.current === conversationId) {
      skipLoadFor.current = null;
      return;
    }
    const controller = new AbortController();
    setLoadingHistory(true);
    setError(null);
    apiRequest<{ messages: ViewMessage[] }>(`/api/assistant/conversations/${conversationId}`, { signal: controller.signal })
      .then((res) => setMessages(res.messages))
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(err));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingHistory(false);
      });
    return () => controller.abort();
  }, [conversationId]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || sendingRef.current) return;
      sendingRef.current = true;
      const stamp = new Date().toISOString();
      const tempId = `tmp-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: tempId, role: "user", content: text, blocks: [], createdAt: stamp },
        { id: TYPING_ID, role: "assistant", content: "", blocks: [], createdAt: stamp, pending: true },
      ]);
      setInput("");
      setSending(true);
      setError(null);
      try {
        const res = await apiRequest<{
          conversationId: string;
          mode: "llm" | "rules";
          userMessage: ViewMessage;
          assistantMessage: ViewMessage;
        }>("/api/assistant/messages", { method: "POST", body: { conversationId, text } });
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== TYPING_ID && m.id !== tempId),
          res.userMessage,
          res.assistantMessage,
        ]);
        if (res.conversationId !== conversationId) {
          skipLoadFor.current = res.conversationId;
          onConversationChange(res.conversationId);
        }
        setStatus((s) => (s ? { ...s, mode: res.mode } : s));
        onHistoryChanged?.();
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== TYPING_ID && m.id !== tempId));
        setInput(text);
        setError(errorMessage(err));
      } finally {
        sendingRef.current = false;
        setSending(false);
      }
    },
    [conversationId, onConversationChange, onHistoryChanged],
  );

  useEffect(() => {
    if (prefill) {
      onPrefillConsumed?.();
      void send(prefill);
    }
    // Le message pré-rempli n'est envoyé qu'une fois, à son apparition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, sending]);

  function updateAction(next: ActionSnapshot) {
    setMessages((prev) =>
      prev.map((m) => ({
        ...m,
        blocks: m.blocks.map((b): Block => (b.type === "action" && b.action.id === next.id ? { type: "action", action: next } : b)),
      })),
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send(input);
    }
  }

  const showWelcome = messages.length === 0 && !loadingHistory;
  const modeLabel = !status
    ? ""
    : status.mode === "llm"
      ? `Mode avancé${status.model ? ` · ${status.model}` : ""}`
      : "Mode simplifié (sans clé IA) : demandes courantes";
  const hubspotLabel = !status
    ? ""
    : !status.hubspot.configured
      ? "HubSpot non connecté"
      : status.hubspot.reachable
        ? "HubSpot connecté"
        : "HubSpot en erreur";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="alp-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
        {loadingHistory && (
          <div className="space-y-3" aria-busy="true">
            <div className="alp-skeleton ml-auto h-10 w-2/3 rounded-2xl" />
            <div className="alp-skeleton h-24 w-5/6 rounded-2xl" />
          </div>
        )}

        {showWelcome && (
          <div className="alp-rise mx-auto flex max-w-xl flex-col items-center py-4 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-alp-green/15 ring-1 ring-alp-green/30">
              <Sparkles className="h-6 w-6 text-alp-green" aria-hidden />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-white">Comment puis-je vous aider ?</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
              Je consulte votre agenda et les données commerciales, je prépare vos rendez-vous, et je propose des actions
              que vous confirmez avant toute exécution.
            </p>
            <div className={`mt-6 grid w-full gap-2 ${variant === "page" ? "sm:grid-cols-2" : ""}`}>
              {DEFAULT_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="alp-glass rounded-2xl px-3.5 py-3 text-left text-[13px] leading-snug text-zinc-200 transition duration-200 hover:-translate-y-0.5 hover:border-alp-green/40"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <MessageRow key={m.id} message={m} onSuggest={(t) => void send(t)} onActionChange={updateAction} />
        ))}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div role="alert" className="mx-4 mb-2 rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-200">
          {error}
        </div>
      )}

      <form
        className="border-t border-white/[0.07] p-3 sm:p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="flex items-end gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-2 transition-colors focus-within:border-alp-green/50">
          <textarea
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={sending}
            maxLength={2000}
            aria-label="Votre message à l'assistant"
            placeholder="Demandez quelque chose : « Prépare-moi ma journée »…"
            className="max-h-36 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-500"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            aria-label="Envoyer"
            className="alp-btn alp-btn-primary h-10 w-10 shrink-0 p-0"
          >
            <Send className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <p className="mt-2 flex flex-wrap gap-x-3 px-1 text-[10.5px] text-zinc-500">
          {modeLabel && <span>{modeLabel}</span>}
          {hubspotLabel && <span>· {hubspotLabel}</span>}
          <span>· Aucune action n&apos;est exécutée sans votre confirmation</span>
        </p>
      </form>
    </div>
  );
}
