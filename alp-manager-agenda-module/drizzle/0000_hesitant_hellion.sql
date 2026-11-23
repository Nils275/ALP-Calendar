CREATE TYPE "public"."calendar_category" AS ENUM('commercial', 'rendez_vous', 'atelier', 'livraison', 'reception', 'revision', 'projet', 'reunion_interne', 'administratif');--> statement-breakpoint
CREATE TYPE "public"."calendar_external_object_type" AS ENUM('task', 'deal', 'contact', 'project', 'custom');--> statement-breakpoint
CREATE TYPE "public"."calendar_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."calendar_source" AS ENUM('local', 'hubspot', 'outlook');--> statement-breakpoint
CREATE TYPE "public"."calendar_status" AS ENUM('upcoming', 'in_progress', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."calendar_sync_direction" AS ENUM('inbound', 'outbound', 'both');--> statement-breakpoint
CREATE TYPE "public"."calendar_sync_status" AS ENUM('local', 'synced', 'pending', 'error');--> statement-breakpoint
CREATE TYPE "public"."calendar_visibility" AS ENUM('shared', 'private');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('direction', 'responsable', 'collaborateur');--> statement-breakpoint
CREATE TABLE "calendar_event_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"original_start_at" timestamp with time zone NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"status" "calendar_status",
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_event_participants" (
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	CONSTRAINT "calendar_event_participants_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" "calendar_category" DEFAULT 'administratif' NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"location" text,
	"assigned_to" uuid,
	"created_by" uuid NOT NULL,
	"updated_by" uuid,
	"priority" "calendar_priority" DEFAULT 'normal' NOT NULL,
	"status" "calendar_status" DEFAULT 'upcoming' NOT NULL,
	"visibility" "calendar_visibility" DEFAULT 'shared' NOT NULL,
	"reminder_minutes" integer,
	"recurrence_rule" text,
	"source" "calendar_source" DEFAULT 'local' NOT NULL,
	"external_id" text,
	"external_object_type" "calendar_external_object_type",
	"external_object_id" text,
	"external_url" text,
	"last_synced_at" timestamp with time zone,
	"sync_status" "calendar_sync_status" DEFAULT 'local',
	"sync_direction" "calendar_sync_direction",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"job_title" text,
	"role" "user_role" DEFAULT 'collaborateur' NOT NULL,
	"color" text DEFAULT '#3ddc84' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "calendar_event_exceptions" ADD CONSTRAINT "calendar_event_exceptions_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_participants" ADD CONSTRAINT "calendar_event_participants_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_event_participants" ADD CONSTRAINT "calendar_event_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_event_exceptions_uidx" ON "calendar_event_exceptions" USING btree ("event_id","original_start_at");--> statement-breakpoint
CREATE INDEX "calendar_event_participants_user_idx" ON "calendar_event_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "calendar_events_start_idx" ON "calendar_events" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX "calendar_events_end_idx" ON "calendar_events" USING btree ("end_at");--> statement-breakpoint
CREATE INDEX "calendar_events_assigned_idx" ON "calendar_events" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "calendar_events_created_by_idx" ON "calendar_events" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_events_source_external_uidx" ON "calendar_events" USING btree ("source","external_id") WHERE "calendar_events"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "users_active_idx" ON "users" USING btree ("is_active");