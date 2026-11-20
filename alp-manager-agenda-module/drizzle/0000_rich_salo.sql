CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text DEFAULT 'commercial' NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"location" text,
	"assigned_to" integer,
	"created_by" integer,
	"priority" text DEFAULT 'normale' NOT NULL,
	"status" text DEFAULT 'a_venir' NOT NULL,
	"visibility" text DEFAULT 'partage' NOT NULL,
	"reminder" integer DEFAULT 0 NOT NULL,
	"recurrence_rule" text,
	"recurrence_exceptions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" text DEFAULT 'local' NOT NULL,
	"external_id" text,
	"external_object_type" text,
	"external_object_id" text,
	"external_url" text,
	"last_synced_at" timestamp with time zone,
	"sync_status" text DEFAULT 'local' NOT NULL,
	"sync_direction" text DEFAULT 'outbound' NOT NULL,
	"external_unique_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_reminders" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" integer,
	"minutes_before" integer DEFAULT 0 NOT NULL,
	"channel" text DEFAULT 'in_app' NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'collaborateur' NOT NULL,
	"job_title" text,
	"initials" text DEFAULT 'AL' NOT NULL,
	"color" text DEFAULT '#3ee07d' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_reminders" ADD CONSTRAINT "event_reminders_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_reminders" ADD CONSTRAINT "event_reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_events_start_at_idx" ON "calendar_events" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX "calendar_events_end_at_idx" ON "calendar_events" USING btree ("end_at");--> statement-breakpoint
CREATE INDEX "calendar_events_category_idx" ON "calendar_events" USING btree ("category");--> statement-breakpoint
CREATE INDEX "calendar_events_assigned_to_idx" ON "calendar_events" USING btree ("assigned_to");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_events_source_external_unique" ON "calendar_events" USING btree ("source","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_events_external_unique_key" ON "calendar_events" USING btree ("external_unique_key");--> statement-breakpoint
CREATE UNIQUE INDEX "event_participants_unique" ON "event_participants" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE INDEX "event_participants_event_idx" ON "event_participants" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_reminders_event_idx" ON "event_reminders" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_reminders_scheduled_idx" ON "event_reminders" USING btree ("scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");