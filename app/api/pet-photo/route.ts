import { eq } from "drizzle-orm";
import { ensurePetStorage, getDb, getPhotoBucket } from "../../../db";
import { pets } from "../../../db/schema";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) {
    return Response.json({ error: "Не указан питомец." }, { status: 400 });
  }

  try {
    await ensurePetStorage();
    const [pet] = await getDb()
      .select({ photoKey: pets.photoKey, photoType: pets.photoType })
      .from(pets)
      .where(eq(pets.id, id))
      .limit(1);

    if (!pet) {
      return Response.json({ error: "Фотография не найдена." }, { status: 404 });
    }

    const object = await getPhotoBucket().get(pet.photoKey);
    if (!object) {
      return Response.json({ error: "Фотография не найдена." }, { status: 404 });
    }

    return new Response(object.body, {
      headers: {
        "Content-Type": pet.photoType,
        "Cache-Control": "public, max-age=86400",
        ETag: object.httpEtag
      }
    });
  } catch {
    return Response.json({ error: "Не удалось загрузить фотографию." }, { status: 500 });
  }
}
