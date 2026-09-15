import { and, desc, eq, or } from "drizzle-orm";
import { type Database, withDb } from "../../db";
import { petCollaborators, pets, places, walks } from "../../db/schema";
import { capitalizePlaceName } from "../domain/walk";

type WalkTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type WalkRow = {
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
  petPhotoType: string | null;
};

const walkSelection = {
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
  petUpdatedAt: pets.updatedAt,
  petPhotoType: pets.photoType
};

export async function findWalkPetForClient(
  tx: WalkTransaction,
  petId: string,
  clientId: string
) {
  const [pet] = await tx
    .select({
      id: pets.id,
      clientId: pets.clientId,
      name: pets.name,
      breed: pets.breed,
      ownerName: pets.ownerName,
      photoType: pets.photoType,
      updatedAt: pets.updatedAt
    })
    .from(pets)
    .where(eq(pets.id, petId))
    .limit(1);
  if (!pet) return null;
  if (pet.clientId === clientId) return pet;

  const [collaboration] = await tx
    .select({ petId: petCollaborators.petId })
    .from(petCollaborators)
    .where(and(
      eq(petCollaborators.petId, petId),
      eq(petCollaborators.clientId, clientId)
    ))
    .limit(1);
  return collaboration ? pet : null;
}

export async function findOrCreateSharedPlace(
  tx: WalkTransaction,
  location: { city: string; district: string; residentialComplex: string },
  name: string,
  normalizedName: string
) {
  const insertedPlaces = await tx
    .insert(places)
    .values({
      id: crypto.randomUUID(),
      ...location,
      name,
      normalizedName
    })
    .onConflictDoNothing({
      target: [places.city, places.district, places.residentialComplex, places.normalizedName]
    })
    .returning({ id: places.id, name: places.name });

  let [sharedPlace] = insertedPlaces.length > 0 ? insertedPlaces : await tx
    .select({ id: places.id, name: places.name })
    .from(places)
    .where(and(
      eq(places.city, location.city),
      eq(places.district, location.district),
      eq(places.residentialComplex, location.residentialComplex),
      eq(places.normalizedName, normalizedName)
    ))
    .limit(1);
  if (!sharedPlace) throw new Error("Не удалось сохранить место прогулки.");

  const capitalizedName = capitalizePlaceName(sharedPlace.name);
  if (sharedPlace.name !== capitalizedName) {
    [sharedPlace] = await tx
      .update(places)
      .set({ name: capitalizedName })
      .where(eq(places.id, sharedPlace.id))
      .returning({ id: places.id, name: places.name });
  }

  return sharedPlace;
}

export async function listWalksForOwner(clientId: string) {
  return withDb((db) => db
    .select(walkSelection)
    .from(walks)
    .innerJoin(pets, eq(walks.petId, pets.id))
    .where(eq(walks.clientId, clientId))
    .orderBy(desc(walks.updatedAt), desc(walks.createdAt))
    .limit(100));
}

export async function listWalksForLocation(
  location: { city: string; district: string; residentialComplex: string },
  today: string
) {
  return withDb((db) => db
    .select(walkSelection)
    .from(walks)
    .innerJoin(pets, eq(walks.petId, pets.id))
    .where(and(
      eq(walks.city, location.city),
      eq(walks.district, location.district),
      eq(walks.residentialComplex, location.residentialComplex),
      or(eq(walks.scheduleType, "always"), eq(walks.walkDate, today))
    ))
    .orderBy(desc(walks.updatedAt), desc(walks.createdAt))
    .limit(100));
}
