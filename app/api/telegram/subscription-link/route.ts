import { databaseErrorMessage } from "../../../../lib/database-error";
import { getClientSession, isSameOriginRequest, privateJson } from "../../../../lib/session";
import { createTelegramSubscriptionLink, telegramSubscriptionPurposes, type TelegramSubscriptionPurpose } from "../../../../lib/telegram-subscriptions";
import { getSavedLocation } from "../../../../server/domain/location";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return privateJson({ error: "Запрос отклонён." }, { status: 403 });
  }

  try {
    const session = await getClientSession(request);
    if (!session) {
      return privateJson({ error: "Сессия истекла. Обновите страницу." }, { status: 401 });
    }
    let body: unknown;
    try { body = await request.text().then(text => text ? JSON.parse(text) : {}); }
    catch { return privateJson({ error: "Некорректный запрос." }, { status: 400 }); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return privateJson({ error: "Некорректный запрос." }, { status: 400 });
    const purpose = "purpose" in body ? body.purpose : "combined";
    if (typeof purpose !== "string" || !telegramSubscriptionPurposes.includes(purpose as TelegramSubscriptionPurpose)) {
      return privateJson({ error: "Неизвестное назначение ссылки." }, { status: 400 });
    }
    const location = getSavedLocation(session);
    if (purpose === "combined" && !location) {
      return privateJson({ error: "Сначала сохраните локацию прогулки." }, { status: 400 });
    }

    return privateJson({ link: await createTelegramSubscriptionLink(location, session.clientId, purpose as TelegramSubscriptionPurpose) });
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith("Telegram-")
      ? error.message
      : databaseErrorMessage(error, "Не удалось подготовить ссылку Telegram.", "База данных ещё не подготовлена. Примените последнюю миграцию.");
    return privateJson({ error: message }, { status: message.startsWith("Telegram-") ? 503 : 500 });
  }
}
