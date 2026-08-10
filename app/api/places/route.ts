import { and, asc, eq } from "drizzle-orm";
import { withDb } from "../../../db";
import { places } from "../../../db/schema";

function databaseError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("ECONNREFUSED") || message.includes("connect")) {
    return "Не удалось подключиться к PostgreSQL.";
  }
  return "Не удалось получить список мест.";
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const city = params.get("city")?.trim() ?? "";
  const district = params.get("district")?.trim() ?? "";
  const residentialComplex = params.get("complex")?.trim() ?? "";

  if (!city || !district || !residentialComplex) {
    return Response.json({ error: "Некорректные параметры локации." }, { status: 400 });
  }

  try {
    const rows = await withDb((db) => db
      .select({ id: places.id, name: places.name })
      .from(places)
      .where(and(
        eq(places.city, city),
        eq(places.district, district),
        eq(places.residentialComplex, residentialComplex)
      ))
      .orderBy(asc(places.name))
      .limit(100));

    return Response.json({ places: rows });
  } catch (error) {
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}
