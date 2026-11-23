"use client";

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
};

const SIZE_CLASS: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "sm:max-w-md",
  md: "sm:max-w-xl",
  lg: "sm:max-w-3xl",
  xl: "sm:max-w-5xl",
};

/** Fenêtre modale en verre : fermeture par Échap ou clic sur le fond, plein écran sur mobile. */
export function Modal({ open, onClose, title, description, children, footer, size = "md" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Fermer la fenêtre"
        tabIndex={-1}
        onClick={onClose}
        className="alp-fade absolute inset-0 bg-black/70 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`alp-glass-strong alp-pop relative flex max-h-[94dvh] w-full ${SIZE_CLASS[size]} flex-col overflow-hidden rounded-t-3xl sm:max-h-[90vh] sm:rounded-3xl`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-white/[0.07] px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold tracking-tight text-white">{title}</h2>
            {description && <div className="mt-0.5 text-sm text-zinc-400">{description}</div>}
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="alp-btn alp-btn-icon shrink-0">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>
        <div className="alp-scroll min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.07] px-5 py-4 sm:px-6">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}
