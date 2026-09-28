import { databaseErrorMessage } from "../../../../lib/database-error";
import { getClientSession, isSameOriginRequest, privateJson } from "../../../../lib/session";
import { createTelegramSubscriptionLink } from "../../../../lib/telegram-subscriptions";
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
    const location = getSavedLocation(session);
    if (!location) {
      return privateJson({ error: "Сначала сохраните локацию прогулки." }, { status: 400 });
    }

    return privateJson({ link: await createTelegramSubscriptionLink(location) });
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith("Telegram-")
      ? error.message
      : databaseErrorMessage(error, "Не удалось подготовить ссылку Telegram.", "База данных ещё не подготовлена. Примените последнюю миграцию.");
    return privateJson({ error: message }, { status: message.startsWith("Telegram-") ? 503 : 500 });
  }
}
