import { eq } from "drizzle-orm";
import { withDb } from "../../../db";
import { pets } from "../../../db/schema";

const IMMUTABLE_PHOTO_CACHE = "public, max-age=31536000, immutable";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const id = requestUrl.searchParams.get("id")?.trim();
  if (!id) {
    return Response.json({ error: "Не указан питомец." }, { status: 400 });
  }

  try {
    const [pet] = await withDb((db) => db
        .select({ photo: pets.photo, photoType: pets.photoType, updatedAt: pets.updatedAt })
        .from(pets)
        .where(eq(pets.id, id))
        .limit(1));

    if (!pet) {
      return Response.json({ error: "Фотография не найдена." }, { status: 404 });
    }

    const currentVersion = String(pet.updatedAt.getTime());
    if (requestUrl.searchParams.get("v") !== currentVersion) {
      requestUrl.searchParams.set("v", currentVersion);
      return new Response(null, {
        status: 307,
        headers: {
          "Location": requestUrl.toString(),
          "Cache-Control": "no-store"
        }
      });
    }

    if (!pet.photo || !pet.photoType) {
      return new Response(null, {
        status: 302,
        headers: {
          "Location": new URL("/dog-placeholder.webp", request.url).toString(),
          "Cache-Control": IMMUTABLE_PHOTO_CACHE
        }
      });
    }

    return new Response(new Uint8Array(pet.photo), {
      headers: {
        "Content-Type": pet.photoType,
        "Content-Length": String(pet.photo.byteLength),
        "Cache-Control": IMMUTABLE_PHOTO_CACHE,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return Response.json({ error: "Не удалось загрузить фотографию." }, { status: 500 });
  }
}
