import { asc } from "drizzle-orm";
import { withDb } from "../../../db";
import { locations } from "../../../db/schema";

function databaseError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("ECONNREFUSED") || message.includes("connect")) {
    return "Не удалось подключиться к PostgreSQL.";
  }
  return "Не удалось получить список локаций.";
}

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
    return Response.json({ error: databaseError(error) }, { status: 500 });
  }
}
