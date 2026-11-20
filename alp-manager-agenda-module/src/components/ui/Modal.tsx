"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "max-w-2xl",
  align = "center",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
  align?: "center" | "right";
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex ${
        align === "right" ? "justify-end" : "items-center justify-center"
      } bg-black/65 backdrop-blur-sm p-0 sm:p-4`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        aria-label="Fermer"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        tabIndex={-1}
      />
      <div
        className={`relative flex max-h-full w-full ${width} flex-col overflow-hidden border border-white/10 bg-[#0b1112]/95 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.95)] backdrop-blur-2xl ${
          align === "right"
            ? "h-full rounded-none border-y-0 border-r-0 sm:rounded-l-2xl"
            : "rounded-t-2xl sm:rounded-2xl"
        } ${align === "right" ? "animate-slide-right" : "animate-rise"}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold tracking-[0.14em] text-white uppercase">
              {title}
            </h2>
            {subtitle ? (
              <div className="mt-1 text-xs text-alp-muted">{subtitle}</div>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-alp-muted transition hover:bg-white/8 hover:text-white"
            aria-label="Fermer la fenêtre"
          >
            <X size={18} />
          </button>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="border-t border-white/8 bg-black/25 px-5 py-3.5">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
