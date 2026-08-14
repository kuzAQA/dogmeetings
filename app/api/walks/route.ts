import { and, desc, eq, or } from "drizzle-orm";
import { withDb } from "../../../db";
import { pets, places, walks } from "../../../db/schema";
import { getClientSession, isSameOriginRequest, privateJson } from "../../../lib/session";

const MAX_WALK_META_LENGTH = 40;
const MAX_WALK_PLACE_LENGTH = MAX_WALK_META_LENGTH;

type WalkRow = {
  id: string;
  petId: string;
  petName: string;
  petBreed: string;
  ownerName: string;
  city: string;
  district: string;
  residentialComplex: string;
  placeId: string;
  place: string;
  comment: string | null;
  scheduleType: string;
  walkDate: string;
  walkTime: string;
  updatedAt: Date;
  petUpdatedAt: Date;
};

function publicWalk(walk: WalkRow) {
  return {
    id: walk.id,
    petId: walk.petId,
    pet: walk.petName,
    breed: walk.petBreed,
    owner: walk.ownerName,
    city: walk.city,
    district: walk.district,
    complex: walk.residentialComplex,
    placeId: walk.placeId,
    point: walk.place,
    comment: walk.comment,
    walkDate: walk.walkDate,
    walkTime: walk.walkTime.slice(0, 5),
    scheduleType: walk.scheduleType,
    updatedAt: walk.updatedAt.toISOString(),
    image: `/api/pet-photo?id=${encodeURIComponent(walk.petId)}&v=${walk.petUpdatedAt.getTime()}`
  };
}

function moscowDate(offsetDays = 0) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000));
}

function databaseError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("ECONNREFUSED") || message.includes("connect")) {
    return "Не удалось подключиться к PostgreSQL.";
  }
  return "Не удалось выполнить запрос к базе данных.";
}

function cleanPlaceName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function capitalizePlaceName(value: string) {
  return cleanPlaceName(value).replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase("ru-RU"));
}

function normalizePlaceName(value: string) {
  return cleanPlaceName(value).toLocaleLowerCase("ru-RU");
}

function cleanComment(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function privateError(message: string, status: number) {
  return privateJson({ error: message }, { status });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const ownWalks = params.get("scope") === "mine";
  const city = params.get("city")?.trim() ?? "";
  const district = params.get("district")?.trim() ?? "";
  const residentialComplex = params.get("complex")?.trim() ?? "";
  const today = moscowDate();

  if (!ownWalks && (!city || !district || !residentialComplex)) {
    return Response.json({ error: "Некорректные параметры локации." }, { status: 400 });
  }

  try {
    if (ownWalks) {
      const session = await getClientSession(request);
      if (!session) {
        return privateJson({ error: "Сессия истекла. Обновите страницу." }, { status: 401 });
      }

      const rows = await withDb((db) => db
        .select({
          id: walks.id,
          petId: pets.id,
          petName: pets.name,
          petBreed: pets.breed,
          ownerName: pets.ownerName,
          city: walks.city,
          district: walks.district,
          residentialComplex: walks.residentialComplex,
          placeId: walks.placeId,
          place: walks.place,
          comment: walks.comment,
          scheduleType: walks.scheduleType,
          walkDate: walks.walkDate,
          walkTime: walks.walkTime,
          updatedAt: walks.updatedAt,
          petUpdatedAt: pets.updatedAt
        })
        .from(walks)
        .innerJoin(pets, eq(walks.petId, pets.id))
        .where(eq(pets.clientId, session.clientId))
        .orderBy(desc(walks.updatedAt), desc(walks.createdAt))
        .limit(100));

      return privateJson({ walks: rows.map(publicWalk) });
    }

    const rows = await withDb((db) => db
        .select({
          id: walks.id,
          petId: pets.id,
          petName: pets.name,
          petBreed: pets.breed,
          ownerName: pets.ownerName,
          city: walks.city,
          district: walks.district,
          residentialComplex: walks.residentialComplex,
          placeId: walks.placeId,
          place: walks.place,
          comment: walks.comment,
          scheduleType: walks.scheduleType,
          walkDate: walks.walkDate,
          walkTime: walks.walkTime,
          updatedAt: walks.updatedAt,
          petUpdatedAt: pets.updatedAt
        })
        .from(walks)
        .innerJoin(pets, eq(walks.petId, pets.id))
        .where(and(
          eq(walks.city, city),
          eq(walks.district, district),
          eq(walks.residentialComplex, residentialComplex),
          or(eq(walks.scheduleType, "always"), eq(walks.walkDate, today))
        ))
        .orderBy(desc(walks.updatedAt), desc(walks.createdAt))
        .limit(100));

    return Response.json({ walks: rows.map(publicWalk) });
  } catch (error) {
    return ownWalks
      ? privateError(databaseError(error), 500)
      : Response.json({ error: databaseError(error) }, { status: 500 });
  }
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

    const payload = await request.json() as {
      petId?: string;
      place?: string;
      comment?: string;
      scheduleType?: string;
      walkTime?: string;
      city?: string;
      district?: string;
      complex?: string;
    };
    const petId = payload.petId?.trim() ?? "";
    const place = capitalizePlaceName(payload.place ?? "");
    const normalizedPlace = normalizePlaceName(place);
    const comment = cleanComment(payload.comment ?? "");
    const city = payload.city?.trim() ?? "";
    const district = payload.district?.trim() ?? "";
    const residentialComplex = payload.complex?.trim() ?? "";
    const scheduleType = payload.scheduleType?.trim() ?? "";
    const walkTime = payload.walkTime?.trim() ?? "";

    if (!/^[0-9a-f-]{36}$/i.test(petId)) {
      return privateError("Выберите питомца.", 400);
    }
    if (!place || place.length > MAX_WALK_PLACE_LENGTH) {
      return privateError(`Укажите место прогулки до ${MAX_WALK_PLACE_LENGTH} символов.`, 400);
    }
    if (!/\p{L}/u.test(place)) {
      return privateError("Название места прогулки должно содержать хотя бы одну букву.", 400);
    }
    if (comment.length > MAX_WALK_META_LENGTH) {
      return privateError(`Комментарий должен содержать не более ${MAX_WALK_META_LENGTH} символов.`, 400);
    }
    if (!city || !district || !residentialComplex) {
      return privateError("Не выбрана локация прогулки.", 400);
    }
    if (!new Set(["today", "tomorrow", "always"]).has(scheduleType)) {
      return privateError("Выберите день прогулки.", 400);
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(walkTime)) {
      return privateError("Укажите корректное время прогулки.", 400);
    }

    const walkDate = moscowDate(scheduleType === "tomorrow" ? 1 : 0);
    const startsAt = new Date(`${walkDate}T${walkTime}:00+03:00`);

    const result = await withDb((db) => db.transaction(async (tx) => {
      const [pet] = await tx
        .select({
          id: pets.id,
          name: pets.name,
          breed: pets.breed,
          ownerName: pets.ownerName,
          updatedAt: pets.updatedAt
        })
        .from(pets)
        .where(and(eq(pets.id, petId), eq(pets.clientId, session.clientId)))
        .limit(1);
      if (!pet) return null;

      const insertedPlaces = await tx
        .insert(places)
        .values({
          id: crypto.randomUUID(),
          city,
          district,
          residentialComplex,
          name: place,
          normalizedName: normalizedPlace
        })
        .onConflictDoNothing({
          target: [places.city, places.district, places.residentialComplex, places.normalizedName]
        })
        .returning({ id: places.id, name: places.name });

      let [sharedPlace] = insertedPlaces.length > 0 ? insertedPlaces : await tx
        .select({ id: places.id, name: places.name })
        .from(places)
        .where(and(
          eq(places.city, city),
          eq(places.district, district),
          eq(places.residentialComplex, residentialComplex),
          eq(places.normalizedName, normalizedPlace)
        ))
        .limit(1);

      if (!sharedPlace) throw new Error("Не удалось сохранить место прогулки.");

      const capitalizedSharedPlaceName = capitalizePlaceName(sharedPlace.name);
      if (sharedPlace.name !== capitalizedSharedPlaceName) {
        [sharedPlace] = await tx
          .update(places)
          .set({ name: capitalizedSharedPlaceName })
          .where(eq(places.id, sharedPlace.id))
          .returning({ id: places.id, name: places.name });
      }

      const [walk] = await tx
        .insert(walks)
        .values({
          id: crypto.randomUUID(),
          petId,
          city,
          district,
          residentialComplex,
          placeId: sharedPlace.id,
          place: sharedPlace.name,
          comment: comment || null,
          scheduleType,
          walkDate,
          walkTime,
          startsAt
        })
        .returning({
          id: walks.id,
          placeId: walks.placeId,
          place: walks.place,
          comment: walks.comment,
          scheduleType: walks.scheduleType,
          walkDate: walks.walkDate,
          walkTime: walks.walkTime,
          city: walks.city,
          district: walks.district,
          residentialComplex: walks.residentialComplex,
          updatedAt: walks.updatedAt
        });

      return { pet, walk };
    }));
    if (!result) {
      return privateError("Питомец не найден.", 404);
    }

    return privateJson({
      walk: publicWalk({
        ...result.walk,
        petId: result.pet.id,
        petName: result.pet.name,
        petBreed: result.pet.breed,
        ownerName: result.pet.ownerName,
        petUpdatedAt: result.pet.updatedAt
      })
    }, { status: 201 });
  } catch (error) {
    return privateError(databaseError(error), 500);
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

    const payload = await request.json() as {
      walkId?: string;
      petId?: string;
      place?: string;
      comment?: string;
      scheduleType?: string;
      walkTime?: string;
      city?: string;
      district?: string;
      complex?: string;
    };
    const walkId = payload.walkId?.trim() ?? "";
    const petId = payload.petId?.trim() ?? "";
    const place = capitalizePlaceName(payload.place ?? "");
    const normalizedPlace = normalizePlaceName(place);
    const comment = cleanComment(payload.comment ?? "");
    const city = payload.city?.trim() ?? "";
    const district = payload.district?.trim() ?? "";
    const residentialComplex = payload.complex?.trim() ?? "";
    const scheduleType = payload.scheduleType?.trim() ?? "";
    const walkTime = payload.walkTime?.trim() ?? "";

    if (!/^[0-9a-f-]{36}$/i.test(walkId) || !/^[0-9a-f-]{36}$/i.test(petId)) {
      return privateError("Некорректные данные прогулки.", 400);
    }
    if (!place || place.length > MAX_WALK_PLACE_LENGTH) {
      return privateError(`Укажите место прогулки до ${MAX_WALK_PLACE_LENGTH} символов.`, 400);
    }
    if (!/\p{L}/u.test(place)) {
      return privateError("Название места прогулки должно содержать хотя бы одну букву.", 400);
    }
    if (comment.length > MAX_WALK_META_LENGTH) {
      return privateError(`Комментарий должен содержать не более ${MAX_WALK_META_LENGTH} символов.`, 400);
    }
    if (!city || !district || !residentialComplex) {
      return privateError("Не выбрана локация прогулки.", 400);
    }
    if (!new Set(["today", "tomorrow", "always"]).has(scheduleType)) {
      return privateError("Выберите день прогулки.", 400);
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(walkTime)) {
      return privateError("Укажите корректное время прогулки.", 400);
    }

    const walkDate = moscowDate(scheduleType === "tomorrow" ? 1 : 0);
    const startsAt = new Date(`${walkDate}T${walkTime}:00+03:00`);
    const result = await withDb((db) => db.transaction(async (tx) => {
      const [ownedWalk] = await tx
        .select({ id: walks.id })
        .from(walks)
        .innerJoin(pets, eq(walks.petId, pets.id))
        .where(and(eq(walks.id, walkId), eq(pets.clientId, session.clientId)))
        .limit(1);
      if (!ownedWalk) return null;

      const [pet] = await tx
        .select({
          id: pets.id,
          name: pets.name,
          breed: pets.breed,
          ownerName: pets.ownerName,
          updatedAt: pets.updatedAt
        })
        .from(pets)
        .where(and(eq(pets.id, petId), eq(pets.clientId, session.clientId)))
        .limit(1);
      if (!pet) return null;

      const insertedPlaces = await tx
        .insert(places)
        .values({
          id: crypto.randomUUID(),
          city,
          district,
          residentialComplex,
          name: place,
          normalizedName: normalizedPlace
        })
        .onConflictDoNothing({
          target: [places.city, places.district, places.residentialComplex, places.normalizedName]
        })
        .returning({ id: places.id, name: places.name });

      let [sharedPlace] = insertedPlaces.length > 0 ? insertedPlaces : await tx
        .select({ id: places.id, name: places.name })
        .from(places)
        .where(and(
          eq(places.city, city),
          eq(places.district, district),
          eq(places.residentialComplex, residentialComplex),
          eq(places.normalizedName, normalizedPlace)
        ))
        .limit(1);
      if (!sharedPlace) throw new Error("Не удалось сохранить место прогулки.");

      const capitalizedSharedPlaceName = capitalizePlaceName(sharedPlace.name);
      if (sharedPlace.name !== capitalizedSharedPlaceName) {
        [sharedPlace] = await tx
          .update(places)
          .set({ name: capitalizedSharedPlaceName })
          .where(eq(places.id, sharedPlace.id))
          .returning({ id: places.id, name: places.name });
      }

      const [walk] = await tx
        .update(walks)
        .set({
          petId,
          city,
          district,
          residentialComplex,
          placeId: sharedPlace.id,
          place: sharedPlace.name,
          comment: comment || null,
          scheduleType,
          walkDate,
          walkTime,
          startsAt,
          updatedAt: new Date()
        })
        .where(eq(walks.id, walkId))
        .returning({
          id: walks.id,
          placeId: walks.placeId,
          place: walks.place,
          comment: walks.comment,
          scheduleType: walks.scheduleType,
          walkDate: walks.walkDate,
          walkTime: walks.walkTime,
          city: walks.city,
          district: walks.district,
          residentialComplex: walks.residentialComplex,
          updatedAt: walks.updatedAt
        });

      return { pet, walk };
    }));

    if (!result) {
      return privateError("Прогулка не найдена.", 404);
    }

    return privateJson({
      walk: publicWalk({
        ...result.walk,
        petId: result.pet.id,
        petName: result.pet.name,
        petBreed: result.pet.breed,
        ownerName: result.pet.ownerName,
        petUpdatedAt: result.pet.updatedAt
      })
    });
  } catch (error) {
    return privateError(databaseError(error), 500);
  }
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) {
    return privateJson({ error: "Запрос отклонён." }, { status: 403 });
  }

  try {
    const session = await getClientSession(request);
    if (!session) {
      return privateJson({ error: "Сессия истекла. Обновите страницу." }, { status: 401 });
    }

    const payload = await request.json().catch(() => null) as { walkId?: string } | null;
    const walkId = payload?.walkId?.trim() ?? "";

    if (!/^[0-9a-f-]{36}$/i.test(walkId)) {
      return privateError("Некорректные данные прогулки.", 400);
    }

    const deleted = await withDb(async (db) => {
      const [ownedWalk] = await db
        .select({ id: walks.id })
        .from(walks)
        .innerJoin(pets, eq(walks.petId, pets.id))
        .where(and(eq(walks.id, walkId), eq(pets.clientId, session.clientId)))
        .limit(1);

      if (!ownedWalk) return false;
      await db.delete(walks).where(eq(walks.id, walkId));
      return true;
    });

    if (!deleted) {
      return privateError("Прогулка не найдена.", 404);
    }

    return privateJson({ deleted: true });
  } catch (error) {
    return privateJson({ error: databaseError(error) }, { status: 500 });
  }
}
