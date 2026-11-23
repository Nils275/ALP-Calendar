CREATE TABLE "auth_login_limits" (
	"key_hash" text PRIMARY KEY NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auth_login_limits_locked_idx" ON "auth_login_limits" USING btree ("locked_until");--> statement-breakpoint
CREATE INDEX "auth_login_limits_updated_idx" ON "auth_login_limits" USING btree ("updated_at");