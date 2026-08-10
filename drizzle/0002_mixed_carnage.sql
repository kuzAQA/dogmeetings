ALTER TABLE "walks" ADD COLUMN "schedule_type" varchar(10) DEFAULT 'today' NOT NULL;--> statement-breakpoint
ALTER TABLE "walks" ADD COLUMN "walk_date" date DEFAULT CURRENT_DATE NOT NULL;--> statement-breakpoint
ALTER TABLE "walks" ADD COLUMN "walk_time" time DEFAULT '12:00:00' NOT NULL;--> statement-breakpoint
CREATE INDEX "walks_schedule_idx" ON "walks" USING btree ("schedule_type","walk_date","walk_time");