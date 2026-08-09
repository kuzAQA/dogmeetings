import { desc } from "drizzle-orm";
import { ensurePetStorage, getDb, getPhotoBucket } from "../../../db";
import { pets } from "../../../db/schema";

const MAX_PHOTO_SIZE = 5 * 1024 * 1024;
const photoExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

function publicPet(pet: typeof pets.$inferSelect) {
  return {
    id: pet.id,
    name: pet.name,
    ownerName: pet.ownerName,
    photoUrl: `/api/pet-photo?id=${encodeURIComponent(pet.id)}`,
    createdAt: pet.createdAt.toISOString()
  };
}

function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Неизвестная ошибка";
  if (message.includes("no such table")) {
    return "База данных ещё не подготовлена. Попробуйте немного позже.";
  }
  return message;
}

export async function GET() {
  try {
    await ensurePetStorage();
    const rows = await getDb()
      .select()
      .from(pets)
      .orderBy(desc(pets.createdAt))
      .limit(100);

    return Response.json({ pets: rows.map(publicPet) });
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let photoKey = "";

  try {
    await ensurePetStorage();
    const formData = await request.formData();
    const name = String(formData.get("petName") ?? "").trim();
    const ownerName = String(formData.get("ownerName") ?? "").trim();
    const photo = formData.get("photo");

    if (!name || name.length > 40) {
      return Response.json({ error: "Укажите имя питомца до 40 символов." }, { status: 400 });
    }
    if (!ownerName || ownerName.length > 60) {
      return Response.json({ error: "Укажите имя хозяйки до 60 символов." }, { status: 400 });
    }
    if (!(photo instanceof File) || photo.size === 0) {
      return Response.json({ error: "Добавьте фотографию питомца." }, { status: 400 });
    }
    const extension = photoExtensions[photo.type];
    if (!extension) {
      return Response.json({ error: "Поддерживаются фотографии JPEG, PNG и WebP." }, { status: 400 });
    }
    if (photo.size > MAX_PHOTO_SIZE) {
      return Response.json({ error: "Фотография должна быть меньше 5 МБ." }, { status: 400 });
    }

    const id = crypto.randomUUID();
    photoKey = `pets/${id}.${extension}`;
    const bucket = getPhotoBucket();
    await bucket.put(photoKey, photo.stream(), {
      httpMetadata: { contentType: photo.type },
      customMetadata: { petId: id }
    });

    try {
      const [pet] = await getDb()
        .insert(pets)
        .values({
          id,
          name,
          ownerName,
          photoKey,
          photoType: photo.type
        })
        .returning();

      return Response.json({ pet: publicPet(pet) }, { status: 201 });
    } catch (error) {
      await bucket.delete(photoKey);
      photoKey = "";
      throw error;
    }
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}
