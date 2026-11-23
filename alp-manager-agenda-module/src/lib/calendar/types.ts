/* Types partagés entre API et interface de l'agenda (aucune dépendance serveur). */
import type { CategoryKey } from "./constants";

export type UserRole = "direction" | "responsable" | "collaborateur";
export type EventPriority = "low" | "normal" | "high" | "urgent";
export type EventStatus = "upcoming" | "in_progress" | "done" | "cancelled";
export type EventVisibility = "shared" | "private";
export type EventSource = "local" | "hubspot" | "outlook";
export type ExternalObjectType = "task" | "deal" | "contact" | "project" | "custom";
export type SyncStatus = "local" | "synced" | "pending" | "error";
export type SyncDirection = "inbound" | "outbound" | "both";

/** Collaborateur connecté (identité courante). */
export type CalendarUser = {
  id: string;
  fullName: string;
  email: string;
  jobTitle: string | null;
  role: UserRole;
  color: string;
};

export type UserRef = {
  id: string;
  fullName: string;
  color: string;
  role: UserRole;
  jobTitle: string | null;
};

export type EventDto = {
  id: string;
  title: string;
  description: string | null;
  category: CategoryKey;
  startAt: string;
  endAt: string;
  allDay: boolean;
  location: string | null;
  assignedTo: UserRef | null;
  createdBy: UserRef | null;
  updatedBy: UserRef | null;
  priority: EventPriority;
  status: EventStatus;
  visibility: EventVisibility;
  reminderMinutes: number | null;
  recurrenceRule: string | null;
  participants: UserRef[];
  source: EventSource;
  externalId: string | null;
  externalObjectType: ExternalObjectType | null;
  externalObjectId: string | null;
  externalUrl: string | null;
  lastSyncedAt: string | null;
  syncStatus: SyncStatus | null;
  syncDirection: SyncDirection | null;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
};

/** Une occurrence affichée dans le calendrier (événement unique ou occurrence d'une série). */
export type OccurrenceDto = {
  key: string;
  eventId: string;
  /** Heure de début d'origine (identifie l'occurrence dans la série). */
  occurrenceStart: string;
  start: string;
  end: string;
  status: EventStatus;
  isRecurring: boolean;
  isModified: boolean;
};

export type CalendarRangeDto = {
  events: EventDto[];
  occurrences: OccurrenceDto[];
};

/** Occurrence enrichie de son événement, consommée par les vues. */
export type ViewOccurrence = OccurrenceDto & { event: EventDto };

export type AgendaItemDto = {
  key: string;
  eventId: string;
  title: string;
  category: CategoryKey;
  start: string;
  end: string;
  status: EventStatus;
  priority: EventPriority;
  location: string | null;
  allDay: boolean;
  isRecurring: boolean;
  assignee: { id: string; fullName: string; color: string } | null;
};

export type AgendaSummaryDto = {
  counts: {
    today: number;
    week: number;
    overdue: number;
    deliveries: number;
  };
  today: AgendaItemDto[];
  overdue: AgendaItemDto[];
  upcoming: AgendaItemDto[];
  deliveries: AgendaItemDto[];
  revisions: AgendaItemDto[];
};

export type ReminderDto = {
  key: string;
  eventId: string;
  title: string;
  category: CategoryKey;
  start: string;
  reminderMinutes: number;
  location: string | null;
};

export type EventDetailDto = {
  event: EventDto;
  occurrence: {
    key: string;
    occurrenceStart: string;
    start: string;
    end: string;
    status: EventStatus;
    isRecurring: boolean;
    isModified: boolean;
  };
};

export type UserDto = CalendarUser;
