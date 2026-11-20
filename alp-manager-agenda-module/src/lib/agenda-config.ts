export const EVENT_CATEGORIES = [
  { key: "commercial", label: "Commercial", color: "#3b82f6" },
  { key: "rendez_vous", label: "Rendez-vous", color: "#a855f7" },
  { key: "atelier", label: "Atelier", color: "#3ee07d" },
  { key: "livraison", label: "Livraison", color: "#f97316" },
  { key: "reception", label: "Réception", color: "#22d3ee" },
  { key: "revision", label: "Révision", color: "#facc15" },
  { key: "projet", label: "Projet", color: "#ef4444" },
  { key: "reunion_interne", label: "Réunion interne", color: "#94a3b8" },
  { key: "administratif", label: "Administratif", color: "#e2e8f0" },
] as const;

export type CategoryKey = (typeof EVENT_CATEGORIES)[number]["key"];

export function getCategory(key: string) {
  return EVENT_CATEGORIES.find((category) => category.key === key) ??
    EVENT_CATEGORIES[0];
}

export function categoryLabel(key: string): string {
  return getCategory(key).label;
}

export function categoryColor(key: string): string {
  return getCategory(key).color;
}

export function categoryTint(key: string, alpha = 0.16): string {
  const hex = categoryColor(key).replace("#", "");
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const PRIORITIES = [
  { key: "basse", label: "Basse", color: "#64748b" },
  { key: "normale", label: "Normale", color: "#38bdf8" },
  { key: "haute", label: "Haute", color: "#f59e0b" },
  { key: "urgente", label: "Urgente", color: "#ef4444" },
] as const;

export type PriorityKey = (typeof PRIORITIES)[number]["key"];

export function priorityMeta(key: string) {
  return PRIORITIES.find((p) => p.key === key) ?? PRIORITIES[1];
}

export const STATUSES = [
  { key: "a_venir", label: "À venir", color: "#38bdf8" },
  { key: "en_cours", label: "En cours", color: "#3ee07d" },
  { key: "termine", label: "Terminé", color: "#8b9c9d" },
  { key: "annule", label: "Annulé", color: "#ef4444" },
] as const;

export type StatusKey = (typeof STATUSES)[number]["key"];

export function statusMeta(key: string) {
  return STATUSES.find((s) => s.key === key) ?? STATUSES[0];
}

export const REMINDER_OPTIONS = [
  { value: 0, label: "Aucun" },
  { value: 15, label: "15 minutes avant" },
  { value: 30, label: "30 minutes avant" },
  { value: 60, label: "1 heure avant" },
  { value: 1440, label: "1 jour avant" },
] as const;

export function reminderLabel(minutes: number): string {
  return (
    REMINDER_OPTIONS.find((option) => option.value === minutes)?.label ??
    `${minutes} minutes avant`
  );
}

export const VISIBILITIES = [
  { key: "partage", label: "Partagé à l'équipe" },
  { key: "prive", label: "Privé" },
] as const;

export function visibilityLabel(key: string): string {
  return VISIBILITIES.find((visibility) => visibility.key === key)?.label ?? "Partagé";
}

export const EVENT_SOURCES = [
  { key: "local", label: "ALP Manager", color: "#3ee07d" },
  { key: "hubspot", label: "HubSpot", color: "#f97316" },
  { key: "outlook", label: "Outlook", color: "#38bdf8" },
] as const;

export function sourceMeta(key: string) {
  return EVENT_SOURCES.find((source) => source.key === key) ?? EVENT_SOURCES[0];
}

export const SYNC_STATUSES = [
  { key: "local", label: "Local", color: "#8b9c9d" },
  { key: "synced", label: "Synchronisé", color: "#3ee07d" },
  { key: "pending", label: "En attente", color: "#facc15" },
  { key: "error", label: "Erreur", color: "#ef4444" },
] as const;

export function syncStatusMeta(key: string) {
  return SYNC_STATUSES.find((status) => status.key === key) ?? SYNC_STATUSES[0];
}

export const EXTERNAL_OBJECT_TYPES = [
  { key: "task", label: "Tâche HubSpot" },
  { key: "deal", label: "Transaction" },
  { key: "contact", label: "Contact" },
  { key: "project", label: "Projet" },
  { key: "custom", label: "Objet personnalisé" },
] as const;

export function externalObjectLabel(key?: string | null): string {
  if (!key) return "—";
  return EXTERNAL_OBJECT_TYPES.find((t) => t.key === key)?.label ?? key;
}

export const ROLES = [
  { key: "admin", label: "Administrateur" },
  { key: "manager", label: "Manager" },
  { key: "collaborateur", label: "Collaborateur" },
  { key: "lecture", label: "Lecture seule" },
] as const;

export function roleLabel(key: string): string {
  return ROLES.find((role) => role.key === key)?.label ?? key;
}

export function canManageAll(role: string): boolean {
  return role === "admin" || role === "manager";
}

export function canCreateEvents(role: string): boolean {
  return role !== "lecture";
}

export function canEditEvent(
  user: { id: number; role: string },
  event: { createdBy: number | null; assignedTo: number | null; participantIds?: number[] },
): boolean {
  if (user.role === "lecture") return false;
  if (canManageAll(user.role)) return true;
  if (event.createdBy === user.id || event.assignedTo === user.id) return true;
  return (event.participantIds ?? []).includes(user.id);
}

export const VIEW_MODES = [
  { key: "day", label: "Jour" },
  { key: "week", label: "Semaine" },
  { key: "month", label: "Mois" },
  { key: "list", label: "Liste" },
] as const;

export type ViewMode = (typeof VIEW_MODES)[number]["key"];

export const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
export const DAY_LABELS_FULL = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
];
