import { and, eq, gt, isNull } from "drizzle-orm";
import { withDb } from "../db";
import { telegramComplexSubscriptions, telegramSubscriptionIntents } from "../db/schema";
import { telegramBotUsername } from "./telegram";
import { isTelegramStartToken, telegramDeepLink } from "./telegram-subscription-protocol";

const INTENT_TTL_MS = 15 * 60 * 1000;
const chatIdPattern = /^-?\d{1,20}$/;

export type TelegramSubscriptionLocation = {
  city: string;
  district: string;
  complex: string;
};

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function newStartToken() {
  return crypto.randomUUID().replaceAll("-", "");
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return bytesToHex(new Uint8Array(digest));
}

function validChatId(chatId: string) {
  return chatIdPattern.test(chatId);
}

export async function createTelegramSubscriptionLink(location: TelegramSubscriptionLocation) {
  const username = await telegramBotUsername();
  if (!username) throw new Error("Telegram-бот сейчас недоступен. Повторите позже.");

  const token = newStartToken();
  const tokenHash = await hashToken(token);
  await withDb((db) => db.insert(telegramSubscriptionIntents).values({
    tokenHash,
    city: location.city,
    district: location.district,
    residentialComplex: location.complex,
    expiresAt: new Date(Date.now() + INTENT_TTL_MS)
  }));

  const link = telegramDeepLink(username, token);
  if (!link) throw new Error("Не удалось подготовить ссылку Telegram.");
  return link;
}

export async function activateTelegramComplexSubscription(token: string, chatId: string) {
  if (!isTelegramStartToken(token) || !validChatId(chatId)) return { status: "expired" as const };
  const tokenHash = await hashToken(token);
  const now = new Date();

  return withDb((db) => db.transaction(async (tx) => {
    let [intent] = await tx
      .select()
      .from(telegramSubscriptionIntents)
      .where(and(
        eq(telegramSubscriptionIntents.tokenHash, tokenHash),
        gt(telegramSubscriptionIntents.expiresAt, now)
      ))
      .limit(1);
    if (!intent || (intent.usedByChatId && intent.usedByChatId !== chatId)) return { status: "expired" as const };

    if (!intent.usedByChatId) {
      const [claimed] = await tx
        .update(telegramSubscriptionIntents)
        .set({ usedByChatId: chatId, usedAt: now })
        .where(and(
          eq(telegramSubscriptionIntents.tokenHash, tokenHash),
          isNull(telegramSubscriptionIntents.usedByChatId),
          gt(telegramSubscriptionIntents.expiresAt, now)
        ))
        .returning();
      if (!claimed) return { status: "expired" as const };
      intent = claimed;
    }

    const inserted = await tx
      .insert(telegramComplexSubscriptions)
      .values({
        id: crypto.randomUUID(),
        telegramChatId: chatId,
        city: intent.city,
        district: intent.district,
        residentialComplex: intent.residentialComplex
      })
      .onConflictDoNothing({
        target: [
          telegramComplexSubscriptions.telegramChatId,
          telegramComplexSubscriptions.city,
          telegramComplexSubscriptions.district,
          telegramComplexSubscriptions.residentialComplex
        ]
      })
      .returning({ id: telegramComplexSubscriptions.id });
    if (inserted.length > 0) {
      return { status: "subscribed" as const, complex: intent.residentialComplex, subscriptionId: inserted[0]!.id };
    }

    const [existing] = await tx
      .select({ id: telegramComplexSubscriptions.id, active: telegramComplexSubscriptions.active })
      .from(telegramComplexSubscriptions)
      .where(and(
        eq(telegramComplexSubscriptions.telegramChatId, chatId),
        eq(telegramComplexSubscriptions.city, intent.city),
        eq(telegramComplexSubscriptions.district, intent.district),
        eq(telegramComplexSubscriptions.residentialComplex, intent.residentialComplex)
      ))
      .limit(1);
    if (!existing) throw new Error("Не удалось создать подписку Telegram.");
    if (existing.active) {
      return { status: "active" as const, complex: intent.residentialComplex, subscriptionId: existing.id };
    }

    await tx
      .update(telegramComplexSubscriptions)
      .set({ active: true, deactivatedAt: null, updatedAt: now })
      .where(eq(telegramComplexSubscriptions.id, existing.id));
    return { status: "subscribed" as const, complex: intent.residentialComplex, subscriptionId: existing.id };
  }));
}

export async function deactivateTelegramComplexSubscription(subscriptionId: string, chatId: string) {
  if (!validChatId(chatId)) return { status: "inactive" as const };
  const [subscription] = await withDb((db) => db
    .select({ id: telegramComplexSubscriptions.id, active: telegramComplexSubscriptions.active })
    .from(telegramComplexSubscriptions)
    .where(and(
      eq(telegramComplexSubscriptions.id, subscriptionId),
      eq(telegramComplexSubscriptions.telegramChatId, chatId)
    ))
    .limit(1));
  if (!subscription || !subscription.active) return { status: "inactive" as const };

  await withDb((db) => db
    .update(telegramComplexSubscriptions)
    .set({ active: false, deactivatedAt: new Date(), updatedAt: new Date() })
    .where(eq(telegramComplexSubscriptions.id, subscription.id)));
  return { status: "unsubscribed" as const };
}
