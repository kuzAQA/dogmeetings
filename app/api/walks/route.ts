import { and, eq, isNull, sql } from "drizzle-orm";
import { withDb } from "../../../db";
import { pets, telegramComplexSubscriptions, telegramWalkNotifications, walks } from "../../../db/schema";
import { databaseErrorMessage } from "../../../lib/database-error";
import { getClientSession, isSameOriginRequest, privateJson } from "../../../lib/session";
import { telegramWalkChangeMessage } from "../../../lib/telegram";
import { parseWalkMutation } from "../../../server/application/walk-input";
import { getSavedLocation } from "../../../server/domain/location";
import {
  findOrCreateSharedPlace,
  findWalkPetForClient,
  listWalksForLocation,
  listWalksForOwner,
  type WalkRow
} from "../../../server/infrastructure/walk-repository";
import { isWalkEditExpired, isWalkTimeInPast, moscowDate, WALK_EDIT_EXPIRED_MESSAGE } from "../../../server/domain/walk";
import { petPhotoUrl } from "../../../server/domain/pet";
import { readJsonRecord, readJsonString } from "../../../server/transport/request-json";

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
    notifyTelegram: walk.notifyTelegram,
    walkDate: walk.walkDate,
    walkTime: walk.walkTime.slice(0, 5),
    scheduleType: walk.scheduleType,
    updatedAt: walk.updatedAt.toISOString(),
    image: petPhotoUrl(walk.petId, walk.petUpdatedAt, walk.petPhotoType)
  };
}

function databaseError(error: unknown) {
  return databaseErrorMessage(error, "Не удалось выполнить запрос к базе данных.");
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

      const rows = await listWalksForOwner(session.clientId);

      return privateJson({ walks: rows.map(publicWalk) });
    }

    const rows = await listWalksForLocation({ city, district, residentialComplex }, today);

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
    const savedLocation = getSavedLocation(session);
    if (!savedLocation) {
      return privateError("Сначала сохраните локацию прогулки.", 400);
    }

    const parsedInput = parseWalkMutation(await readJsonRecord(request), "create");
    if (!parsedInput.ok) return privateError(parsedInput.error, 400);
    const { petId, place, normalizedPlace, comment, scheduleType, walkTime, notifyTelegram } = parsedInput.value;
    const { city, district, complex: residentialComplex } = savedLocation;

    const walkDate = moscowDate(scheduleType === "tomorrow" ? 1 : 0);
    const startsAt = new Date(`${walkDate}T${walkTime}:00+03:00`);

    const result = await withDb((db) => db.transaction(async (tx) => {
      const pet = await findWalkPetForClient(tx, petId, session.clientId);
      if (!pet) return null;
      const sharedPlace = await findOrCreateSharedPlace(
        tx,
        { city, district, residentialComplex },
        place,
        normalizedPlace,
        session.clientId
      );

      const [walk] = await tx
        .insert(walks)
        .values({
          id: crypto.randomUUID(),
          petId,
          clientId: session.clientId,
          city,
          district,
          residentialComplex,
          placeId: sharedPlace.id,
          place: sharedPlace.name,
          comment: comment || null,
          notifyTelegram,
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
          notifyTelegram: walks.notifyTelegram,
          scheduleType: walks.scheduleType,
          walkDate: walks.walkDate,
          walkTime: walks.walkTime,
          city: walks.city,
          district: walks.district,
          residentialComplex: walks.residentialComplex,
          updatedAt: walks.updatedAt
        });

      if (walk.notifyTelegram) {
        const subscriptions = await tx
          .select({ id: telegramComplexSubscriptions.id })
          .from(telegramComplexSubscriptions)
          .where(and(
            eq(telegramComplexSubscriptions.active, true),
            eq(telegramComplexSubscriptions.city, city),
            eq(telegramComplexSubscriptions.district, district),
            eq(telegramComplexSubscriptions.residentialComplex, residentialComplex)
          ));
        if (subscriptions.length > 0) {
          await tx
            .insert(telegramWalkNotifications)
            .values(subscriptions.map((subscription) => ({
              id: crypto.randomUUID(),
              walkId: walk.id,
              subscriptionId: subscription.id
            })))
            .onConflictDoNothing({
              target: [telegramWalkNotifications.walkId, telegramWalkNotifications.subscriptionId]
            });
        }
      }

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
        petUpdatedAt: result.pet.updatedAt,
        petPhotoType: result.pet.photoType
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
    const savedLocation = getSavedLocation(session);
    if (!savedLocation) {
      return privateError("Сначала сохраните локацию прогулки.", 400);
    }

    const parsedInput = parseWalkMutation(await readJsonRecord(request), "update");
    if (!parsedInput.ok) return privateError(parsedInput.error, 400);
    const { walkId, petId, place, normalizedPlace, comment, scheduleType, walkTime, notifyTelegram } = parsedInput.value;
    const { city, district, complex: residentialComplex } = savedLocation;

    const walkDate = moscowDate(scheduleType === "tomorrow" ? 1 : 0);
    const startsAt = new Date(`${walkDate}T${walkTime}:00+03:00`);
    const result = await withDb((db) => db.transaction(async (tx) => {
      const [previous] = await tx
        .select({
          id: walks.id,
          petId: walks.petId,
          petName: pets.name,
          ownerName: pets.ownerName,
          residentialComplex: walks.residentialComplex,
          place: walks.place,
          walkTime: walks.walkTime,
          walkDate: walks.walkDate,
          scheduleType: walks.scheduleType
        })
        .from(walks)
        .innerJoin(pets, eq(walks.petId, pets.id))
        .where(and(eq(walks.id, walkId), eq(walks.clientId, session.clientId)))
        .for("update", { of: walks })
        .limit(1);
      if (!previous) return null;
      if (isWalkEditExpired(previous)) return { error: WALK_EDIT_EXPIRED_MESSAGE, status: 409 };
      if (isWalkTimeInPast(scheduleType, walkTime)) {
        return { error: "Для сегодняшней прогулки выберите будущее время.", status: 400 };
      }

      const pet = await findWalkPetForClient(tx, petId, session.clientId);
      if (!pet) return null;
      const sharedPlace = await findOrCreateSharedPlace(
        tx,
        { city, district, residentialComplex },
        place,
        normalizedPlace,
        session.clientId
      );

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
          notifyTelegram,
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
          notifyTelegram: walks.notifyTelegram,
          scheduleType: walks.scheduleType,
          walkDate: walks.walkDate,
          walkTime: walks.walkTime,
          city: walks.city,
          district: walks.district,
          residentialComplex: walks.residentialComplex,
          updatedAt: walks.updatedAt
        });

      const message = walk.notifyTelegram ? telegramWalkChangeMessage(previous, {
        petId: pet.id,
        petName: pet.name,
        ownerName: pet.ownerName,
        residentialComplex: walk.residentialComplex,
        place: walk.place,
        comment: walk.comment,
        walkTime: walk.walkTime,
        walkDate: walk.walkDate,
        scheduleType: walk.scheduleType
      }, notifyTelegram === true) : null;

      if (!walk.notifyTelegram || message) {
        await tx.delete(telegramWalkNotifications).where(and(
          eq(telegramWalkNotifications.walkId, walk.id),
          isNull(telegramWalkNotifications.sentAt)
        ));
      }
      if (message) {
        const subscriptions = await tx.select({ id: telegramComplexSubscriptions.id })
          .from(telegramComplexSubscriptions).where(and(
            eq(telegramComplexSubscriptions.active, true),
            eq(telegramComplexSubscriptions.city, walk.city),
            eq(telegramComplexSubscriptions.district, walk.district),
            eq(telegramComplexSubscriptions.residentialComplex, walk.residentialComplex)
          ));
        if (subscriptions.length) {
          await tx.insert(telegramWalkNotifications).values(subscriptions.map(({ id }) => ({
            id: crypto.randomUUID(), walkId: walk.id, subscriptionId: id, messageText: message
          }))).onConflictDoUpdate({
            target: [telegramWalkNotifications.walkId, telegramWalkNotifications.subscriptionId],
            set: { id: sql`excluded.id`, messageText: message, sentAt: null, failedAt: null, lastError: null,
              attemptCount: 0, nextAttemptAt: new Date(), createdAt: new Date() }
          });
        }
      }
      return { pet, walk };
    }));

    if (result?.error !== undefined) return privateError(result.error, result.status);
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
        petUpdatedAt: result.pet.updatedAt,
        petPhotoType: result.pet.photoType
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

    const payload = await readJsonRecord(request);
    const walkId = readJsonString(payload, "walkId").trim();

    if (!/^[0-9a-f-]{36}$/i.test(walkId)) {
      return privateError("Некорректные данные прогулки.", 400);
    }

    const deleted = await withDb(async (db) => {
      const rows = await db.delete(walks)
        .where(and(eq(walks.id, walkId), eq(walks.clientId, session.clientId)))
        .returning({ id: walks.id });
      return rows.length > 0;
    });

    if (!deleted) {
      return privateError("Прогулка не найдена.", 404);
    }

    return privateJson({ deleted: true });
  } catch (error) {
    return privateJson({ error: databaseError(error) }, { status: 500 });
  }
}
