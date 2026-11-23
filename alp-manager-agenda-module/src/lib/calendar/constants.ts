/* Constantes partagées serveur / client de l'agenda ALP Manager. */

export const CATEGORY_KEYS = [
  "commercial",
  "rendez_vous",
  "atelier",
  "livraison",
  "reception",
  "revision",
  "projet",
  "reunion_interne",
  "administratif",
] as const;

export type CategoryKey = (typeof CATEGORY_KEYS)[number];

/** Icône : nom logique résolu côté UI vers une icône Lucide. */
export const CATEGORIES: Record<CategoryKey, { label: string; color: string; icon: string }> = {
  commercial: { label: "Commercial", color: "#3b82f6", icon: "briefcase" },
  rendez_vous: { label: "Rendez-vous", color: "#a855f7", icon: "handshake" },
  atelier: { label: "Atelier", color: "#22c55e", icon: "wrench" },
  livraison: { label: "Livraison", color: "#f97316", icon: "truck" },
  reception: { label: "Réception", color: "#06b6d4", icon: "package-check" },
  revision: { label: "Révision", color: "#eab308", icon: "gauge" },
  projet: { label: "Projet", color: "#ef4444", icon: "folder-kanban" },
  reunion_interne: { label: "Réunion interne", color: "#9ca3af", icon: "users" },
  administratif: { label: "Administratif", color: "#f4f4f5", icon: "file-text" },
};

export const PRIORITY_KEYS = ["low", "normal", "high", "urgent"] as const;
export type PriorityKey = (typeof PRIORITY_KEYS)[number];
export const PRIORITIES: Record<PriorityKey, { label: string; color: string }> = {
  low: { label: "Basse", color: "#9ca3af" },
  normal: { label: "Normale", color: "#3ddc84" },
  high: { label: "Haute", color: "#f97316" },
  urgent: { label: "Urgente", color: "#ef4444" },
};

export const STATUS_KEYS = ["upcoming", "in_progress", "done", "cancelled"] as const;
export type StatusKey = (typeof STATUS_KEYS)[number];
export const STATUSES: Record<StatusKey, { label: string; color: string }> = {
  upcoming: { label: "À venir", color: "#60a5fa" },
  in_progress: { label: "En cours", color: "#3ddc84" },
  done: { label: "Terminé", color: "#a1a1aa" },
  cancelled: { label: "Annulé", color: "#f87171" },
};

export const VISIBILITY_KEYS = ["shared", "private"] as const;
export type VisibilityKey = (typeof VISIBILITY_KEYS)[number];
export const VISIBILITIES: Record<VisibilityKey, { label: string }> = {
  shared: { label: "Partagé (équipe)" },
  private: { label: "Privé" },
};

export const REMINDER_MINUTES = [15, 30, 60, 1440] as const;
export const REMINDER_LABELS: Record<string, string> = {
  none: "Aucun",
  "15": "15 minutes avant",
  "30": "30 minutes avant",
  "60": "1 heure avant",
  "1440": "1 jour avant",
};

export const SOURCE_LABELS: Record<string, string> = {
  local: "ALP Manager",
  hubspot: "HubSpot",
  outlook: "Outlook",
};

export const ROLE_LABELS: Record<string, string> = {
  direction: "Direction",
  responsable: "Responsable",
  collaborateur: "Collaborateur",
};

export const SYNC_STATUS_LABELS: Record<string, string> = {
  local: "Local",
  synced: "Synchronisé",
  pending: "En attente",
  error: "Erreur",
};

export const SYNC_DIRECTION_LABELS: Record<string, string> = {
  inbound: "Entrant (externe → ALP)",
  outbound: "Sortant (ALP → externe)",
  both: "Bidirectionnel",
};

export const EXTERNAL_OBJECT_TYPE_LABELS: Record<string, string> = {
  task: "Tâche",
  deal: "Affaire",
  contact: "Contact",
  project: "Projet",
  custom: "Autre objet",
};

/** Plage horaire par défaut affichée dans les vues temps (étendue automatiquement si nécessaire). */
export const DEFAULT_GRID_START_HOUR = 7;
export const DEFAULT_GRID_END_HOUR = 21;

export const WEEKDAY_SHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"] as const;
export const WEEKDAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
