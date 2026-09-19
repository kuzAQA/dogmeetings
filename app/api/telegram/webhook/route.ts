import { createAdminSessionCookie, revokeAdminSession } from "../../../../lib/admin-auth";
import { telegramBotRequest } from "../../../../lib/telegram";
import { DELETE, PATCH } from "../../dogsfather/location-requests/route";

type Action = "approve" | "reject";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function sameSecret(value: string | null, secret: string) {
  const candidate = value ?? "";
  let difference = candidate.length ^ secret.length;
  for (let index = 0; index < Math.max(candidate.length, secret.length); index += 1) {
    difference |= (candidate.charCodeAt(index) || 0) ^ (secret.charCodeAt(index) || 0);
  }
  return difference === 0;
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
  const cookie = (await createAdminSessionCookie(request)).split(";", 1)[0];
  const adminRequest = new Request(url, {
    method: action === "approve" ? "PATCH" : "DELETE",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: url.origin
    },
    body: JSON.stringify({ id })
  });
  try {
    const response = action === "approve" ? await PATCH(adminRequest) : await DELETE(adminRequest);
    return response.ok ? "" : actionError(response);
  } finally {
    await revokeAdminSession(adminRequest);
  }
}

export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!secret || !/^[A-Za-z0-9_-]{32,256}$/.test(secret) || !sameSecret(request.headers.get("x-telegram-bot-api-secret-token"), secret)) {
    return Response.json({ ok: false }, { status: 401 });
  }

  let update: unknown;
  try {
    update = await request.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  const callback = isRecord(update) && isRecord(update.callback_query) ? update.callback_query : null;
  const callbackId = callback?.id;
  if (!callback || typeof callbackId !== "string" || !callbackId) return Response.json({ ok: true });

  const requested = callbackAction(callback.data);
  const message = isRecord(callback.message) ? callback.message : null;
  const chat = message && isRecord(message.chat) ? message.chat : null;
  const chatId = chat?.id;
  const messageId = message?.message_id;
  if (!requested || !message || !chat || (typeof chatId !== "string" && typeof chatId !== "number") || !Number.isSafeInteger(messageId)) {
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
