CREATE TABLE "admin_login_attempts" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "admin_login_attempts_updated_at_idx" ON "admin_login_attempts" USING btree ("updated_at");