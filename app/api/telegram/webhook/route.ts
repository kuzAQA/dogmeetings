import { isTelegramWebhookRequest, telegramBotRequest } from "../../../../lib/telegram";
import {
  activateTelegramComplexSubscription,
  listTelegramComplexSubscriptions,
  prepareTelegramComplexSubscription,
  deactivateTelegramComplexSubscription,
  telegramMessagesActive,
  createTelegramMessagesUnsubscribeToken,
  type TelegramSubscriptionPurpose
} from "../../../../lib/telegram-subscriptions";
import {
  telegramStartToken,
  telegramSubscriptionConfirmation,
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

async function sendTelegramSubscriptionMenu(chatId: string) {
  await telegramBotRequest("sendMessage", { chat_id: chatId, text: "От каких уведомлений вы хотите отписаться?",
    reply_markup: { inline_keyboard: [[{ text: "От прогулок", callback_data: "subscriptions:walks" }], [{ text: "От сообщений", callback_data: "subscriptions:messages" }]] } });
}

async function sendTelegramMessagesConfirmation(chatId: string, token?: string) {
  const confirmation = token ?? await createTelegramMessagesUnsubscribeToken(chatId);
  await telegramBotRequest("sendMessage", { chat_id: chatId,
    text: confirmation ? "Вы точно хотите отписаться от уведомлений о личных сообщениях других владельцев собак?" : "У вас нет активной подписки на сообщения.",
    reply_markup: { inline_keyboard: [
      ...(confirmation ? [[{ text: "Отписаться", callback_data: `messages-unsubscribe:${confirmation}` }]] : []),
      [{ text: "Назад", callback_data: "subscriptions:back" }]
    ] } });
}

async function handleTelegramStart(message: Record<string, unknown>) {
  const chat = isRecord(message.chat) ? message.chat : null;
  const chatId = telegramChatId(chat);
  if (!chatId || chat?.type !== "private" || typeof message.text !== "string"
    || !/^\/start(?:@[A-Za-z0-9_]{5,32})?(?:\s|$)/.test(message.text)) return false;
  const token = telegramStartToken(message.text);
  if (!token && /^\/start(?:@[A-Za-z0-9_]{5,32})?\s*$/.test(message.text)) {
    const [walks, messages] = await Promise.all([listTelegramComplexSubscriptions(chatId), telegramMessagesActive(chatId)]);
    if (walks.length || messages) await sendTelegramSubscriptionMenu(chatId);
    else await telegramBotRequest("sendMessage", { chat_id: chatId,
      text: "Получайте уведомления о прогулках и новых сообщениях. Откройте Dogmeet.ru, чтобы настроить подписки.",
      reply_markup: { inline_keyboard: [[{ text: "Открыть Dogmeet.ru", url: `${PUBLIC_ORIGIN}/?telegram=notifications` }]] } });
    return true;
  }
  const result = token ? await prepareTelegramComplexSubscription(token, chatId) : { status: "expired" as const };
  if (typeof message.message_id === "number" && Number.isSafeInteger(message.message_id)) {
    await telegramBotRequest("deleteMessage", { chat_id: chatId, message_id: message.message_id });
  }
  if (result.status === "expired") {
    await telegramBotRequest("sendMessage", { chat_id: chatId, text: "Ссылка для настройки уведомлений недействительна или просрочена. Снова откройте бота с сайта Dogmeet.ru." });
    return true;
  }
  if (result.purpose === "messages-check") {
    await telegramBotRequest("sendMessage", { chat_id: chatId, text: result.enabled ? "Подписка на уведомления о личных сообщениях активна." : "Подписка на уведомления о личных сообщениях неактивна." });
  } else if (result.purpose === "messages-unsubscribe") {
    await sendTelegramMessagesConfirmation(chatId, token!);
  } else {
    if (result.purpose === "combined") {
      const subscriptions = await listTelegramComplexSubscriptions(chatId);
      if (subscriptions.length) {
        await telegramBotRequest("sendMessage", { chat_id: chatId,
          text: `Подписка на уведомления о прогулках уже активна. Ваши ЖК: ${subscriptions.map(subscription => `„${subscription.complex}“`).join(", ")}.` });
        return true;
      }
    }
    await telegramBotRequest("sendMessage", { chat_id: chatId,
      text: result.purpose === "combined"
        ? `Получайте уведомления о новых прогулках в ЖК „${result.complex}“ и о новых сообщениях от других владельцев собак`
        : "Получайте уведомления о новых личных сообщениях от других владельцев собак. Текст переписки остаётся на сайте.",
      reply_markup: { inline_keyboard: [[{ text: "Подписаться", callback_data: `${result.purpose === "combined" ? "complex-subscribe" : "messages-subscribe"}:${token}` }]] } });
  }
  return true;
}

async function handleTelegramSubscribeCallback(callbackId: string, chatId: string, messageId: number, token: string, purpose: TelegramSubscriptionPurpose = "combined") {
  const result = await activateTelegramComplexSubscription(token, chatId, purpose);
  if (result.status === "expired") {
    await callbackAnswer(callbackId, "Ссылка недействительна или просрочена. Снова откройте бота с сайта Dogmeet.ru.", true);
    return;
  }
  if (result.status === "processed") { await callbackAnswer(callbackId, "Это действие уже обработано."); return; }
  await callbackAnswer(callbackId, "Настройки сохранены.");
  if (purpose !== "messages-unsubscribe") {
    await telegramBotRequest("deleteMessage", { chat_id: chatId, message_id: messageId });
  }
  await telegramBotRequest("sendMessage", { chat_id: chatId,
    text: purpose === "combined" ? `✅ Вы подписались на уведомления о прогулках ЖК „${result.complex}“ и о новых личных сообщениях.`
      : purpose === "messages-subscribe" ? "✅ Вы подписались на уведомления о личных сообщениях." : "✅ Подписка на уведомления о личных сообщениях отключена." });
}

async function sendTelegramSubscriptions(chatId: string, messageId?: number) {
  const subscriptions = await listTelegramComplexSubscriptions(chatId);
  await telegramBotRequest(messageId === undefined ? "sendMessage" : "editMessageText", {
    chat_id: chatId,
    ...(messageId === undefined ? {} : { message_id: messageId }),
    text: subscriptions.length
      ? "🏘️ Ваши подписки\nНажмите на нужный ЖК, чтобы отключить его уведомления."
      : "У вас пока нет активных подписок. Откройте бота с сайта Dogmeet.ru, чтобы подписаться на уведомления вашего ЖК.",
    reply_markup: {
      inline_keyboard: [...subscriptions.map(subscription => [{
        text: subscription.complex,
        callback_data: telegramUnsubscribeCallbackData(subscription.id)
      }]), [{ text: "Назад", callback_data: "subscriptions:back" }]]
    }
  });
}

async function handleTelegramSubscriptions(message: Record<string, unknown>) {
  const chat = isRecord(message.chat) ? message.chat : null;
  const chatId = telegramChatId(chat);
  if (!chatId || chat?.type !== "private" || typeof message.text !== "string"
    || !/^\/subscriptions(?:@[A-Za-z0-9_]{5,32})?\s*$/.test(message.text)) return false;
  try {
    await sendTelegramSubscriptionMenu(chatId);
  } catch (error) {
    console.error("[telegram] Не удалось загрузить подписки.", error);
    await telegramBotRequest("sendMessage", { chat_id: chatId, text: "Не удалось загрузить подписки. Повторите /subscriptions." });
  }
  return true;
}

async function handleTelegramUnsubscribeCallback(callbackId: string, chatId: string, subscriptionId: string, messageId: number) {
  const result = await deactivateTelegramComplexSubscription(subscriptionId, chatId);
  await callbackAnswer(callbackId, result.status === "unsubscribed" ? "Подписка отключена." : "Подписка уже отключена.");
  if (result.status === "unsubscribed") {
    await telegramBotRequest("sendMessage", {
      chat_id: chatId,
      text: `✅ Подписка на уведомления ЖК «${result.complex}» отменена.`
    });
  }
  await sendTelegramSubscriptions(chatId, messageId);
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
      if (!await handleTelegramSubscriptions(startMessage)) await handleTelegramStart(startMessage);
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

  const subscriptionAction = typeof callback.data === "string" && /^(?:complex-subscribe:|messages-subscribe:|messages-unsubscribe:|subscriptions:)/.test(callback.data);
  if (subscriptionAction) {
    const sender = isRecord(callback.from) ? telegramChatId(callback.from) : null;
    if (chat.type !== "private" || sender !== chatId) {
      await callbackAnswer(callbackId, "Не удалось обработать подписку в этом чате.", true);
      return Response.json({ ok: true });
    }
    try {
      if (callback.data === "subscriptions:back") {
        await callbackAnswer(callbackId, "Назад");
        await telegramBotRequest("deleteMessage", { chat_id: chatId, message_id: messageId });
        await sendTelegramSubscriptionMenu(chatId);
      } else if (callback.data === "subscriptions:walks") {
        await callbackAnswer(callbackId, "Прогулки");
        await telegramBotRequest("deleteMessage", { chat_id: chatId, message_id: messageId });
        await sendTelegramSubscriptions(chatId);
      } else if (callback.data === "subscriptions:messages") {
        await callbackAnswer(callbackId, "Сообщения");
        await telegramBotRequest("deleteMessage", { chat_id: chatId, message_id: messageId });
        await sendTelegramMessagesConfirmation(chatId);
      } else {
        const confirmation = telegramSubscriptionConfirmation(callback.data);
        if (!confirmation) await callbackAnswer(callbackId, "Ссылка недействительна. Снова откройте бота с сайта Dogmeet.ru.", true);
        else await handleTelegramSubscribeCallback(callbackId, chatId, messageId as number, confirmation.token, confirmation.purpose);
      }
    } catch (error) {
      console.error("[telegram] Не удалось изменить подписку.", error);
      await callbackAnswer(callbackId, "Не удалось обработать подписку. Повторите попытку.", true);
    }
    return Response.json({ ok: true });
  }

  const subscriptionId = telegramUnsubscribeSubscriptionId(callback.data);
  if (subscriptionId) {
    const sender = isRecord(callback.from) ? telegramChatId(callback.from) : null;
    if (chat.type !== "private" || sender !== chatId) {
      await callbackAnswer(callbackId, "Не удалось обработать подписку в этом чате.", true);
      return Response.json({ ok: true });
    }
    try {
      await handleTelegramUnsubscribeCallback(callbackId, chatId, subscriptionId, messageId as number);
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
