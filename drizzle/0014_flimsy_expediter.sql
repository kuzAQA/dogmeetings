CREATE TABLE "admin_push_subscriptions" (
	"endpoint_hash" varchar(64) PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" varchar(180) NOT NULL,
	"auth" varchar(64) NOT NULL,
	"user_agent" varchar(300),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "admin_push_subscriptions_updated_at_idx" ON "admin_push_subscriptions" USING btree ("updated_at");