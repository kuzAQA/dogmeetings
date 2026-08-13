CREATE TABLE "client_sessions" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"city" varchar(80),
	"district" varchar(80),
	"residential_complex" varchar(120),
	"has_location" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "client_sessions_client_id_unique" ON "client_sessions" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_sessions_expires_at_idx" ON "client_sessions" USING btree ("expires_at");