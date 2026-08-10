CREATE TABLE "places" (
	"id" uuid PRIMARY KEY NOT NULL,
	"city" varchar(80) NOT NULL,
	"district" varchar(80) NOT NULL,
	"residential_complex" varchar(120) NOT NULL,
	"name" varchar(100) NOT NULL,
	"normalized_name" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "places_location_name_unique" ON "places" USING btree ("city","district","residential_complex","normalized_name");--> statement-breakpoint
CREATE INDEX "places_location_idx" ON "places" USING btree ("city","district","residential_complex");--> statement-breakpoint
INSERT INTO "places" ("id", "city", "district", "residential_complex", "name", "normalized_name", "created_at")
SELECT
	gen_random_uuid(),
	"city",
	"district",
	"residential_complex",
	min(regexp_replace(btrim("place"), '[[:space:]]+', ' ', 'g')),
	lower(regexp_replace(btrim("place"), '[[:space:]]+', ' ', 'g')),
	min("created_at")
FROM "walks"
GROUP BY
	"city",
	"district",
	"residential_complex",
	lower(regexp_replace(btrim("place"), '[[:space:]]+', ' ', 'g'));--> statement-breakpoint
ALTER TABLE "walks" ADD COLUMN "place_id" uuid;--> statement-breakpoint
UPDATE "walks"
SET "place_id" = "places"."id",
	"place" = "places"."name"
FROM "places"
WHERE "walks"."city" = "places"."city"
	AND "walks"."district" = "places"."district"
	AND "walks"."residential_complex" = "places"."residential_complex"
	AND lower(regexp_replace(btrim("walks"."place"), '[[:space:]]+', ' ', 'g')) = "places"."normalized_name";--> statement-breakpoint
ALTER TABLE "walks" ALTER COLUMN "place_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "walks" ADD CONSTRAINT "walks_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE restrict ON UPDATE no action;
