CREATE TYPE "public"."assistant_action_status" AS ENUM('pending', 'confirmed', 'executed', 'failed', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."crm_company_type" AS ENUM('client', 'prospect', 'partenaire', 'fournisseur', 'autre');--> statement-breakpoint
CREATE TYPE "public"."crm_deal_kind" AS ENUM('devis', 'commande', 'revision', 'sav', 'projet', 'autre');--> statement-breakpoint
CREATE TYPE "public"."crm_deal_stage" AS ENUM('lead', 'quote_sent', 'negotiation', 'order', 'production', 'delivered', 'won', 'lost');--> statement-breakpoint
CREATE TABLE "assistant_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"payload" jsonb NOT NULL,
	"preview" jsonb NOT NULL,
	"status" "assistant_action_status" DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"error" text,
	"dedupe_key" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid,
	"tool_name" text NOT NULL,
	"mode" text NOT NULL,
	"args" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ok" boolean NOT NULL,
	"result_summary" text,
	"error" text,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "crm_company_type" DEFAULT 'prospect' NOT NULL,
	"domain" text,
	"city" text,
	"country" text,
	"sector" text,
	"notes" text,
	"owner_id" uuid,
	"source" "calendar_source" DEFAULT 'local' NOT NULL,
	"external_id" text,
	"external_url" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"first_name" text,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"job_title" text,
	"notes" text,
	"owner_id" uuid,
	"source" "calendar_source" DEFAULT 'local' NOT NULL,
	"external_id" text,
	"external_url" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"contact_id" uuid,
	"name" text NOT NULL,
	"kind" "crm_deal_kind" DEFAULT 'autre' NOT NULL,
	"stage" "crm_deal_stage" DEFAULT 'lead' NOT NULL,
	"product_line" text,
	"amount_eur" integer,
	"expected_close_date" date,
	"last_interaction_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"owner_id" uuid,
	"source" "calendar_source" DEFAULT 'local' NOT NULL,
	"external_id" text,
	"external_url" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "crm_company_id" uuid;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "crm_contact_id" uuid;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "crm_deal_id" uuid;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "report" text;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "report_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "follow_up_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "assistant_actions" ADD CONSTRAINT "assistant_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_actions" ADD CONSTRAINT "assistant_actions_conversation_id_assistant_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."assistant_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_conversations" ADD CONSTRAINT "assistant_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_messages" ADD CONSTRAINT "assistant_messages_conversation_id_assistant_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."assistant_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_tool_calls" ADD CONSTRAINT "assistant_tool_calls_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_tool_calls" ADD CONSTRAINT "assistant_tool_calls_conversation_id_assistant_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."assistant_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_companies" ADD CONSTRAINT "crm_companies_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_company_id_crm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."crm_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_contact_id_crm_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assistant_actions_user_idx" ON "assistant_actions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "assistant_actions_dedupe_idx" ON "assistant_actions" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "assistant_conversations_user_idx" ON "assistant_conversations" USING btree ("user_id","last_message_at");--> statement-breakpoint
CREATE INDEX "assistant_messages_conversation_idx" ON "assistant_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "assistant_tool_calls_user_idx" ON "assistant_tool_calls" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "crm_companies_name_idx" ON "crm_companies" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_companies_source_external_uidx" ON "crm_companies" USING btree ("source","external_id") WHERE "crm_companies"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "crm_contacts_company_idx" ON "crm_contacts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "crm_contacts_name_idx" ON "crm_contacts" USING btree ("last_name");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_contacts_source_external_uidx" ON "crm_contacts" USING btree ("source","external_id") WHERE "crm_contacts"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "crm_deals_stage_idx" ON "crm_deals" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "crm_deals_company_idx" ON "crm_deals" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "crm_deals_source_external_uidx" ON "crm_deals" USING btree ("source","external_id") WHERE "crm_deals"."external_id" is not null;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_crm_company_id_crm_companies_id_fk" FOREIGN KEY ("crm_company_id") REFERENCES "public"."crm_companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_crm_contact_id_crm_contacts_id_fk" FOREIGN KEY ("crm_contact_id") REFERENCES "public"."crm_contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_crm_deal_id_crm_deals_id_fk" FOREIGN KEY ("crm_deal_id") REFERENCES "public"."crm_deals"("id") ON DELETE set null ON UPDATE no action;