CREATE TABLE "location_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"client_id" uuid NOT NULL,
	"city" varchar(80) NOT NULL,
	"district" varchar(80) NOT NULL,
	"residential_complex" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "location_requests_client_id_idx" ON "location_requests" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "location_requests_created_at_idx" ON "location_requests" USING btree ("created_at");