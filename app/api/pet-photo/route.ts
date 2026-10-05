import { eq } from "drizzle-orm";
import { withDb } from "../../../db";
import { pets } from "../../../db/schema";

const PHOTO_CACHE = "private, no-cache";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const id = requestUrl.searchParams.get("id")?.trim();
  if (!id) {
    return Response.json({ error: "Не указан питомец." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const [pet] = await withDb((db) => db
        .select({ photo: pets.photo, photoType: pets.photoType })
        .from(pets)
        .where(eq(pets.id, id))
        .limit(1));

    if (!pet) {
      return Response.json({ error: "Фотография не найдена." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    if (!pet.photo || !pet.photoType) {
      return new Response(null, {
        status: 302,
        headers: {
          "Location": new URL("/dog-placeholder.avif", request.url).toString(),
          "Cache-Control": "no-store"
        }
      });
    }

    const photo = new Uint8Array(pet.photo);
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", photo));
    const etag = `"${Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("")}-${pet.photoType}"`;
    // Revalidate the bytes, including replacements made without changing updatedAt.
    const headers = { "Cache-Control": PHOTO_CACHE, "ETag": etag };
    const unchanged = request.headers.get("if-none-match")?.split(",").some((value) =>
      value.trim() === "*" || value.trim().replace(/^W\//, "") === etag);
    if (unchanged) return new Response(null, { status: 304, headers });

    return new Response(photo, {
      headers: {
        "Content-Type": pet.photoType,
        "Content-Length": String(pet.photo.byteLength),
        ...(pet.photoType === "image/avif" ? { "Content-Disposition": `inline; filename="${encodeURIComponent(id)}.avif"` } : {}),
        ...headers,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return Response.json({ error: "Не удалось загрузить фотографию." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
