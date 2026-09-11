import { and, desc, eq, inArray, or } from "drizzle-orm";
import { Buffer } from "node:buffer";
import { withDb } from "../../../db";
import { petCollaborators, pets } from "../../../db/schema";
import { databaseErrorMessage } from "../../../lib/database-error";
import { getClientSession, isSameOriginRequest, privateJson } from "../../../lib/session";
import { parsePetMutation } from "../../../server/application/pet-input";
import { canEditPet, uuidPattern } from "../../../server/domain/pet";
import { readJsonRecord, readJsonString } from "../../../server/transport/request-json";

type PetSummary = Pick<typeof pets.$inferSelect, "id" | "clientId" | "name" | "breed" | "ownerName" | "createdAt" | "updatedAt">;

function publicPet(pet: PetSummary, clientId: string, isShared = false) {
  const isOwner = pet.clientId === clientId;
  return {
    id: pet.id,
    name: pet.name,
    breed: pet.breed,
    ownerName: pet.ownerName,
    photoUrl: `/api/pet-photo?id=${encodeURIComponent(pet.id)}&v=${pet.updatedAt.getTime()}`,
    createdAt: pet.createdAt.toISOString(),
    updatedAt: pet.updatedAt.toISOString(),
    isOwner,
    isShared: isOwner && isShared,
    canEdit: true,
    canDelete: true,
    canShare: isOwner
  };
}

function errorMessage(error: unknown) {
  return databaseErrorMessage(error, "Не удалось выполнить запрос к базе данных.", "База данных ещё не подготовлена. Попробуйте немного позже.");
}

function privateError(message: string, status: number) {
  return privateJson({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    const session = await getClientSession(request);
    if (!session) {
      return privateJson({ error: "Сессия истекла. Обновите страницу." }, { status: 401 });
    }

    const rows = await withDb(async (db) => {
      const sharedRows = await db
        .select({ petId: petCollaborators.petId })
        .from(petCollaborators)
        .where(eq(petCollaborators.clientId, session.clientId));
      const sharedPetIds = sharedRows.map((row) => row.petId);
      const accessCondition = sharedPetIds.length > 0
        ? or(eq(pets.clientId, session.clientId), inArray(pets.id, sharedPetIds))
        : eq(pets.clientId, session.clientId);

      const petRows = await db
        .select({
          id: pets.id,
          clientId: pets.clientId,
          name: pets.name,
          breed: pets.breed,
          ownerName: pets.ownerName,
          createdAt: pets.createdAt,
          updatedAt: pets.updatedAt
        })
        .from(pets)
        .where(accessCondition)
        .orderBy(desc(pets.createdAt))
        .limit(100);

      const sharedByOwnerRows = await db
        .select({ petId: petCollaborators.petId })
        .from(petCollaborators)
        .where(eq(petCollaborators.grantedByClientId, session.clientId));
      const sharedByOwnerPetIds = new Set(sharedByOwnerRows.map((row) => row.petId));

      return petRows.map((pet) => ({
        pet,
        isShared: pet.clientId === session.clientId && sharedByOwnerPetIds.has(pet.id)
      }));
    });

    return privateJson({
      pets: rows.map(({ pet, isShared }) => publicPet(pet, session.clientId, isShared))
    });
  } catch (error) {
    return privateJson({ error: errorMessage(error) }, { status: 500 });
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

    const formData = await request.formData();
    const parsedInput = parsePetMutation(formData, "create");
    if (!parsedInput.ok) return privateError(parsedInput.error, 400);
    const { name, breed, ownerName, photo } = parsedInput.value;

    const id = crypto.randomUUID();
    const photoBytes = photo ? Buffer.from(await photo.arrayBuffer()) : null;
    const [pet] = await withDb((db) => db
        .insert(pets)
        .values({
          id,
          clientId: session.clientId,
          name,
          breed,
          ownerName,
          photo: photoBytes,
          photoType: photo?.type ?? null
        })
        .returning({
          id: pets.id,
          clientId: pets.clientId,
          name: pets.name,
          breed: pets.breed,
          ownerName: pets.ownerName,
          createdAt: pets.createdAt,
          updatedAt: pets.updatedAt
        }));

    return privateJson({ pet: publicPet(pet, session.clientId) }, { status: 201 });
  } catch (error) {
    return privateJson({ error: errorMessage(error) }, { status: 500 });
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

    const formData = await request.formData();
    const parsedInput = parsePetMutation(formData, "update");
    if (!parsedInput.ok) return privateError(parsedInput.error, 400);
    const { petId, name, breed, ownerName, photo } = parsedInput.value;

    const [existingPet] = await withDb((db) => db
      .select({ id: pets.id, clientId: pets.clientId })
      .from(pets)
      .where(eq(pets.id, petId))
      .limit(1));
    if (!existingPet) {
      return privateError("Питомец не найден.", 404);
    }
    let isCollaborator = false;
    if (existingPet.clientId !== session.clientId) {
      const [collaboration] = await withDb((db) => db
        .select({ petId: petCollaborators.petId })
        .from(petCollaborators)
        .where(and(
          eq(petCollaborators.petId, petId),
          eq(petCollaborators.clientId, session.clientId)
        ))
        .limit(1));
      isCollaborator = Boolean(collaboration);
    }
    if (!canEditPet(existingPet.clientId, session.clientId, isCollaborator)) {
      return privateError("Питомец не найден.", 404);
    }

    const updatedAt = new Date();
    const values: Partial<typeof pets.$inferInsert> = { name, breed, ownerName, updatedAt };
    if (photo) {
      values.photo = Buffer.from(await photo.arrayBuffer());
      values.photoType = photo.type;
    }

    const [pet] = await withDb((db) => db
      .update(pets)
      .set(values)
      .where(eq(pets.id, petId))
      .returning({
        id: pets.id,
        clientId: pets.clientId,
        name: pets.name,
        breed: pets.breed,
        ownerName: pets.ownerName,
        createdAt: pets.createdAt,
        updatedAt: pets.updatedAt
      }));

    if (!pet) {
      return privateError("Питомец не найден.", 404);
    }

    const [collaborator] = pet.clientId === session.clientId
      ? await withDb((db) => db
        .select({ petId: petCollaborators.petId })
        .from(petCollaborators)
        .where(eq(petCollaborators.petId, pet.id))
        .limit(1))
      : [];

    return privateJson({ pet: publicPet(pet, session.clientId, Boolean(collaborator)) });
  } catch (error) {
    return privateJson({ error: errorMessage(error) }, { status: 500 });
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
    const petId = readJsonString(payload, "petId").trim();

    if (!uuidPattern.test(petId)) {
      return privateError("Некорректные данные питомца.", 400);
    }

    const [pet] = await withDb((db) => db
      .select({ id: pets.id, clientId: pets.clientId })
      .from(pets)
      .where(eq(pets.id, petId))
      .limit(1));

    if (!pet) {
      return privateError("Питомец не найден.", 404);
    }

    if (pet.clientId === session.clientId) {
      await withDb((db) => db
        .delete(pets)
        .where(and(eq(pets.id, petId), eq(pets.clientId, session.clientId))));
      return privateJson({ deleted: true, detached: false });
    }

    const detached = await withDb((db) => db
      .delete(petCollaborators)
      .where(and(
        eq(petCollaborators.petId, petId),
        eq(petCollaborators.clientId, session.clientId)
      ))
      .returning({ petId: petCollaborators.petId }));

    if (detached.length === 0) {
      return privateError("Питомец не найден.", 404);
    }

    return privateJson({ deleted: true, detached: true });
  } catch (error) {
    return privateJson({ error: errorMessage(error) }, { status: 500 });
  }
}
