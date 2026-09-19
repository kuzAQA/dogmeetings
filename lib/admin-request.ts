import { hasValidAdminSession } from "./admin-auth";
import { isSameOriginRequest } from "./session";
import { isTelegramWebhookRequest } from "./telegram";

export async function authorizeAdminRequest(request: Request, mutation = false, allowTelegramWebhook = false) {
  return (allowTelegramWebhook && isTelegramWebhookRequest(request))
    || ((!mutation || isSameOriginRequest(request)) && hasValidAdminSession(request));
}
