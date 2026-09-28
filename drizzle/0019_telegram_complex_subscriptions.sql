CREATE TABLE "telegram_subscription_intents" (
  "token_hash" varchar(64) PRIMARY KEY NOT NULL,
  "city" varchar(80) NOT NULL,
  "district" varchar(80) NOT NULL,
  "residential_complex" varchar(120) NOT NULL,
  "used_by_chat_id" varchar(20),
  "used_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "telegram_subscription_intents_expires_at_idx" ON "telegram_subscription_intents" USING btree ("expires_at");
--> statement-breakpoint
CREATE TABLE "telegram_complex_subscriptions" (
  "id" uuid PRIMARY KEY NOT NULL,
  "telegram_chat_id" varchar(20) NOT NULL,
  "city" varchar(80) NOT NULL,
  "district" varchar(80) NOT NULL,
  "residential_complex" varchar(120) NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "deactivated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_complex_subscriptions_chat_location_unique" ON "telegram_complex_subscriptions" USING btree ("telegram_chat_id","city","district","residential_complex");
--> statement-breakpoint
CREATE INDEX "telegram_complex_subscriptions_active_location_idx" ON "telegram_complex_subscriptions" USING btree ("active","city","district","residential_complex");
--> statement-breakpoint
CREATE TABLE "telegram_walk_notifications" (
  "id" uuid PRIMARY KEY NOT NULL,
  "walk_id" uuid NOT NULL REFERENCES "walks"("id") ON DELETE CASCADE,
  "subscription_id" uuid NOT NULL REFERENCES "telegram_complex_subscriptions"("id") ON DELETE CASCADE,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_error" varchar(250),
  "sent_at" timestamp with time zone,
  "failed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_walk_notifications_walk_subscription_unique" ON "telegram_walk_notifications" USING btree ("walk_id","subscription_id");
--> statement-breakpoint
CREATE INDEX "telegram_walk_notifications_pending_idx" ON "telegram_walk_notifications" USING btree ("next_attempt_at");
