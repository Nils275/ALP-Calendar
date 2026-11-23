"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type AssistantContextValue = {
  open: boolean;
  /** Message à envoyer automatiquement à l'ouverture (ex. briefing du jour). */
  prefill: string | null;
  openAssistant: (message?: string) => void;
  closeAssistant: () => void;
  toggleAssistant: () => void;
  consumePrefill: () => void;
};

const AssistantContext = createContext<AssistantContextValue | null>(null);

/** État global du panneau assistant : il peut s'ouvrir depuis n'importe quelle page, sans quitter l'agenda. */
export function AssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<string | null>(null);

  const openAssistant = useCallback((message?: string) => {
    if (message) setPrefill(message);
    setOpen(true);
  }, []);
  const closeAssistant = useCallback(() => setOpen(false), []);
  const toggleAssistant = useCallback(() => setOpen((o) => !o), []);
  const consumePrefill = useCallback(() => setPrefill(null), []);

  const value = useMemo(
    () => ({ open, prefill, openAssistant, closeAssistant, toggleAssistant, consumePrefill }),
    [open, prefill, openAssistant, closeAssistant, toggleAssistant, consumePrefill],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant(): AssistantContextValue {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error("useAssistant doit être utilisé à l'intérieur d'AssistantProvider.");
  return ctx;
}
