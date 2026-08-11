ALTER TABLE "walks" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
UPDATE "walks" SET "updated_at" = "created_at";--> statement-breakpoint
ALTER TABLE "walks" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "walks" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "walks_updated_at_idx" ON "walks" USING btree ("updated_at");
