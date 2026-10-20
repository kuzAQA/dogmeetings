import { privateJson } from "../../../../lib/session";
import { telegramChatSettings } from "../../../../lib/telegram-chat";
import { chatRequest } from "../../../../server/transport/chat";

export function GET(request: Request) {
  return chatRequest(request, async clientId => privateJson(await telegramChatSettings(clientId)));
}
