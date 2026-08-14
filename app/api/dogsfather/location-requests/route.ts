import { asc, eq } from "drizzle-orm";
import { withDb } from "../../../../db";
import { locationRequests, locations } from "../../../../db/schema";
import { hasValidAdminSession } from "../../../../lib/admin-auth";
import { isSameOriginRequest, privateJson } from "../../../../lib/session";

async function authorize(request: Request, mutation = false) {
  if (mutation && !isSameOriginRequest(request)) return false;
  return hasValidAdminSession(request);
}

export async function GET(request: Request) {
  try {
    if (!await authorize(request)) return privateJson({ error: "Требуется вход." }, { status: 401 });
    const rows = await withDb((db) => db
      .select()
      .from(locationRequests)
      .orderBy(asc(locationRequests.createdAt)));
    return privateJson({
      requests: rows.map((row) => ({
        id: row.id,
        city: row.city,
        district: row.district,
        complex: row.residentialComplex,
        createdAt: row.createdAt.toISOString()
      }))
    });
  } catch {
    return privateJson({ error: "Не удалось загрузить заявки." }, { status: 500 });
  }
}

async function requestId(request: Request) {
  const payload = await request.json().catch(() => null) as { id?: unknown } | null;
  const id = String(payload?.id ?? "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : "";
}

export async function PATCH(request: Request) {
  try {
    if (!await authorize(request, true)) return privateJson({ error: "Требуется вход." }, { status: 401 });
    const id = await requestId(request);
    if (!id) return privateJson({ error: "Некорректная заявка." }, { status: 400 });

    const result = await withDb((db) => db.transaction(async (tx) => {
      const [pending] = await tx
        .select()
        .from(locationRequests)
        .where(eq(locationRequests.id, id))
        .limit(1);
      if (!pending) return null;
      await tx
        .insert(locations)
        .values({
          city: pending.city,
          district: pending.district,
          residentialComplex: pending.residentialComplex
        })
        .onConflictDoNothing();
      await tx.delete(locationRequests).where(eq(locationRequests.id, id));
      return pending;
    }));

    if (!result) return privateJson({ error: "Заявка уже обработана." }, { status: 404 });
    return privateJson({ approved: true });
  } catch {
    return privateJson({ error: "Не удалось добавить локацию." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    if (!await authorize(request, true)) return privateJson({ error: "Требуется вход." }, { status: 401 });
    const id = await requestId(request);
    if (!id) return privateJson({ error: "Некорректная заявка." }, { status: 400 });
    const removed = await withDb((db) => db
      .delete(locationRequests)
      .where(eq(locationRequests.id, id))
      .returning({ id: locationRequests.id }));
    if (!removed.length) return privateJson({ error: "Заявка уже обработана." }, { status: 404 });
    return privateJson({ rejected: true });
  } catch {
    return privateJson({ error: "Не удалось отклонить заявку." }, { status: 500 });
  }
}
