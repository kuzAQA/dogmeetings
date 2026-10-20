import { sql } from "drizzle-orm";
import { bigint, boolean, check, customType, date, index, integer, jsonb, pgTable, primaryKey, text, time, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import type { AnnouncementExclusions, AnnouncementPage, AnnouncementStatus } from "../lib/announcement-types";

export const dialogs = pgTable("dialogs", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientLow: uuid("client_low").notNull(),
  clientHigh: uuid("client_high").notNull(),
  lowPetId: uuid("low_pet_id").references(() => pets.id, { onDelete: "set null" }),
  highPetId: uuid("high_pet_id").references(() => pets.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastSeq: bigint("last_seq", { mode: "number" }).notNull().default(0),
  lowHiddenThrough: bigint("low_hidden_through", { mode: "number" }).notNull().default(0),
  highHiddenThrough: bigint("high_hidden_through", { mode: "number" }).notNull().default(0)
}, table => [
  check("dialogs_pair_order", sql`${table.clientLow} < ${table.clientHigh}`),
  uniqueIndex("dialogs_pair_unique").on(table.clientLow, table.clientHigh),
  index("dialogs_client_low_idx").on(table.clientLow),
  index("dialogs_client_high_idx").on(table.clientHigh),
  index("dialogs_expires_at_idx").on(table.expiresAt)
]);

export const dialogMessages = pgTable("dialog_messages", {
  dialogId: uuid("dialog_id").notNull().references(() => dialogs.id, { onDelete: "cascade" }),
  seq: bigint("seq", { mode: "number" }).notNull(),
  senderClientId: uuid("sender_client_id").notNull(),
  requestId: uuid("request_id").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  readAt: timestamp("read_at", { withTimezone: true })
}, table => [
  primaryKey({ columns: [table.dialogId, table.seq] }),
  uniqueIndex("dialog_messages_request_unique").on(table.dialogId, table.senderClientId, table.requestId),
  check("dialog_messages_text_check", sql`char_length(${table.text}) BETWEEN 1 AND 2000`)
]);

export const announcementCampaigns = pgTable("announcement_campaigns", {
  id: varchar("id", { length: 100 }).primaryKey(),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  permanent: boolean("permanent").notNull().default(false),
  status: varchar("status", { length: 16 }).$type<AnnouncementStatus>().notNull().default("active"),
  pages: jsonb("pages").$type<AnnouncementPage[]>().notNull(),
  exclusions: jsonb("exclusions").$type<AnnouncementExclusions>().notNull().default({ cities: [], districts: [], complexes: [] })
}, (table) => [
  index("announcement_campaigns_ends_at_idx").on(table.endsAt),
  check("announcement_campaigns_status_check", sql`${table.status} IN ('active', 'paused', 'disabled', 'information')`)
]);

export const announcementReceipts = pgTable("announcement_receipts", {
  clientId: uuid("client_id").notNull(),
  bannerId: varchar("banner_id", { length: 100 }).notNull(),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [primaryKey({ columns: [table.clientId, table.bannerId] })]);

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
    breed: varchar("breed", { length: 80 }).notNull(),
    ownerName: varchar("owner_name", { length: 60 }).notNull(),
    description: varchar("description", { length: 100 }),
    contactType: varchar("contact_type", { length: 10 }),
    contact: varchar("contact", { length: 120 }),
    photo: bytea("photo"),
    photoType: varchar("photo_type", { length: 50 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("pets_created_at_idx").on(table.createdAt),
    index("pets_client_id_idx").on(table.clientId)
  ]
);

export const petCollaborators = pgTable(
  "pet_collaborators",
  {
    petId: uuid("pet_id").notNull().references(() => pets.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull(),
    grantedByClientId: uuid("granted_by_client_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    primaryKey({
      name: "pet_collaborators_pet_client_pk",
      columns: [table.petId, table.clientId]
    }),
    index("pet_collaborators_client_id_idx").on(table.clientId)
  ]
);

export const petShareLinks = pgTable(
  "pet_share_links",
  {
    token: varchar("token", { length: 64 }).primaryKey(),
    petId: uuid("pet_id").notNull().references(() => pets.id, { onDelete: "cascade" }),
    city: varchar("city", { length: 80 }),
    district: varchar("district", { length: 80 }),
    residentialComplex: varchar("residential_complex", { length: 120 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("pet_share_links_pet_id_unique").on(table.petId),
    index("pet_share_links_updated_at_idx").on(table.updatedAt)
  ]
);

export const clientSessions = pgTable(
  "client_sessions",
  {
    tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
    clientId: uuid("client_id").notNull(),
    city: varchar("city", { length: 80 }),
    district: varchar("district", { length: 80 }),
    residentialComplex: varchar("residential_complex", { length: 120 }),
    hasLocation: boolean("has_location").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("client_sessions_client_id_unique").on(table.clientId),
    index("client_sessions_expires_at_idx").on(table.expiresAt)
  ]
);

export const telegramChatSettings = pgTable("telegram_chat_settings", {
  clientId: uuid("client_id").primaryKey(),
  telegramChatId: varchar("telegram_chat_id", { length: 20 }).notNull(),
  enabled: boolean("enabled").notNull().default(false)
});

export const telegramSubscriptionIntents = pgTable(
  "telegram_subscription_intents",
  {
    tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
    clientId: uuid("client_id"),
    purpose: varchar("purpose", { length: 24 }).notNull().default("combined"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    city: varchar("city", { length: 80 }).notNull(),
    district: varchar("district", { length: 80 }).notNull(),
    residentialComplex: varchar("residential_complex", { length: 120 }).notNull(),
    usedByChatId: varchar("used_by_chat_id", { length: 20 }),
    usedAt: timestamp("used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("telegram_subscription_intents_expires_at_idx").on(table.expiresAt)]
);

export const telegramComplexSubscriptions = pgTable(
  "telegram_complex_subscriptions",
  {
    id: uuid("id").primaryKey(),
    telegramChatId: varchar("telegram_chat_id", { length: 20 }).notNull(),
    city: varchar("city", { length: 80 }).notNull(),
    district: varchar("district", { length: 80 }).notNull(),
    residentialComplex: varchar("residential_complex", { length: 120 }).notNull(),
    active: boolean("active").notNull().default(true),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("telegram_complex_subscriptions_chat_location_unique").on(
      table.telegramChatId,
      table.city,
      table.district,
      table.residentialComplex
    ),
    index("telegram_complex_subscriptions_active_location_idx").on(
      table.active,
      table.city,
      table.district,
      table.residentialComplex
    )
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

export const locationRequests = pgTable(
  "location_requests",
  {
    id: uuid("id").primaryKey(),
    clientId: uuid("client_id").notNull(),
    city: varchar("city", { length: 80 }).notNull(),
    district: varchar("district", { length: 80 }).notNull(),
    residentialComplex: varchar("residential_complex", { length: 120 }).notNull(),
    telegramNotified: boolean("telegram_notified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("location_requests_client_id_idx").on(table.clientId),
    index("location_requests_created_at_idx").on(table.createdAt)
  ]
);

export const adminLoginAttempts = pgTable(
  "admin_login_attempts",
  {
    key: varchar("key", { length: 64 }).primaryKey(),
    failureCount: integer("failure_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("admin_login_attempts_updated_at_idx").on(table.updatedAt)]
);

export const adminSessions = pgTable(
  "admin_sessions",
  {
    nonce: varchar("nonce", { length: 24 }).primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [index("admin_sessions_expires_at_idx").on(table.expiresAt)]
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
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("places_location_name_unique").on(
      table.city,
      table.district,
      table.residentialComplex,
      table.normalizedName
    ),
    index("places_location_idx").on(table.city, table.district, table.residentialComplex),
    index("places_created_by_idx").on(table.createdBy)
  ]
);

export const walks = pgTable(
  "walks",
  {
    id: uuid("id").primaryKey(),
    petId: uuid("pet_id").notNull().references(() => pets.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull(),
    city: varchar("city", { length: 80 }).notNull(),
    district: varchar("district", { length: 80 }).notNull(),
    residentialComplex: varchar("residential_complex", { length: 120 }).notNull(),
    placeId: uuid("place_id").notNull().references(() => places.id, { onDelete: "restrict" }),
    place: varchar("place", { length: 100 }).notNull(),
    comment: varchar("comment", { length: 60 }),
    notifyTelegram: boolean("notify_telegram").notNull().default(true),
    scheduleType: varchar("schedule_type", { length: 10 }).notNull().default("today"),
    walkDate: date("walk_date", { mode: "string" }).notNull().default(sql`CURRENT_DATE`),
    walkTime: time("walk_time").notNull().default("12:00:00"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("walks_starts_at_idx").on(table.startsAt),
    index("walks_client_id_idx").on(table.clientId),
    index("walks_updated_at_idx").on(table.updatedAt),
    index("walks_schedule_idx").on(table.scheduleType, table.walkDate, table.walkTime),
    index("walks_location_idx").on(table.city, table.district, table.residentialComplex)
  ]
);

export const telegramApiLimits = pgTable("telegram_api_limits", {
  scope: text("scope").primaryKey(),
  nextAt: timestamp("next_at", { withTimezone: true }).notNull().defaultNow(),
  blockedUntil: timestamp("blocked_until", { withTimezone: true }).notNull().default(sql`'-infinity'::timestamptz`)
});

export const telegramBotMessages = pgTable("telegram_bot_messages", {
  deleteNextAttemptAt: timestamp("delete_next_attempt_at", { withTimezone: true }),
  walkId: uuid("walk_id"),
  chatId: varchar("chat_id", { length: 20 }).notNull(),
  messageId: integer("message_id").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull()
}, (table) => [
  primaryKey({ columns: [table.chatId, table.messageId] }),
  index("telegram_bot_messages_sent_at_idx").on(table.sentAt),
  index("telegram_bot_messages_walk_chat_idx").on(table.walkId, table.chatId)
]);

export const telegramWalkNotifications = pgTable(
  "telegram_walk_notifications",
  {
    id: uuid("id").primaryKey(),
    walkId: uuid("walk_id").notNull().references(() => walks.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id").notNull().references(() => telegramComplexSubscriptions.id, { onDelete: "cascade" }),
    messageText: text("message_text"),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: varchar("last_error", { length: 250 }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    uniqueIndex("telegram_walk_notifications_walk_subscription_unique").on(table.walkId, table.subscriptionId),
    index("telegram_walk_notifications_pending_idx").on(table.nextAttemptAt)
  ]
);
