"use client";

import { BellRing, CircleCheck, CircleAlert, Info, X } from "lucide-react";

export type ToastTone = "success" | "error" | "info" | "reminder";

export type ToastItem = {
  id: string;
  tone: ToastTone;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

const TONE_STYLE: Record<ToastTone, { ring: string; icon: string }> = {
  success: { ring: "border-l-alp-green", icon: "text-alp-green" },
  error: { ring: "border-l-red-500", icon: "text-red-400" },
  info: { ring: "border-l-zinc-400", icon: "text-zinc-300" },
  reminder: { ring: "border-l-amber-400", icon: "text-amber-300" },
};

function ToneIcon({ tone }: { tone: ToastTone }) {
  const className = `h-5 w-5 shrink-0 ${TONE_STYLE[tone].icon}`;
  if (tone === "success") return <CircleCheck className={className} aria-hidden />;
  if (tone === "error") return <CircleAlert className={className} aria-hidden />;
  if (tone === "reminder") return <BellRing className={className} aria-hidden />;
  return <Info className={className} aria-hidden />;
}

export function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-24 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.tone === "error" ? "alert" : "status"}
          className={`alp-glass-strong alp-rise pointer-events-auto flex items-start gap-3 rounded-2xl border-l-4 p-4 ${TONE_STYLE[toast.tone].ring}`}
        >
          <ToneIcon tone={toast.tone} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-white">{toast.title}</p>
            {toast.message && <p className="mt-0.5 text-[13px] leading-snug text-zinc-400">{toast.message}</p>}
            {toast.actionLabel && toast.onAction && (
              <button
                type="button"
                onClick={() => {
                  toast.onAction?.();
                  onDismiss(toast.id);
                }}
                className="alp-btn mt-2.5 h-8 px-3 text-xs"
              >
                {toast.actionLabel}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Masquer la notification"
            className="rounded-lg p-1 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
