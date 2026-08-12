import { eq } from "drizzle-orm";
import { withDb } from "../../../db";
import { pets } from "../../../db/schema";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) {
    return Response.json({ error: "Не указан питомец." }, { status: 400 });
  }

  try {
    const [pet] = await withDb((db) => db
        .select({ photo: pets.photo, photoType: pets.photoType })
        .from(pets)
        .where(eq(pets.id, id))
        .limit(1));

    if (!pet) {
      return Response.json({ error: "Фотография не найдена." }, { status: 404 });
    }

    if (!pet.photo || !pet.photoType) {
      return new Response(null, {
        status: 302,
        headers: {
          "Location": new URL("/dog-placeholder.webp", request.url).toString(),
          "Cache-Control": "private, no-cache, must-revalidate"
        }
      });
    }

    return new Response(new Uint8Array(pet.photo), {
      headers: {
        "Content-Type": pet.photoType,
        "Cache-Control": "private, no-cache, must-revalidate"
      }
    });
  } catch {
    return Response.json({ error: "Не удалось загрузить фотографию." }, { status: 500 });
  }
}
