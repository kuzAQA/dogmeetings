import { withDb } from "../../../db";
import { locationRequests } from "../../../db/schema";
import { sendAdminLocationRequestNotification } from "../../../lib/admin-push";
import { databaseErrorMessage } from "../../../lib/database-error";
import { getClientSession, isSameOriginRequest, privateJson } from "../../../lib/session";

const containsLetter = /\p{L}/u;

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
}

function databaseError(error: unknown) {
  return databaseErrorMessage(error, "Не удалось отправить заявку.", "База данных ещё не подготовлена. Примените последнюю миграцию.");
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return privateJson({ error: "Запрос отклонён." }, { status: 403 });
  }

  try {
    const session = await getClientSession(request);
    if (!session) {
      return privateJson({ error: "Сессия истекла. Обновите страницу." }, { status: 401 });
    }

    const payload = await request.json().catch(() => null) as {
      city?: unknown;
      district?: unknown;
      complex?: unknown;
    } | null;
    const city = normalizeText(payload?.city);
    const district = normalizeText(payload?.district);
    const residentialComplex = normalizeText(payload?.complex);

    if (!city || city.length > 80 || !containsLetter.test(city)) {
      return privateJson({ error: "Укажите корректное название города до 80 символов." }, { status: 400 });
    }
    if (!district || district.length > 80 || !containsLetter.test(district)) {
      return privateJson({ error: "Укажите корректное название района до 80 символов." }, { status: 400 });
    }
    if (!residentialComplex || residentialComplex.length > 120 || !containsLetter.test(residentialComplex)) {
      return privateJson({ error: "Укажите корректное название жилого комплекса до 120 символов." }, { status: 400 });
    }

    const [savedRequest] = await withDb((db) => db
      .insert(locationRequests)
      .values({
        id: crypto.randomUUID(),
        clientId: session.clientId,
        city,
        district,
        residentialComplex
      })
      .returning({
        id: locationRequests.id,
        createdAt: locationRequests.createdAt
      }));

    await sendAdminLocationRequestNotification().catch(() => undefined);

    return privateJson({
      request: {
        id: savedRequest.id,
        createdAt: savedRequest.createdAt.toISOString()
      }
    }, { status: 201 });
  } catch (error) {
    return privateJson({ error: databaseError(error) }, { status: 500 });
  }
}
