CREATE TABLE "pet_collaborators" (
	"pet_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"granted_by_client_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pet_collaborators_pet_client_pk" PRIMARY KEY("pet_id","client_id")
);
--> statement-breakpoint
CREATE TABLE "pet_share_links" (
	"token" varchar(64) PRIMARY KEY NOT NULL,
	"pet_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "walks" ADD COLUMN "client_id" uuid;--> statement-breakpoint
UPDATE "walks"
SET "client_id" = "pets"."client_id"
FROM "pets"
WHERE "walks"."pet_id" = "pets"."id";--> statement-breakpoint
ALTER TABLE "walks" ALTER COLUMN "client_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pet_collaborators" ADD CONSTRAINT "pet_collaborators_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pet_share_links" ADD CONSTRAINT "pet_share_links_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pet_collaborators_client_id_idx" ON "pet_collaborators" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pet_share_links_pet_id_unique" ON "pet_share_links" USING btree ("pet_id");--> statement-breakpoint
CREATE INDEX "pet_share_links_updated_at_idx" ON "pet_share_links" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "walks_client_id_idx" ON "walks" USING btree ("client_id");
