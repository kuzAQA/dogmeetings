import { and, asc, eq } from "drizzle-orm";
import { withDb } from "../../../db";
import { places } from "../../../db/schema";
import { databaseErrorMessage } from "../../../lib/database-error";

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
    return Response.json({ error: databaseErrorMessage(error, "Не удалось получить список мест.") }, { status: 500 });
  }
}
