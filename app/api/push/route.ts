import { privateJson } from "../../../lib/session";
import { chatRequest } from "../../../server/transport/chat";
import { ChatError } from "../../../server/infrastructure/chat-repository";
import { disablePushSubscription, savePushSubscription, subscriptionStatus } from "../../../server/infrastructure/push-repository";
import { pushEndpoint, pushSubscription } from "../../../server/push-validation.mjs";

function publicKey() {
  return process.env.VAPID_PUBLIC_KEY?.trim() || "";
}

export function GET(request: Request) {
  return chatRequest(request, async () => privateJson({ publicKey: publicKey(),
    configured: Boolean(publicKey() && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT) }));
}

export function POST(request: Request) {
  return chatRequest(request, async (clientId, sessionHash) => {
    const text = await request.text();
    if (text.length > 8192) throw new ChatError(413, "Слишком большой запрос.");
    let payload;
    try { payload = JSON.parse(text); } catch { throw new ChatError(400, "Некорректный запрос."); }
    if (!payload || !["status", "subscribe", "disable"].includes(payload.action)) throw new ChatError(400, "Некорректное действие.");
    let endpoint: string;
    let subscription;
    try {
      if (payload.action === "subscribe") subscription = pushSubscription(payload.subscription);
      endpoint = subscription?.endpoint ?? pushEndpoint(payload.endpoint);
    } catch { throw new ChatError(400, "Некорректная push-подписка или неподдерживаемый push-сервис."); }
    if (payload.action === "status") return privateJson(await subscriptionStatus(clientId, sessionHash, endpoint));
    if (payload.action === "disable") return privateJson(await disablePushSubscription(clientId, sessionHash, endpoint));
    if (!publicKey() || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) throw new ChatError(503, "Push-уведомления пока не настроены на сервере. Попробуйте позже.");
    return privateJson(await savePushSubscription(clientId, sessionHash, subscription!));
  });
}
