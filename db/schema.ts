import { sql } from "drizzle-orm";
import { customType, date, index, pgTable, primaryKey, time, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({
  dataType() {
    return "bytea";
  }
});

export const pets = pgTable(
  "pets",
  {
    id: uuid("id").primaryKey(),
    clientId: uuid("client_id").notNull().defaultRandom(),
    name: varchar("name", { length: 40 }).notNull(),
    breed: varchar("breed", { length: 80 }),
    ownerName: varchar("owner_name", { length: 60 }).notNull(),
    photo: bytea("photo"),
    photoType: varchar("photo_type", { length: 50 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("pets_created_at_idx").on(table.createdAt),
    index("pets_client_id_idx").on(table.clientId)
  ]
);

export const locations = pgTable(
  "locations",
  {
    city: varchar("city", { length: 80 }).notNull(),
    district: varchar("district", { length: 80 }).notNull(),
    residentialComplex: varchar("residential_complex", { length: 120 }).notNull()
  },
  (table) => [
    primaryKey({
      name: "locations_city_district_complex_pk",
      columns: [table.city, table.district, table.residentialComplex]
    })
  ]
);

export const places = pgTable(
  "places",
  {
    id: uuid("id").primaryKey(),
    city: varchar("city", { length: 80 }).notNull(),
    district: varchar("district", { length: 80 }).notNull(),
    residentialComplex: varchar("residential_complex", { length: 120 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    normalizedName: varchar("normalized_name", { length: 100 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("places_location_name_unique").on(
      table.city,
      table.district,
      table.residentialComplex,
      table.normalizedName
    ),
    index("places_location_idx").on(table.city, table.district, table.residentialComplex)
  ]
);

export const walks = pgTable(
  "walks",
  {
    id: uuid("id").primaryKey(),
    petId: uuid("pet_id").notNull().references(() => pets.id, { onDelete: "cascade" }),
    city: varchar("city", { length: 80 }).notNull(),
    district: varchar("district", { length: 80 }).notNull(),
    residentialComplex: varchar("residential_complex", { length: 120 }).notNull(),
    placeId: uuid("place_id").notNull().references(() => places.id, { onDelete: "restrict" }),
    place: varchar("place", { length: 100 }).notNull(),
    scheduleType: varchar("schedule_type", { length: 10 }).notNull().default("today"),
    walkDate: date("walk_date", { mode: "string" }).notNull().default(sql`CURRENT_DATE`),
    walkTime: time("walk_time").notNull().default("12:00:00"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("walks_starts_at_idx").on(table.startsAt),
    index("walks_schedule_idx").on(table.scheduleType, table.walkDate, table.walkTime),
    index("walks_location_idx").on(table.city, table.district, table.residentialComplex)
  ]
);
