import { and, desc, eq } from "drizzle-orm";
import { Buffer } from "node:buffer";
import { withDb } from "../../../db";
import { pets } from "../../../db/schema";

const MAX_PHOTO_SIZE = 1024 * 1024;
const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const containsLetter = /\p{L}/u;

function normalizeName(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");

  return normalized.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase("ru-RU"));
}

type PetSummary = Pick<typeof pets.$inferSelect, "id" | "name" | "breed" | "ownerName" | "createdAt">;

function publicPet(pet: PetSummary) {
  return {
    id: pet.id,
    name: pet.name,
    breed: pet.breed,
    ownerName: pet.ownerName,
    photoUrl: `/api/pet-photo?id=${encodeURIComponent(pet.id)}`,
    createdAt: pet.createdAt.toISOString()
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

export async function GET(request: Request) {
  const clientId = new URL(request.url).searchParams.get("clientId")?.trim() ?? "";
  if (!uuidPattern.test(clientId)) {
    return Response.json({ error: "Некорректный идентификатор браузера." }, { status: 400 });
  }

  try {
    const rows = await withDb((db) => db
        .select({
          id: pets.id,
          name: pets.name,
          breed: pets.breed,
          ownerName: pets.ownerName,
          createdAt: pets.createdAt
        })
        .from(pets)
        .where(eq(pets.clientId, clientId))
        .orderBy(desc(pets.createdAt))
        .limit(100));

    return Response.json({ pets: rows.map(publicPet) });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const name = normalizeName(formData.get("petName"));
    const breed = String(formData.get("breed") ?? "").trim();
    const ownerName = normalizeName(formData.get("ownerName"));
    const clientId = String(formData.get("clientId") ?? "").trim();
    const photo = formData.get("photo");

    if (!uuidPattern.test(clientId)) {
      return Response.json({ error: "Некорректный идентификатор браузера." }, { status: 400 });
    }
    if (!name || name.length > 40) {
      return Response.json({ error: "Укажите имя питомца до 40 символов." }, { status: 400 });
    }
    if (!containsLetter.test(name)) {
      return Response.json({ error: "Имя питомца должно содержать хотя бы одну букву." }, { status: 400 });
    }
    if (!breed || breed.length > 80) {
      return Response.json({ error: "Укажите породу до 80 символов." }, { status: 400 });
    }
    if (!containsLetter.test(breed)) {
      return Response.json({ error: "Порода должна содержать хотя бы одну букву." }, { status: 400 });
    }
    if (!ownerName || ownerName.length > 60) {
      return Response.json({ error: "Укажите имя хозяина до 60 символов." }, { status: 400 });
    }
    if (!containsLetter.test(ownerName)) {
      return Response.json({ error: "Имя хозяина должно содержать хотя бы одну букву." }, { status: 400 });
    }

    const hasPhoto = photo instanceof File && photo.size > 0;
    if (hasPhoto) {
      if (!allowedPhotoTypes.has(photo.type)) {
        return Response.json({ error: "Поддерживаются фотографии JPEG, PNG и WebP." }, { status: 400 });
      }
      if (photo.size > MAX_PHOTO_SIZE) {
        return Response.json({ error: "Фотография после сжатия должна быть меньше 1 МБ." }, { status: 400 });
      }
    }

    const id = crypto.randomUUID();
    const photoBytes = hasPhoto ? Buffer.from(await photo.arrayBuffer()) : null;
    const [pet] = await withDb((db) => db
        .insert(pets)
        .values({
          id,
          clientId,
          name,
          breed,
          ownerName,
          photo: photoBytes,
          photoType: hasPhoto ? photo.type : null
        })
        .returning({
          id: pets.id,
          name: pets.name,
          breed: pets.breed,
          ownerName: pets.ownerName,
          createdAt: pets.createdAt
        }));

    return Response.json({ pet: publicPet(pet) }, { status: 201 });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const payload = await request.json() as { petId?: string; clientId?: string };
    const petId = payload.petId?.trim() ?? "";
    const clientId = payload.clientId?.trim() ?? "";

    if (!uuidPattern.test(petId) || !uuidPattern.test(clientId)) {
      return Response.json({ error: "Некорректные данные питомца." }, { status: 400 });
    }

    const deleted = await withDb((db) => db
      .delete(pets)
      .where(and(eq(pets.id, petId), eq(pets.clientId, clientId)))
      .returning({ id: pets.id }));

    if (deleted.length === 0) {
      return Response.json({ error: "Питомец не найден." }, { status: 404 });
    }

    return Response.json({ deleted: true });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
