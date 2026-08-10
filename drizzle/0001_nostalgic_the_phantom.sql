ALTER TABLE "pets" ADD COLUMN "client_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
CREATE INDEX "pets_client_id_idx" ON "pets" USING btree ("client_id");