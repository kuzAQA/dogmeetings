import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { withDb } from "../db";
import { telegramComplexSubscriptions, telegramSubscriptionIntents } from "../db/schema";
import { telegramBotUsername } from "./telegram";
import { isTelegramStartToken, telegramDeepLink } from "./telegram-subscription-protocol";

export type TelegramSubscriptionLocation = { city: string; district: string; complex: string };
export const telegramSubscriptionPurposes = ["combined", "messages-check", "messages-subscribe", "messages-unsubscribe"] as const;
export type TelegramSubscriptionPurpose = typeof telegramSubscriptionPurposes[number];
const INTENT_TTL_MS = 15 * 60 * 1000;
const validChatId = (chatId: string) => /^-?\d{1,20}$/.test(chatId);
const newStartToken = () => crypto.randomUUID().replaceAll("-", "");
async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function createTelegramSubscriptionLink(location: TelegramSubscriptionLocation | null, clientId: string, purpose: TelegramSubscriptionPurpose = "combined") {
  const username = await telegramBotUsername();
  if (!username) throw new Error("Telegram-бот сейчас недоступен. Повторите позже.");
  if (!telegramSubscriptionPurposes.includes(purpose) || (purpose === "combined" && !location)) throw new Error("Укажите назначение и локацию подписки.");
  const token = newStartToken();
  const tokenHash = await hashToken(token);
  await withDb(db => db.insert(telegramSubscriptionIntents).values({
    tokenHash, clientId, purpose,
    city: location?.city ?? "", district: location?.district ?? "", residentialComplex: location?.complex ?? "",
    expiresAt: new Date(Date.now() + INTENT_TTL_MS)
  }));
  const link = telegramDeepLink(username, token);
  if (!link) throw new Error("Не удалось подготовить ссылку Telegram.");
  return link;
}

export async function telegramMessagesActive(chatId: string) {
  if (!validChatId(chatId)) return false;
  return withDb(async db => {
    const { rows } = await db.$client.query<{ enabled: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM telegram_chat_settings WHERE telegram_chat_id = $1 AND enabled) AS enabled", [chatId]);
    return rows[0]?.enabled === true;
  });
}

export async function prepareTelegramComplexSubscription(token: string, chatId: string) {
  if (!isTelegramStartToken(token) || !validChatId(chatId)) return { status: "expired" as const };
  const tokenHash = await hashToken(token);
  const now = new Date();
  return withDb(db => db.transaction(async tx => {
    const [intent] = await tx.select().from(telegramSubscriptionIntents).where(and(
      eq(telegramSubscriptionIntents.tokenHash, tokenHash), gt(telegramSubscriptionIntents.expiresAt, now)
    )).limit(1).for("update");
    if (!intent?.clientId || !telegramSubscriptionPurposes.includes(intent.purpose as TelegramSubscriptionPurpose)
      || (intent.usedByChatId && intent.usedByChatId !== chatId)) return { status: "expired" as const };
    if (!intent.usedByChatId) await tx.update(telegramSubscriptionIntents).set({ usedByChatId: chatId, usedAt: now })
      .where(and(eq(telegramSubscriptionIntents.tokenHash, tokenHash), isNull(telegramSubscriptionIntents.usedByChatId)));
    let enabled = false;
    if (intent.purpose === "messages-check") {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${chatId}, 0))`);
      const result = await tx.execute<{ enabled: boolean }>(sql`SELECT EXISTS (SELECT 1 FROM telegram_chat_settings WHERE telegram_chat_id = ${chatId} AND enabled) AS enabled`);
      enabled = result.rows[0]?.enabled === true;
      if (!intent.completedAt) {
        await tx.execute(sql`INSERT INTO telegram_chat_settings (client_id, telegram_chat_id, enabled)
          VALUES (${intent.clientId}::uuid, ${chatId}, ${enabled})
          ON CONFLICT (client_id) DO UPDATE SET telegram_chat_id = EXCLUDED.telegram_chat_id, enabled = EXCLUDED.enabled`);
        await tx.update(telegramSubscriptionIntents).set({ completedAt: now }).where(eq(telegramSubscriptionIntents.tokenHash, tokenHash));
      }
    }
    return { status: "ready" as const, purpose: intent.purpose as TelegramSubscriptionPurpose, complex: intent.residentialComplex, enabled };
  }));
}

export async function activateTelegramComplexSubscription(token: string, chatId: string, purpose: TelegramSubscriptionPurpose = "combined") {
  if (!isTelegramStartToken(token) || !validChatId(chatId) || !telegramSubscriptionPurposes.includes(purpose) || purpose === "messages-check") return { status: "expired" as const };
  const tokenHash = await hashToken(token);
  const now = new Date();
  return withDb(db => db.transaction(async tx => {
    const [intent] = await tx.select().from(telegramSubscriptionIntents).where(and(
      eq(telegramSubscriptionIntents.tokenHash, tokenHash), eq(telegramSubscriptionIntents.usedByChatId, chatId),
      gt(telegramSubscriptionIntents.expiresAt, now), eq(telegramSubscriptionIntents.purpose, purpose)
    )).limit(1).for("update");
    if (!intent?.clientId) return { status: "expired" as const };
    if (intent.completedAt) return { status: "processed" as const, complex: intent.residentialComplex };
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${chatId}, 0))`);
    if (purpose === "messages-unsubscribe") {
      // A site link cannot turn off a different Telegram account's notifications.
      const result = await tx.execute(sql`SELECT client_id FROM telegram_chat_settings WHERE client_id = ${intent.clientId}::uuid AND telegram_chat_id = ${chatId}`);
      if (!result.rows.length) return { status: "expired" as const };
      await tx.execute(sql`UPDATE telegram_chat_settings SET enabled = false WHERE telegram_chat_id = ${chatId}`);
    } else {
      await tx.execute(sql`INSERT INTO telegram_chat_settings (client_id, telegram_chat_id, enabled)
        VALUES (${intent.clientId}::uuid, ${chatId}, true)
        ON CONFLICT (client_id) DO UPDATE SET telegram_chat_id = EXCLUDED.telegram_chat_id, enabled = true`);
      await tx.execute(sql`UPDATE telegram_chat_settings SET enabled = true WHERE telegram_chat_id = ${chatId}`);
      if (purpose === "combined") await tx.insert(telegramComplexSubscriptions).values({
        id: crypto.randomUUID(), telegramChatId: chatId, city: intent.city, district: intent.district, residentialComplex: intent.residentialComplex
      }).onConflictDoUpdate({
        target: [telegramComplexSubscriptions.telegramChatId, telegramComplexSubscriptions.city, telegramComplexSubscriptions.district, telegramComplexSubscriptions.residentialComplex],
        set: { active: true, deactivatedAt: null, updatedAt: now }
      });
    }
    await tx.update(telegramSubscriptionIntents).set({ completedAt: now }).where(eq(telegramSubscriptionIntents.tokenHash, tokenHash));
    return { status: "subscribed" as const, complex: intent.residentialComplex };
  }));
}

export async function createTelegramMessagesUnsubscribeToken(chatId: string) {
  if (!validChatId(chatId)) return null;
  const token = newStartToken();
  const tokenHash = await hashToken(token);
  return withDb(async db => {
    const { rows } = await db.$client.query<{ client_id: string }>("SELECT client_id FROM telegram_chat_settings WHERE telegram_chat_id = $1 AND enabled LIMIT 1", [chatId]);
    if (!rows[0]) return null;
    await db.insert(telegramSubscriptionIntents).values({ tokenHash, clientId: rows[0].client_id, purpose: "messages-unsubscribe",
      city: "", district: "", residentialComplex: "", usedByChatId: chatId, usedAt: new Date(), expiresAt: new Date(Date.now() + INTENT_TTL_MS) });
    return token;
  });
}

export async function listTelegramComplexSubscriptions(chatId: string) {
  if (!validChatId(chatId)) return [];
  return withDb(db => db.select({ id: telegramComplexSubscriptions.id, complex: telegramComplexSubscriptions.residentialComplex })
    .from(telegramComplexSubscriptions).where(and(eq(telegramComplexSubscriptions.telegramChatId, chatId), eq(telegramComplexSubscriptions.active, true))));
}

export async function deactivateTelegramComplexSubscription(subscriptionId: string, chatId: string) {
  if (!validChatId(chatId)) return { status: "inactive" as const };
  return withDb(async db => {
    const [subscription] = await db.update(telegramComplexSubscriptions).set({ active: false, deactivatedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(telegramComplexSubscriptions.id, subscriptionId), eq(telegramComplexSubscriptions.telegramChatId, chatId), eq(telegramComplexSubscriptions.active, true)))
      .returning({ complex: telegramComplexSubscriptions.residentialComplex });
    return subscription ? { status: "unsubscribed" as const, complex: subscription.complex } : { status: "inactive" as const };
  });
}
