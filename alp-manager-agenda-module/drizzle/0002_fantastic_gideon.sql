ALTER TABLE "crm_deals" ADD COLUMN "hubspot_pipeline_id" text;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "hubspot_pipeline_label" text;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "hubspot_stage_id" text;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "hubspot_stage_label" text;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "hubspot_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "crm_deals" ADD COLUMN "hubspot_updated_at" timestamp with time zone;