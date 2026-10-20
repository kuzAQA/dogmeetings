import { and, asc, eq } from "drizzle-orm";
import { withDb } from "../../../db";
import { clientSessions, locations, pets } from "../../../db/schema";
import { getClientSession, privateJson } from "../../../lib/session";
import { petPhotoUrl } from "../../../server/domain/pet";

export async function GET(request: Request) {
  try {
    const session = await getClientSession(request);
    if (!session) return privateJson({ error: "Сессия истекла. Обновите страницу." }, { status: 401 });
    if (!session.hasLocation || !session.location) return privateJson({ error: "Сначала выберите свой район." }, { status: 400 });
    const { city, district } = session.location;
    const complexes = await withDb(async (db) => {
      const areaLocations = await db.select({ city: locations.city, district: locations.district, complex: locations.residentialComplex })
        .from(locations).where(and(eq(locations.city, city), eq(locations.district, district)))
        .orderBy(asc(locations.residentialComplex));
      const rows = await db.select({
        id: pets.id, name: pets.name, breed: pets.breed, ownerName: pets.ownerName,
        description: pets.description, photoType: pets.photoType, updatedAt: pets.updatedAt,
        complex: clientSessions.residentialComplex
      }).from(pets)
        .innerJoin(clientSessions, eq(pets.clientId, clientSessions.clientId))
        .where(and(eq(clientSessions.hasLocation, true), eq(clientSessions.city, city), eq(clientSessions.district, district)))
        .orderBy(asc(pets.name), asc(pets.id));
      return areaLocations.map((location) => ({
        location,
        pets: rows.filter((pet) => pet.complex === location.complex).map((pet) => ({
          id: pet.id, name: pet.name, breed: pet.breed, ownerName: pet.ownerName,
          description: pet.description, photoUrl: petPhotoUrl(pet.id, pet.updatedAt, pet.photoType)
        }))
      }));
    });
    return privateJson({ complexes });
  } catch {
    return privateJson({ error: "Не удалось загрузить питомцев района." }, { status: 500 });
  }
}
