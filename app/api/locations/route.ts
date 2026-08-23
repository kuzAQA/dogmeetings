import { asc } from "drizzle-orm";
import { withDb } from "../../../db";
import { locations } from "../../../db/schema";
import { databaseErrorMessage } from "../../../lib/database-error";

export async function GET() {
  try {
    const rows = await withDb((db) => db
      .select({
        city: locations.city,
        district: locations.district,
        complex: locations.residentialComplex
      })
      .from(locations)
      .orderBy(
        asc(locations.city),
        asc(locations.district),
        asc(locations.residentialComplex)
      ));

    return Response.json({ locations: rows });
  } catch (error) {
    return Response.json({ error: databaseErrorMessage(error, "Не удалось получить список локаций.") }, { status: 500 });
  }
}
