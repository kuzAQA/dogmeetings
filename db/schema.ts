import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const pets = sqliteTable(
  "pets",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    ownerName: text("owner_name").notNull(),
    photoKey: text("photo_key").notNull(),
    photoType: text("photo_type").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`)
  },
  (table) => [index("pets_created_at_idx").on(table.createdAt)]
);
