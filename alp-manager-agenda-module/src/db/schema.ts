import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  jsonb,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const userRoleEnum = pgEnum("user_role", ["direction", "responsable", "collaborateur"]);

export const calendarCategoryEnum = pgEnum("calendar_category", [
  "commercial",
  "rendez_vous",
  "atelier",
  "livraison",
  "reception",
  "revision",
  "projet",
  "reunion_interne",
  "administratif",
]);

export const calendarPriorityEnum = pgEnum("calendar_priority", ["low", "normal", "high", "urgent"]);

export const calendarStatusEnum = pgEnum("calendar_status", ["upcoming", "in_progress", "done", "cancelled"]);

export const calendarVisibilityEnum = pgEnum("calendar_visibility", ["shared", "private"]);

export const calendarSourceEnum = pgEnum("calendar_source", ["local", "hubspot", "outlook"]);

export const calendarExternalObjectTypeEnum = pgEnum("calendar_external_object_type", [
  "task",
  "deal",
  "contact",
  "project",
  "custom",
]);

export const calendarSyncStatusEnum = pgEnum("calendar_sync_status", ["local", "synced", "pending", "error"]);

export const calendarSyncDirectionEnum = pgEnum("calendar_sync_direction", ["inbound", "outbound", "both"]);

/* ------------------------------------------------------------------ */
/* Collaborateurs                                                      */
/* ------------------------------------------------------------------ */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash"),
    jobTitle: text("job_title"),
    role: userRoleEnum("role").notNull().default("collaborateur"),
    color: text("color").notNull().default("#3ddc84"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("users_active_idx").on(t.isActive)],
);

export const userSessions = pgTable(
  "user_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("user_sessions_token_hash_uidx").on(t.tokenHash),
    index("user_sessions_user_idx").on(t.userId),
    index("user_sessions_expires_idx").on(t.expiresAt),
  ],
);

/* ------------------------------------------------------------------ */
/* Agenda                                                              */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* CRM local : miroir des entreprises, contacts et affaires,           */
/* prêt pour la synchronisation HubSpot (source + external_id).        */
/* ------------------------------------------------------------------ */

export const crmCompanyTypeEnum = pgEnum("crm_company_type", ["client", "prospect", "partenaire", "fournisseur", "autre"]);

export const crmDealKindEnum = pgEnum("crm_deal_kind", ["devis", "commande", "revision", "sav", "projet", "autre"]);

export const crmDealStageEnum = pgEnum("crm_deal_stage", [
  "lead",
  "quote_sent",
  "negotiation",
  "order",
  "production",
  "delivered",
  "won",
  "lost",
]);

export const crmCompanies = pgTable(
  "crm_companies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    type: crmCompanyTypeEnum("type").notNull().default("prospect"),
    domain: text("domain"),
    city: text("city"),
    country: text("country"),
    sector: text("sector"),
    notes: text("notes"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    source: calendarSourceEnum("source").notNull().default("local"),
    externalId: text("external_id"),
    externalUrl: text("external_url"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("crm_companies_name_idx").on(t.name),
    uniqueIndex("crm_companies_source_external_uidx")
      .on(t.source, t.externalId)
      .where(sql`${t.externalId} is not null`),
  ],
);

export const crmContacts = pgTable(
  "crm_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").references(() => crmCompanies.id, { onDelete: "set null" }),
    firstName: text("first_name"),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    jobTitle: text("job_title"),
    notes: text("notes"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    source: calendarSourceEnum("source").notNull().default("local"),
    externalId: text("external_id"),
    externalUrl: text("external_url"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("crm_contacts_company_idx").on(t.companyId),
    index("crm_contacts_name_idx").on(t.lastName),
    uniqueIndex("crm_contacts_source_external_uidx")
      .on(t.source, t.externalId)
      .where(sql`${t.externalId} is not null`),
  ],
);

export const crmDeals = pgTable(
  "crm_deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").references(() => crmCompanies.id, { onDelete: "set null" }),
    contactId: uuid("contact_id").references(() => crmContacts.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    kind: crmDealKindEnum("kind").notNull().default("autre"),
    stage: crmDealStageEnum("stage").notNull().default("lead"),
    hubspotPipelineId: text("hubspot_pipeline_id"),
    hubspotPipelineLabel: text("hubspot_pipeline_label"),
    hubspotStageId: text("hubspot_stage_id"),
    hubspotStageLabel: text("hubspot_stage_label"),
    hubspotCreatedAt: timestamp("hubspot_created_at", { withTimezone: true }),
    hubspotUpdatedAt: timestamp("hubspot_updated_at", { withTimezone: true }),
    productLine: text("product_line"),
    amountEur: integer("amount_eur"),
    expectedCloseDate: date("expected_close_date", { mode: "string" }),
    lastInteractionAt: timestamp("last_interaction_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    source: calendarSourceEnum("source").notNull().default("local"),
    externalId: text("external_id"),
    externalUrl: text("external_url"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("crm_deals_stage_idx").on(t.stage),
    index("crm_deals_company_idx").on(t.companyId),
    uniqueIndex("crm_deals_source_external_uidx")
      .on(t.source, t.externalId)
      .where(sql`${t.externalId} is not null`),
  ],
);

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description"),
    category: calendarCategoryEnum("category").notNull().default("administratif"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }).notNull(),
    allDay: boolean("all_day").notNull().default(false),
    location: text("location"),
    assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    priority: calendarPriorityEnum("priority").notNull().default("normal"),
    status: calendarStatusEnum("status").notNull().default("upcoming"),
    visibility: calendarVisibilityEnum("visibility").notNull().default("shared"),
    /** Minutes avant le début. NULL = aucun rappel. */
    reminderMinutes: integer("reminder_minutes"),
    /** Règle de récurrence au format RRULE simplifié (FREQ, INTERVAL, BYDAY, UNTIL). NULL = événement unique. */
    recurrenceRule: text("recurrence_rule"),

    /* Préparation synchronisation HubSpot / Outlook — facultatif pour les événements locaux */
    source: calendarSourceEnum("source").notNull().default("local"),
    externalId: text("external_id"),
    externalObjectType: calendarExternalObjectTypeEnum("external_object_type"),
    externalObjectId: text("external_object_id"),
    externalUrl: text("external_url"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    syncStatus: calendarSyncStatusEnum("sync_status").default("local"),
    syncDirection: calendarSyncDirectionEnum("sync_direction"),

    /* Liens CRM, compte rendu et suivi (assistant IA) */
    crmCompanyId: uuid("crm_company_id").references(() => crmCompanies.id, { onDelete: "set null" }),
    crmContactId: uuid("crm_contact_id").references(() => crmContacts.id, { onDelete: "set null" }),
    crmDealId: uuid("crm_deal_id").references(() => crmDeals.id, { onDelete: "set null" }),
    report: text("report"),
    reportAt: timestamp("report_at", { withTimezone: true }),
    followUpRequired: boolean("follow_up_required").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("calendar_events_start_idx").on(t.startAt),
    index("calendar_events_end_idx").on(t.endAt),
    index("calendar_events_assigned_idx").on(t.assignedTo),
    index("calendar_events_created_by_idx").on(t.createdBy),
    // Anti-doublon : un même identifiant externe ne peut exister qu'une fois par source.
    uniqueIndex("calendar_events_source_external_uidx")
      .on(t.source, t.externalId)
      .where(sql`${t.externalId} is not null`),
  ],
);

export const calendarEventParticipants = pgTable(
  "calendar_event_participants",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => calendarEvents.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.userId] }),
    index("calendar_event_participants_user_idx").on(t.userId),
  ],
);

/**
 * Exceptions sur les occurrences d'une série récurrente.
 * `original_start_at` identifie l'occurrence (heure de début d'origine dans la série).
 */
export const calendarEventExceptions = pgTable(
  "calendar_event_exceptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => calendarEvents.id, { onDelete: "cascade" }),
    originalStartAt: timestamp("original_start_at", { withTimezone: true }).notNull(),
    isDeleted: boolean("is_deleted").notNull().default(false),
    status: calendarStatusEnum("status"),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("calendar_event_exceptions_uidx").on(t.eventId, t.originalStartAt)],
);

/* ------------------------------------------------------------------ */
/* Assistant IA : conversations, messages, actions proposées, audit    */
/* ------------------------------------------------------------------ */

export const assistantActionStatusEnum = pgEnum("assistant_action_status", [
  "pending",
  "confirmed",
  "executed",
  "failed",
  "cancelled",
  "expired",
]);

export const assistantConversations = pgTable(
  "assistant_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("assistant_conversations_user_idx").on(t.userId, t.lastMessageAt)],
);

export const assistantMessages = pgTable(
  "assistant_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => assistantConversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    blocks: jsonb("blocks").$type<unknown[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("assistant_messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

export const assistantActions = pgTable(
  "assistant_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => assistantConversations.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    preview: jsonb("preview").$type<Record<string, unknown>>().notNull(),
    status: assistantActionStatusEnum("status").notNull().default("pending"),
    result: jsonb("result").$type<Record<string, unknown>>(),
    error: text("error"),
    dedupeKey: text("dedupe_key").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("assistant_actions_user_idx").on(t.userId, t.createdAt),
    index("assistant_actions_dedupe_idx").on(t.userId, t.dedupeKey),
  ],
);

export const assistantToolCalls = pgTable(
  "assistant_tool_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => assistantConversations.id, { onDelete: "set null" }),
    toolName: text("tool_name").notNull(),
    mode: text("mode").notNull(),
    args: jsonb("args").$type<Record<string, unknown>>().notNull().default({}),
    ok: boolean("ok").notNull(),
    resultSummary: text("result_summary"),
    error: text("error"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("assistant_tool_calls_user_idx").on(t.userId, t.createdAt)],
);

// ------------------------------------------------------------------
// Protection contre les tentatives répétées de connexion
// ------------------------------------------------------------------

export const authLoginLimits = pgTable(
  "auth_login_limits",
  {
    keyHash: text("key_hash").primaryKey(),
    windowStartedAt: timestamp("window_started_at", {
      withTimezone: true,
    }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", {
      withTimezone: true,
    }),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    }).notNull().defaultNow(),
  },
  (t) => [
    index("auth_login_limits_locked_idx").on(t.lockedUntil),
    index("auth_login_limits_updated_idx").on(t.updatedAt),
  ],
);
