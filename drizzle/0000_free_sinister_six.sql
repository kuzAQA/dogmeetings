CREATE TABLE "pets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(40) NOT NULL,
	"owner_name" varchar(60) NOT NULL,
	"photo" "bytea" NOT NULL,
	"photo_type" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "walks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pet_id" uuid NOT NULL,
	"city" varchar(80) NOT NULL,
	"district" varchar(80) NOT NULL,
	"residential_complex" varchar(120) NOT NULL,
	"place" varchar(100) NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "walks" ADD CONSTRAINT "walks_pet_id_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pets_created_at_idx" ON "pets" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "walks_starts_at_idx" ON "walks" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "walks_location_idx" ON "walks" USING btree ("city","district","residential_complex");