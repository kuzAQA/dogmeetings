import { sql } from "drizzle-orm";
import { withDb } from "../../../db";

export async function GET() {
  try {
    await withDb((db) => db.execute(sql`select 1`));
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "error" }, { status: 503 });
  }
}
