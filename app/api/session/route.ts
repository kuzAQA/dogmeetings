import { and, eq } from "drizzle-orm";
import { withDb } from "../../../db";
import { locations } from "../../../db/schema";
import { databaseErrorMessage } from "../../../lib/database-error";
import {
  createClientSession,
  getClientSession,
  isSameOriginRequest,
  privateJson,
  refreshClientSession,
  sessionCookie,
  sessionPayload,
  type SessionLocation,
  updateSessionLocation
} from "../../../lib/session";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeLocation(value: unknown): SessionLocation | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<SessionLocation>;
  const location = {
    city: String(source.city ?? "").normalize("NFKC").trim(),
    district: String(source.district ?? "").normalize("NFKC").trim(),
    complex: String(source.complex ?? "").normalize("NFKC").trim()
  };

  if (!location.city || !location.district || !location.complex) return null;
  if (location.city.length > 80 || location.district.length > 80 || location.complex.length > 120) {
    return null;
  }
  return location;
}

async function knownLocation(location: SessionLocation) {
  const [row] = await withDb((db) => db
    .select({ city: locations.city })
    .from(locations)
    .where(and(
      eq(locations.city, location.city),
      eq(locations.district, location.district),
      eq(locations.residentialComplex, location.complex)
    ))
    .limit(1));
  return Boolean(row);
}

function databaseError(error: unknown) {
  return databaseErrorMessage(error, "Не удалось создать безопасную сессию.", "База данных ещё не подготовлена. Примените последнюю миграцию.");
}

export async function GET(request: Request) {
  try {
    const current = await getClientSession(request);
    if (!current) {
      return privateJson({ error: "Сессия не найдена." }, { status: 401 });
    }

    const refreshed = await refreshClientSession(current);
    return privateJson(
      sessionPayload(refreshed),
      {},
      sessionCookie(request, refreshed)
    );
  } catch (error) {
    return privateJson({ error: databaseError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return privateJson({ error: "Запрос отклонён." }, { status: 403 });
  }

  try {
    const current = await getClientSession(request);
    if (current) {
      const refreshed = await refreshClientSession(current);
      return privateJson(
        sessionPayload(refreshed),
        {},
        sessionCookie(request, refreshed)
      );
    }

    const payload = await request.json().catch(() => ({})) as {
      legacyClientId?: string;
      legacyLocation?: unknown;
      legacyHasLocation?: boolean;
    };
    const legacyClientId = String(payload.legacyClientId ?? "").trim();
    if (legacyClientId && !uuidPattern.test(legacyClientId)) {
      return privateJson({ error: "Некорректные данные переноса сессии." }, { status: 400 });
    }
    const migratingLegacyClient = uuidPattern.test(legacyClientId);
    const clientId = migratingLegacyClient ? legacyClientId : crypto.randomUUID();
    const legacyLocation = normalizeLocation(payload.legacyLocation);
    const migrateLocation = Boolean(
      payload.legacyHasLocation && legacyLocation && await knownLocation(legacyLocation)
    );

    const session = await createClientSession({
      clientId,
      location: migrateLocation ? legacyLocation : null,
      hasLocation: migrateLocation,
      replaceExisting: migratingLegacyClient
    });
    return privateJson(
      sessionPayload(session),
      { status: 201 },
      sessionCookie(request, session)
    );
  } catch (error) {
    return privateJson({ error: databaseError(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) {
    return privateJson({ error: "Запрос отклонён." }, { status: 403 });
  }

  try {
    const session = await getClientSession(request);
    if (!session) {
      return privateJson({ error: "Сессия истекла. Обновите страницу." }, { status: 401 });
    }

    const payload = await request.json().catch(() => null) as { location?: unknown } | null;
    const location = normalizeLocation(payload?.location);
    if (!location || !await knownLocation(location)) {
      return privateJson({ error: "Выберите доступную локацию." }, { status: 400 });
    }

    const updated = await updateSessionLocation(session, location);
    return privateJson(
      sessionPayload(updated),
      {},
      sessionCookie(request, updated)
    );
  } catch (error) {
    return privateJson({ error: databaseError(error) }, { status: 500 });
  }
}
