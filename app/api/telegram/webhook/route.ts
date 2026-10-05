import { isTelegramWebhookRequest, telegramBotRequest } from "../../../../lib/telegram";
import {
  activateTelegramComplexSubscription,
  deactivateTelegramComplexSubscription
} from "../../../../lib/telegram-subscriptions";
import {
  telegramStartToken,
  telegramUnsubscribeButtonText,
  telegramUnsubscribeCallbackData,
  telegramUnsubscribeSubscriptionId
} from "../../../../lib/telegram-subscription-protocol";
import { PUBLIC_ORIGIN } from "../../../../server/infrastructure/public-origin";
import { telegramRetentionBoundary } from "../../../../scripts/cleanup-expired-walks.mjs";
import { DELETE, PATCH } from "../../dogsfather/location-requests/route";

type Action = "approve" | "reject";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function callbackAction(data: unknown) {
  if (typeof data !== "string") return null;
  const match = /^location-request:(approve|reject):([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(data);
  return match ? { action: match[1] as Action, id: match[2] } : null;
}

async function callbackAnswer(id: string, text: string, showAlert = false) {
  return telegramBotRequest("answerCallbackQuery", {
    callback_query_id: id,
    text,
    show_alert: showAlert
  });
}

async function actionError(response: Response) {
  try {
    const payload = await response.json() as { error?: unknown };
    return typeof payload.error === "string" ? payload.error : "Не удалось обработать заявку.";
  } catch {
    return "Не удалось обработать заявку.";
  }
}

async function applyAction(request: Request, id: string, action: Action) {
  const url = new URL("/api/dogsfather/location-requests", request.url);
  const adminRequest = new Request(url, {
    method: action === "approve" ? "PATCH" : "DELETE",
    headers: {
      "Content-Type": "application/json",
      "x-telegram-bot-api-secret-token": request.headers.get("x-telegram-bot-api-secret-token") ?? ""
    },
    body: JSON.stringify({ id })
  });
  const response = action === "approve" ? await PATCH(adminRequest) : await DELETE(adminRequest);
  return response.ok ? "" : actionError(response);
}

function telegramChatId(chat: Record<string, unknown> | null) {
  const id = chat?.id;
  if (typeof id === "number" && Number.isSafeInteger(id)) return String(id);
  return typeof id === "string" && /^-?\d{1,20}$/.test(id) ? id : null;
}

async function handleTelegramStart(message: Record<string, unknown>) {
  const chat = isRecord(message.chat) ? message.chat : null;
  const chatId = telegramChatId(chat);
  const token = telegramStartToken(message.text);
  if (!chatId) return false;
  if (!token) {
    if (typeof message.text !== "string" || !/^\/start(?:@[A-Za-z0-9_]{5,32})?\s*$/.test(message.text)) return false;
    await telegramBotRequest("sendMessage", {
      chat_id: chatId,
      text: "Получайте уведомления о прогулках в вашем ЖК. Перейдите на сайт, выберите свой жилой комплекс, затем включите уведомления в Telegram.",
      reply_markup: { inline_keyboard: [[{ text: "Открыть Dogmeet.ru", url: `${PUBLIC_ORIGIN}/?telegram=notifications` }]] }
    });
    return true;
  }

  const result = await activateTelegramComplexSubscription(token, chatId);
  if (chat?.type === "private" && typeof message.message_id === "number" && Number.isSafeInteger(message.message_id)) {
    await telegramBotRequest("deleteMessage", { chat_id: chatId, message_id: message.message_id });
  }
  if (result.status === "expired") {
    await telegramBotRequest("sendMessage", {
      chat_id: chatId,
      text: "Ссылка для настройки уведомлений недействительна или уже использована. Откройте новую ссылку из приложения."
    });
    return true;
  }

  const callbackData = telegramUnsubscribeCallbackData(result.subscriptionId);
  if (!callbackData) throw new Error("Не удалось подготовить кнопку отписки.");
  const active = result.status === "active";
  await telegramBotRequest("sendMessage", {
    chat_id: chatId,
    text: active
      ? `Подписка на уведомления ЖК «${result.complex}» уже активна.`
      : `Подписка на уведомления ЖК «${result.complex}» успешно оформлена.`,
    reply_markup: {
      inline_keyboard: [[{
        text: telegramUnsubscribeButtonText(result.complex),
        callback_data: callbackData
      }]]
    }
  });
  return true;
}

async function handleTelegramUnsubscribeCallback(callbackId: string, chatId: string, subscriptionId: string) {
  const result = await deactivateTelegramComplexSubscription(subscriptionId, chatId);
  const text = result.status === "unsubscribed"
    ? "Уведомления этого ЖК отключены."
    : "Подписка на уведомления этого ЖК уже отключена.";
  await telegramBotRequest("sendMessage", { chat_id: chatId, text });
  await callbackAnswer(callbackId, result.status === "unsubscribed" ? "Подписка отключена." : "Подписка уже отключена.");
}

export async function POST(request: Request) {
  if (!isTelegramWebhookRequest(request)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  let update: unknown;
  try {
    update = await request.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  const startMessage = isRecord(update) && isRecord(update.message) ? update.message : null;
  if (startMessage) {
    if (typeof startMessage.date === "number" && startMessage.date * 1000 < telegramRetentionBoundary().getTime()) {
      return Response.json({ ok: true });
    }
    try {
      await handleTelegramStart(startMessage);
    } catch (error) {
      console.error("[telegram] Не удалось обработать /start для подписки ЖК.", error);
    }
    return Response.json({ ok: true });
  }

  const callback = isRecord(update) && isRecord(update.callback_query) ? update.callback_query : null;
  const callbackId = callback?.id;
  if (!callback || typeof callbackId !== "string" || !callbackId) return Response.json({ ok: true });

  const requested = callbackAction(callback.data);
  const message = isRecord(callback.message) ? callback.message : null;
  const chat = message && isRecord(message.chat) ? message.chat : null;
  const chatId = telegramChatId(chat);
  const messageId = message?.message_id;
  if (!message || !chat || !chatId || !Number.isSafeInteger(messageId)) {
    await callbackAnswer(callbackId, "Неизвестное действие.", true);
    return Response.json({ ok: true });
  }

  if (typeof message.date === "number" && message.date * 1000 < telegramRetentionBoundary().getTime()) {
    await callbackAnswer(callbackId, "Сообщение устарело. Откройте новую ссылку из приложения.", true);
    return Response.json({ ok: true });
  }

  const subscriptionId = telegramUnsubscribeSubscriptionId(callback.data);
  if (subscriptionId) {
    try {
      await handleTelegramUnsubscribeCallback(callbackId, chatId, subscriptionId);
    } catch (error) {
      console.error("[telegram] Не удалось обработать подписку ЖК.", error);
      await callbackAnswer(callbackId, "Не удалось обработать подписку. Повторите попытку.", true);
    }
    return Response.json({ ok: true });
  }

  if (!requested) {
    await callbackAnswer(callbackId, "Неизвестное действие.", true);
    return Response.json({ ok: true });
  }

  try {
    const error = await applyAction(request, requested.id, requested.action);
    if (error) {
      await callbackAnswer(callbackId, error, true);
      return Response.json({ ok: true });
    }

    const result = requested.action === "approve" ? "✅ Заявка одобрена" : "❌ Заявка отклонена";
    const deleted = await telegramBotRequest("deleteMessage", {
      chat_id: chatId,
      message_id: messageId
    });
    await callbackAnswer(callbackId, deleted ? result : "Заявка обработана, но сообщение не удалено.", !deleted);
  } catch (error) {
    console.error("[telegram] Не удалось обработать callback заявки на локацию.", error);
    await callbackAnswer(callbackId, "Не удалось обработать заявку. Повторите попытку.", true);
  }

  return Response.json({ ok: true });
}
