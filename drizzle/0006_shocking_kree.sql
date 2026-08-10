CREATE TABLE "locations" (
	"city" varchar(80) NOT NULL,
	"district" varchar(80) NOT NULL,
	"residential_complex" varchar(120) NOT NULL,
	CONSTRAINT "locations_city_district_complex_pk" PRIMARY KEY("city","district","residential_complex")
);
--> statement-breakpoint
INSERT INTO "locations" ("city", "district", "residential_complex") VALUES
	('Москва', 'Коммунарка', 'Дзен-кварталы'),
	('Москва', 'Коммунарка', 'Москвичка')
ON CONFLICT DO NOTHING;
