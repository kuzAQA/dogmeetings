import { and, desc, eq, or } from "drizzle-orm";
import { withDb } from "../../../db";
import { pets, places, walks } from "../../../db/schema";

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
    image: `/api/pet-photo?id=${encodeURIComponent(walk.petId)}`
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

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const clientId = params.get("clientId")?.trim() ?? "";
  const city = params.get("city")?.trim() ?? "";
  const district = params.get("district")?.trim() ?? "";
  const residentialComplex = params.get("complex")?.trim() ?? "";
  const today = moscowDate();

  if (clientId && !/^[0-9a-f-]{36}$/i.test(clientId)) {
    return Response.json({ error: "Некорректный идентификатор пользователя." }, { status: 400 });
  }

  if (!clientId && (!city || !district || !residentialComplex)) {
    return Response.json({ error: "Некорректные параметры локации." }, { status: 400 });
  }

  try {
    if (clientId) {
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
          updatedAt: walks.updatedAt
        })
        .from(walks)
        .innerJoin(pets, eq(walks.petId, pets.id))
        .where(eq(pets.clientId, clientId))
        .orderBy(desc(walks.updatedAt), desc(walks.createdAt))
        .limit(100));

      return Response.json({ walks: rows.map(publicWalk) });
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
          updatedAt: walks.updatedAt
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
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as {
      petId?: string;
      place?: string;
      comment?: string;
      scheduleType?: string;
      walkTime?: string;
      city?: string;
      district?: string;
      complex?: string;
      clientId?: string;
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
    const clientId = payload.clientId?.trim() ?? "";

    if (!/^[0-9a-f-]{36}$/i.test(petId)) {
      return Response.json({ error: "Выберите питомца." }, { status: 400 });
    }
    if (!/^[0-9a-f-]{36}$/i.test(clientId)) {
      return Response.json({ error: "Некорректный идентификатор пользователя." }, { status: 400 });
    }
    if (!place || place.length > 100) {
      return Response.json({ error: "Укажите место прогулки до 100 символов." }, { status: 400 });
    }
    if (!/\p{L}/u.test(place)) {
      return Response.json({ error: "Название места прогулки должно содержать хотя бы одну букву." }, { status: 400 });
    }
    if (comment.length > 50) {
      return Response.json({ error: "Комментарий должен содержать не более 50 символов." }, { status: 400 });
    }
    if (!city || !district || !residentialComplex) {
      return Response.json({ error: "Не выбрана локация прогулки." }, { status: 400 });
    }
    if (!new Set(["today", "tomorrow", "always"]).has(scheduleType)) {
      return Response.json({ error: "Выберите день прогулки." }, { status: 400 });
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(walkTime)) {
      return Response.json({ error: "Укажите корректное время прогулки." }, { status: 400 });
    }

    const walkDate = moscowDate(scheduleType === "tomorrow" ? 1 : 0);
    const startsAt = new Date(`${walkDate}T${walkTime}:00+03:00`);

    const result = await withDb((db) => db.transaction(async (tx) => {
      const [pet] = await tx
        .select({ id: pets.id, name: pets.name, breed: pets.breed, ownerName: pets.ownerName })
        .from(pets)
        .where(and(eq(pets.id, petId), eq(pets.clientId, clientId)))
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
      return Response.json({ error: "Питомец не найден." }, { status: 404 });
    }

    return Response.json({
      walk: publicWalk({
        ...result.walk,
        petId: result.pet.id,
        petName: result.pet.name,
        petBreed: result.pet.breed,
        ownerName: result.pet.ownerName
      })
    }, { status: 201 });
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
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
      clientId?: string;
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
    const clientId = payload.clientId?.trim() ?? "";

    if (!/^[0-9a-f-]{36}$/i.test(walkId) || !/^[0-9a-f-]{36}$/i.test(petId)) {
      return Response.json({ error: "Некорректные данные прогулки." }, { status: 400 });
    }
    if (!/^[0-9a-f-]{36}$/i.test(clientId)) {
      return Response.json({ error: "Некорректный идентификатор пользователя." }, { status: 400 });
    }
    if (!place || place.length > 100) {
      return Response.json({ error: "Укажите место прогулки до 100 символов." }, { status: 400 });
    }
    if (!/\p{L}/u.test(place)) {
      return Response.json({ error: "Название места прогулки должно содержать хотя бы одну букву." }, { status: 400 });
    }
    if (comment.length > 50) {
      return Response.json({ error: "Комментарий должен содержать не более 50 символов." }, { status: 400 });
    }
    if (!city || !district || !residentialComplex) {
      return Response.json({ error: "Не выбрана локация прогулки." }, { status: 400 });
    }
    if (!new Set(["today", "tomorrow", "always"]).has(scheduleType)) {
      return Response.json({ error: "Выберите день прогулки." }, { status: 400 });
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(walkTime)) {
      return Response.json({ error: "Укажите корректное время прогулки." }, { status: 400 });
    }

    const walkDate = moscowDate(scheduleType === "tomorrow" ? 1 : 0);
    const startsAt = new Date(`${walkDate}T${walkTime}:00+03:00`);
    const result = await withDb((db) => db.transaction(async (tx) => {
      const [ownedWalk] = await tx
        .select({ id: walks.id })
        .from(walks)
        .innerJoin(pets, eq(walks.petId, pets.id))
        .where(and(eq(walks.id, walkId), eq(pets.clientId, clientId)))
        .limit(1);
      if (!ownedWalk) return null;

      const [pet] = await tx
        .select({ id: pets.id, name: pets.name, breed: pets.breed, ownerName: pets.ownerName })
        .from(pets)
        .where(and(eq(pets.id, petId), eq(pets.clientId, clientId)))
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
      return Response.json({ error: "Прогулка не найдена." }, { status: 404 });
    }

    return Response.json({
      walk: publicWalk({
        ...result.walk,
        petId: result.pet.id,
        petName: result.pet.name,
        petBreed: result.pet.breed,
        ownerName: result.pet.ownerName
      })
    });
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = await request.json() as { walkId?: string; clientId?: string };
    const walkId = payload.walkId?.trim() ?? "";
    const clientId = payload.clientId?.trim() ?? "";

    if (!/^[0-9a-f-]{36}$/i.test(walkId) || !/^[0-9a-f-]{36}$/i.test(clientId)) {
      return Response.json({ error: "Некорректные данные прогулки." }, { status: 400 });
    }

    const deleted = await withDb(async (db) => {
      const [ownedWalk] = await db
        .select({ id: walks.id })
        .from(walks)
        .innerJoin(pets, eq(walks.petId, pets.id))
        .where(and(eq(walks.id, walkId), eq(pets.clientId, clientId)))
        .limit(1);

      if (!ownedWalk) return false;
      await db.delete(walks).where(eq(walks.id, walkId));
      return true;
    });

    if (!deleted) {
      return Response.json({ error: "Прогулка не найдена." }, { status: 404 });
    }

    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}
