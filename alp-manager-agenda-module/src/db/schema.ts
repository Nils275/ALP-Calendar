import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Collaborateurs ALP Manager.
 * Le module Agenda réutilise cette table comme source unique d'utilisateurs.
 * (Le projet ne disposait pas encore de table d'utilisateurs : elle est créée
 * ici de façon additive, sans toucher à l'existant.)
 */
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    role: text("role").notNull().default("collaborateur"), // admin | manager | collaborateur | lecture
    jobTitle: text("job_title"),
    initials: text("initials").notNull().default("AL"),
    color: text("color").notNull().default("#3ee07d"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

/**
 * Événements de l'agenda commun ALP Racing.
 * Les colonnes de synchronisation sont facultatives pour les événements locaux
 * et préparent une future intégration HubSpot / Outlook sans simuler d'API.
 */
export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description"),
    category: text("category").notNull().default("commercial"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    allDay: boolean("all_day").notNull().default(false),
    location: text("location"),
    assignedTo: integer("assigned_to").references(() => users.id, {
      onDelete: "set null",
    }),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    priority: text("priority").notNull().default("normale"),
    status: text("status").notNull().default("a_venir"),
    visibility: text("visibility").notNull().default("partage"),
    reminder: integer("reminder").notNull().default(0), // minutes avant
    recurrenceRule: text("recurrence_rule"), // RRULE iCalendar (FREQ=WEEKLY;...)
    recurrenceExceptions: jsonb("recurrence_exceptions")
      .$type<string[]>()
      .notNull()
      .default([]),

    // Préparation HubSpot / Outlook
    source: text("source").notNull().default("local"), // local | hubspot | outlook
    externalId: text("external_id"),
    externalObjectType: text("external_object_type"), // task | deal | contact | project | custom
    externalObjectId: text("external_object_id"),
    externalUrl: text("external_url"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    syncStatus: text("sync_status").notNull().default("local"), // local | synced | pending | error
    syncDirection: text("sync_direction").notNull().default("outbound"), // inbound | outbound | both
    externalUniqueKey: text("external_unique_key"), // anti-doublon (source:object:external_id)

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("calendar_events_start_at_idx").on(table.startAt),
    index("calendar_events_end_at_idx").on(table.endAt),
    index("calendar_events_category_idx").on(table.category),
    index("calendar_events_assigned_to_idx").on(table.assignedTo),
    uniqueIndex("calendar_events_source_external_unique").on(
      table.source,
      table.externalId,
    ),
    uniqueIndex("calendar_events_external_unique_key").on(
      table.externalUniqueKey,
    ),
  ],
);

export const eventParticipants = pgTable(
  "event_participants",
  {
    id: serial("id").primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => calendarEvents.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("event_participants_unique").on(table.eventId, table.userId),
    index("event_participants_event_idx").on(table.eventId),
  ],
);

/**
 * Rappels in-app programmés (pas d'email / push : aucun service configuré).
 * Une ligne par rappel actif, recalculée à chaque modification d'événement.
 */
export const eventReminders = pgTable(
  "event_reminders",
  {
    id: serial("id").primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => calendarEvents.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    minutesBefore: integer("minutes_before").notNull().default(0),
    channel: text("channel").notNull().default("in_app"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("pending"), // pending | cancelled
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("event_reminders_event_idx").on(table.eventId),
    index("event_reminders_scheduled_idx").on(table.scheduledFor),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type CalendarEventRow = typeof calendarEvents.$inferSelect;
export type EventParticipantRow = typeof eventParticipants.$inferSelect;
export type EventReminderRow = typeof eventReminders.$inferSelect;
