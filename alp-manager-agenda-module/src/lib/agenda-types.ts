export type AgendaUser = {
  id: number;
  name: string;
  email: string;
  initials: string;
  role: string;
  jobTitle: string | null;
  color: string;
};

export type EventSource = "local" | "hubspot" | "outlook";
export type SyncStatus = "local" | "synced" | "pending" | "error";

export type EventOccurrence = {
  occurrenceKey: string;
  eventId: string;
  occurrenceDate: string;
  title: string;
  description: string | null;
  category: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  location: string | null;
  priority: string;
  status: string;
  visibility: string;
  reminder: number;
  recurrenceRule: string | null;
  isRecurring: boolean;
  assignedTo: AgendaUser | null;
  participants: AgendaUser[];
  createdBy: AgendaUser | null;
  source: EventSource;
  externalId: string | null;
  externalObjectType: string | null;
  externalObjectId: string | null;
  externalUrl: string | null;
  syncStatus: SyncStatus;
  syncDirection: string;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
};

export type AgendaStats = {
  today: number;
  week: number;
  month: number;
  overdue: number;
  upcomingDeliveries: number;
  upcomingRevisions: number;
  pendingReminders: number;
  bySource: { local: number; hubspot: number; outlook: number };
};

export type AgendaReminder = {
  occurrenceKey: string;
  eventId: string;
  title: string;
  category: string;
  scheduledFor: string;
  startAt: string;
  reminder: number;
  assignedTo: AgendaUser | null;
  due: boolean;
};

export type AgendaResponse = {
  events: EventOccurrence[];
  stats: AgendaStats;
  upcoming: EventOccurrence[];
  nextDeliveries: EventOccurrence[];
  nextRevisions: EventOccurrence[];
  overdueEvents: EventOccurrence[];
  reminders: AgendaReminder[];
  meta: {
    from: string;
    to: string;
    today: string;
    timezone: string;
    generatedAt: string;
    totalMatching: number;
    syncConfigured: boolean;
  };
};

export type AgendaMutationResult = {
  ok: boolean;
  event?: EventOccurrence;
  message?: string;
};

export type ExternalSyncInfo = {
  provider: "hubspot";
  configured: boolean;
  status: "not_configured" | "ready";
  missingEnvironment: string[];
  readyFields: string[];
  lastLocalActivity: string | null;
  externalEventCount: number;
  pendingCount: number;
  message: string;
};
