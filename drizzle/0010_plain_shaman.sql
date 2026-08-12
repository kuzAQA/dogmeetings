ALTER TABLE "pets" ADD COLUMN "updated_at" timestamp with time zone;--> statement-breakpoint
UPDATE "pets" SET "updated_at" = "created_at";--> statement-breakpoint
ALTER TABLE "pets" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "pets" ALTER COLUMN "updated_at" SET NOT NULL;
