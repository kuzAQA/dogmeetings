import { privateJson } from "../../../../lib/session";
import { setTelegramChatEnabled, telegramChatSettings } from "../../../../lib/telegram-chat";
import { ChatError } from "../../../../server/infrastructure/chat-repository";
import { chatRequest } from "../../../../server/transport/chat";
import { readJsonRecord } from "../../../../server/transport/request-json";

export function GET(request: Request) {
  return chatRequest(request, async clientId => privateJson(await telegramChatSettings(clientId)));
}

export function PATCH(request: Request) {
  return chatRequest(request, async clientId => {
    const payload = await readJsonRecord(request);
    if (typeof payload?.enabled !== "boolean") throw new ChatError(400, "Укажите состояние уведомлений.");
    if (payload.enabled && !(await telegramChatSettings(clientId)).subscribed) {
      throw new ChatError(409, "Сначала подтвердите подписку на прогулки ЖК в Telegram-боте.");
    }
    await setTelegramChatEnabled(clientId, payload.enabled);
    return privateJson(await telegramChatSettings(clientId));
  });
}
