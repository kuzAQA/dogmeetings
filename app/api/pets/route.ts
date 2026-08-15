import { and, desc, eq, inArray, or } from "drizzle-orm";
import { Buffer } from "node:buffer";
import { withDb } from "../../../db";
import { petCollaborators, pets } from "../../../db/schema";
import { getClientSession, isSameOriginRequest, privateJson } from "../../../lib/session";

const MAX_PHOTO_SIZE = 1024 * 1024;
const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BREED_LENGTH = 20;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const containsLetter = /\p{L}/u;

function normalizeName(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");

  return normalized.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase("ru-RU"));
}

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
  const message = error instanceof Error ? error.message : "Неизвестная ошибка";
  if (message.includes("ECONNREFUSED") || message.includes("connect")) {
    return "Не удалось подключиться к PostgreSQL.";
  }
  if (message.includes("does not exist")) {
    return "База данных ещё не подготовлена. Попробуйте немного позже.";
  }
  return "Не удалось выполнить запрос к базе данных.";
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
    const name = normalizeName(formData.get("petName"));
    const breed = String(formData.get("breed") ?? "").trim();
    const ownerName = normalizeName(formData.get("ownerName"));
    const photo = formData.get("photo");

    if (!name || name.length > 40) {
      return privateError("Укажите имя питомца до 40 символов.", 400);
    }
    if (!containsLetter.test(name)) {
      return privateError("Имя питомца должно содержать хотя бы одну букву.", 400);
    }
    if (!breed || breed.length > MAX_BREED_LENGTH) {
      return privateError(`Укажите породу до ${MAX_BREED_LENGTH} символов.`, 400);
    }
    if (!containsLetter.test(breed)) {
      return privateError("Порода должна содержать хотя бы одну букву.", 400);
    }
    if (!ownerName || ownerName.length > 60) {
      return privateError("Укажите имя хозяина до 60 символов.", 400);
    }
    if (!containsLetter.test(ownerName)) {
      return privateError("Имя хозяина должно содержать хотя бы одну букву.", 400);
    }

    const hasPhoto = photo instanceof File && photo.size > 0;
    if (hasPhoto) {
      if (!allowedPhotoTypes.has(photo.type)) {
        return privateError("Поддерживаются фотографии JPEG, PNG и WebP.", 400);
      }
      if (photo.size > MAX_PHOTO_SIZE) {
        return privateError("Фотография после сжатия должна быть меньше 1 МБ.", 400);
      }
    }

    const id = crypto.randomUUID();
    const photoBytes = hasPhoto ? Buffer.from(await photo.arrayBuffer()) : null;
    const [pet] = await withDb((db) => db
        .insert(pets)
        .values({
          id,
          clientId: session.clientId,
          name,
          breed,
          ownerName,
          photo: photoBytes,
          photoType: hasPhoto ? photo.type : null
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
    const petId = String(formData.get("petId") ?? "").trim();
    const name = normalizeName(formData.get("petName"));
    const breed = String(formData.get("breed") ?? "").trim();
    const ownerName = normalizeName(formData.get("ownerName"));
    const photo = formData.get("photo");

    if (!uuidPattern.test(petId)) {
      return privateError("Некорректные данные питомца.", 400);
    }
    if (!name || name.length > 40 || !containsLetter.test(name)) {
      return privateError("Укажите корректное имя питомца до 40 символов.", 400);
    }
    if (!breed || breed.length > MAX_BREED_LENGTH || !containsLetter.test(breed)) {
      return privateError(`Укажите корректную породу до ${MAX_BREED_LENGTH} символов.`, 400);
    }
    if (!ownerName || ownerName.length > 60 || !containsLetter.test(ownerName)) {
      return privateError("Укажите корректное имя хозяина до 60 символов.", 400);
    }

    const hasPhoto = photo instanceof File && photo.size > 0;
    if (hasPhoto) {
      if (!allowedPhotoTypes.has(photo.type)) {
        return privateError("Поддерживаются фотографии JPEG, PNG и WebP.", 400);
      }
      if (photo.size > MAX_PHOTO_SIZE) {
        return privateError("Фотография после сжатия должна быть меньше 1 МБ.", 400);
      }
    }

    const [existingPet] = await withDb((db) => db
      .select({ id: pets.id, clientId: pets.clientId })
      .from(pets)
      .where(eq(pets.id, petId))
      .limit(1));
    if (!existingPet) {
      return privateError("Питомец не найден.", 404);
    }
    if (existingPet.clientId !== session.clientId) {
      const [collaboration] = await withDb((db) => db
        .select({ petId: petCollaborators.petId })
        .from(petCollaborators)
        .where(and(
          eq(petCollaborators.petId, petId),
          eq(petCollaborators.clientId, session.clientId)
        ))
        .limit(1));
      if (!collaboration) return privateError("Питомец не найден.", 404);
    }

    const updatedAt = new Date();
    const values: Partial<typeof pets.$inferInsert> = { name, breed, ownerName, updatedAt };
    if (hasPhoto) {
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

    const payload = await request.json().catch(() => null) as { petId?: string } | null;
    const petId = payload?.petId?.trim() ?? "";

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
