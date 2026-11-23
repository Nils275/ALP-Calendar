/* Types et constantes partagés de l'assistant (serveur et navigateur). Aucune dépendance serveur. */
import type { z } from "zod";
import type { CalendarUser } from "@/lib/calendar/types";

export type SourceKind = "alp" | "hubspot" | "ia";

export type ActionStatus = "pending" | "confirmed" | "executed" | "failed" | "cancelled" | "expired";

export type ActionPreview = {
  summary: string;
  fields: Array<{ label: string; value: string }>;
  warnings: string[];
};

export type ActionSnapshot = {
  id: string;
  kind: string;
  title: string;
  status: ActionStatus;
  preview: ActionPreview;
  result: string | null;
  error: string | null;
  expiresAt: string;
};

/** Blocs structurés rendus par l'interface (tableaux, listes, indicateurs, alertes, cartes d'action). */
export type Block =
  | { type: "table"; title: string; source: SourceKind; columns: string[]; rows: string[][]; more?: number }
  | { type: "list"; title: string; source: SourceKind; items: Array<{ text: string; meta?: string }> }
  | { type: "kv"; title: string; source: SourceKind; items: Array<{ label: string; value: string }> }
  | { type: "alert"; tone: "warning" | "info" | "success"; text: string }
  | { type: "action"; action: ActionSnapshot }
  | { type: "suggestions"; items: string[] };

export type ToolContext = {
  viewer: CalendarUser;
  conversationId: string | null;
  now: Date;
};

export type ToolOutcome =
  | { ok: true; summary: string; data: unknown; blocks: Block[] }
  | { ok: false; error: string };

export type RegisteredTool = {
  name: string;
  mode: "read" | "propose";
  description: string;
  schema: z.ZodType;
  run: (ctx: ToolContext, args: unknown) => Promise<ToolOutcome>;
};

export type ViewMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  blocks: Block[];
  createdAt: string;
  pending?: boolean;
};

export const SOURCE_LABEL: Record<SourceKind, string> = {
  alp: "Données ALP Manager",
  hubspot: "Données HubSpot",
  ia: "Suggestion",
};

export const ACTION_STATUS_LABEL: Record<ActionStatus, string> = {
  pending: "À confirmer",
  confirmed: "En cours",
  executed: "Exécutée",
  failed: "Échec",
  cancelled: "Annulée",
  expired: "Expirée",
};

export const DEFAULT_SUGGESTIONS: string[] = [
  "Prépare-moi ma journée.",
  "Quels sont mes rendez-vous de demain ?",
  "Est-ce que j'ai un créneau jeudi après-midi ?",
  "Quels rendez-vous nécessitent une relance ?",
  "Fais-moi un récapitulatif de ma semaine.",
  "Relance les clients qui attendent un devis pour une révision d'amortisseurs.",
];

export const COMPANY_TYPE_LABEL: Record<string, string> = {
  client: "Client",
  prospect: "Prospect",
  partenaire: "Partenaire",
  fournisseur: "Fournisseur",
  autre: "Autre",
};

export const DEAL_KIND_LABEL: Record<string, string> = {
  devis: "Devis",
  commande: "Commande",
  revision: "Révision",
  sav: "SAV",
  projet: "Projet",
  autre: "Autre",
};

export const DEAL_STAGE_LABEL: Record<string, string> = {
  lead: "Piste",
  quote_sent: "Devis envoyé",
  negotiation: "Négociation",
  order: "Commande",
  production: "En production",
  delivered: "Livré",
  won: "Gagné",
  lost: "Perdu",
};
