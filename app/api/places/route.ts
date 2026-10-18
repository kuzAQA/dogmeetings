import { and, asc, eq } from "drizzle-orm";
import { withDb } from "../../../db";
import { places, walks } from "../../../db/schema";
import { databaseErrorMessage } from "../../../lib/database-error";
import { getClientSession, isSameOriginRequest, privateJson } from "../../../lib/session";
import { capitalizePlaceName, MAX_WALK_PLACE_LENGTH, normalizePlaceName } from "../../../server/domain/walk";
import { readJsonRecord } from "../../../server/transport/request-json";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const city = params.get("city")?.trim() ?? "";
  const district = params.get("district")?.trim() ?? "";
  const residentialComplex = params.get("complex")?.trim() ?? "";
  const mine = params.get("scope") === "mine";

  if (!mine && (!city || !district || !residentialComplex)) {
    return Response.json({ error: "Некорректные параметры локации." }, { status: 400 });
  }

  try {
    const session = mine ? await getClientSession(request) : null;
    if (mine && !session) return privateJson({ error: "Сессия истекла. Обновите страницу." }, { status: 401 });
    if (mine && !session?.location?.city) return privateJson({ places: [] });
    const location = session?.location;
    const rows = await withDb((db) => {
      const query = db.select({ id: places.id, name: places.name })
        .from(places)
        .where(mine ? and(
          eq(places.createdBy, session!.clientId),
          eq(places.city, location!.city),
          location!.district ? eq(places.district, location!.district) : undefined,
          location!.complex ? eq(places.residentialComplex, location!.complex) : undefined
        ) : and(
          eq(places.city, city),
          eq(places.district, district),
          eq(places.residentialComplex, residentialComplex)
        ))
        .orderBy(asc(places.name));
      return mine ? query : query.limit(100);
    });

    return mine ? privateJson({ places: rows }) : Response.json({ places: rows });
  } catch (error) {
    return (mine ? privateJson : Response.json)({ error: databaseErrorMessage(error, "Не удалось получить список мест.") }, { status: 500 });
  }
}

function hasDatabaseCode(error: unknown, code: string): boolean {
  if (!error || typeof error !== "object") return false;
  return ("code" in error && error.code === code) || ("cause" in error && hasDatabaseCode(error.cause, code));
}

async function mutatePlace(request: Request, deleting: boolean) {
  if (!isSameOriginRequest(request)) return privateJson({ error: "Запрос отклонён." }, { status: 403 });
  try {
    const session = await getClientSession(request);
    if (!session) return privateJson({ error: "Сессия истекла. Обновите страницу." }, { status: 401 });
    const payload = await readJsonRecord(request);
    const id = typeof payload?.id === "string" ? payload.id : "";
    const name = typeof payload?.name === "string" ? capitalizePlaceName(payload.name) : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return privateJson({ error: "Некорректное место." }, { status: 400 });
    }
    if (!deleting && (!/\p{L}/u.test(name) || name.length > MAX_WALK_PLACE_LENGTH)) {
      return privateJson({ error: `Укажите название места до ${MAX_WALK_PLACE_LENGTH} символов.` }, { status: 400 });
    }
    const changed = await withDb(db => db.transaction(async tx => {
      const ownedPlace = and(eq(places.id, id), eq(places.createdBy, session.clientId));
      if (deleting) return tx.delete(places).where(ownedPlace).returning({ id: places.id });
      const updated = await tx.update(places).set({ name, normalizedName: normalizePlaceName(name) })
        .where(ownedPlace).returning({ id: places.id, name: places.name });
      if (updated.length) await tx.update(walks).set({ place: name, updatedAt: new Date() }).where(eq(walks.placeId, id));
      return updated;
    }));
    if (!changed.length) return privateJson({ error: "Место не найдено." }, { status: 404 });
    return privateJson(deleting ? { deleted: true } : { place: changed[0] });
  } catch (error) {
    if (hasDatabaseCode(error, "23503")) return privateJson({ error: "Оно используется в текущих прогулках на сегодня." }, { status: 409 });
    if (hasDatabaseCode(error, "23505")) return privateJson({ error: "Место с таким названием уже есть." }, { status: 409 });
    return privateJson({ error: databaseErrorMessage(error, "Не удалось изменить место.") }, { status: 500 });
  }
}

export async function PATCH(request: Request) { return mutatePlace(request, false); }
export async function DELETE(request: Request) { return mutatePlace(request, true); }
