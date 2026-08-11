UPDATE "pets"
SET "breed" = 'Без породы'
WHERE "breed" IS NULL OR btrim("breed") = '';--> statement-breakpoint
ALTER TABLE "pets" ALTER COLUMN "breed" SET NOT NULL;
