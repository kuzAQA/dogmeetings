import { desc, eq } from "drizzle-orm";
import { Buffer } from "node:buffer";
import { withDb } from "../../../../db";
import { pets } from "../../../../db/schema";
import { authorizeAdminRequest } from "../../../../lib/admin-request";
import { privateJson } from "../../../../lib/session";

const MAX_PHOTO_SIZE = 1024 * 1024;
const MAX_BREED_LENGTH = 20;
const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const containsLetter = /\p{L}/u;

type PetSummary = Pick<typeof pets.$inferSelect, "id" | "name" | "breed" | "ownerName" | "createdAt" | "updatedAt">;

function publicPet(pet: PetSummary) {
  return {
    id: pet.id,
    name: pet.name,
    breed: pet.breed,
    ownerName: pet.ownerName,
    photoUrl: `/api/pet-photo?id=${encodeURIComponent(pet.id)}&v=${pet.updatedAt.getTime()}`,
    createdAt: pet.createdAt.toISOString(),
    updatedAt: pet.updatedAt.toISOString()
  };
}

function normalizeName(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");

  return normalized.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase("ru-RU"));
}

function adminError(message: string, status: number) {
  return privateJson({ error: message }, { status });
}

export async function GET(request: Request) {
  try {
    if (!await authorizeAdminRequest(request)) return adminError("Требуется вход.", 401);

    const rows = await withDb((db) => db
      .select({
        id: pets.id,
        name: pets.name,
        breed: pets.breed,
        ownerName: pets.ownerName,
        createdAt: pets.createdAt,
        updatedAt: pets.updatedAt
      })
      .from(pets)
      .orderBy(desc(pets.createdAt)));

    return privateJson({ pets: rows.map(publicPet) });
  } catch {
    return adminError("Не удалось загрузить питомцев.", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    if (!await authorizeAdminRequest(request, true)) return adminError("Требуется вход.", 401);

    const formData = await request.formData();
    const petId = String(formData.get("petId") ?? "").trim();
    const name = normalizeName(formData.get("petName"));
    const ownerName = normalizeName(formData.get("ownerName"));
    const breed = String(formData.get("breed") ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
    const photo = formData.get("photo");

    if (!uuidPattern.test(petId)) return adminError("Некорректные данные питомца.", 400);
    if (!name || name.length > 40 || !containsLetter.test(name)) {
      return adminError("Укажите корректное имя питомца до 40 символов.", 400);
    }
    if (!ownerName || ownerName.length > 60 || !containsLetter.test(ownerName)) {
      return adminError("Укажите корректное имя хозяина до 60 символов.", 400);
    }
    if (!breed || breed.length > MAX_BREED_LENGTH || !containsLetter.test(breed)) {
      return adminError(`Укажите корректную породу до ${MAX_BREED_LENGTH} символов.`, 400);
    }

    const hasPhoto = photo instanceof File && photo.size > 0;
    if (hasPhoto && !allowedPhotoTypes.has(photo.type)) {
      return adminError("Поддерживаются фотографии JPEG, PNG и WebP.", 400);
    }
    if (hasPhoto && photo.size > MAX_PHOTO_SIZE) {
      return adminError("Фотография после сжатия должна быть меньше 1 МБ.", 400);
    }

    const updatedAt = new Date();
    const values: Partial<typeof pets.$inferInsert> = { name, ownerName, breed, updatedAt };
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
        name: pets.name,
        breed: pets.breed,
        ownerName: pets.ownerName,
        createdAt: pets.createdAt,
        updatedAt: pets.updatedAt
      }));

    if (!pet) return adminError("Питомец не найден.", 404);
    return privateJson({ pet: publicPet(pet) });
  } catch {
    return adminError("Не удалось сохранить питомца.", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    if (!await authorizeAdminRequest(request, true)) return adminError("Требуется вход.", 401);

    const payload = await request.json().catch(() => null) as { petId?: unknown } | null;
    const petId = String(payload?.petId ?? "").trim();
    if (!uuidPattern.test(petId)) return adminError("Некорректные данные питомца.", 400);

    const deleted = await withDb((db) => db
      .delete(pets)
      .where(eq(pets.id, petId))
      .returning({ id: pets.id }));

    if (!deleted.length) return adminError("Питомец не найден.", 404);
    return privateJson({ deleted: true });
  } catch {
    return adminError("Не удалось удалить питомца.", 500);
  }
}
