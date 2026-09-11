import { and, eq } from "drizzle-orm";
import { withDb } from "../../../db";
import { petShareLinks, pets } from "../../../db/schema";
import { getClientSession, isSameOriginRequest, privateJson } from "../../../lib/session";
import { PUBLIC_ORIGIN } from "../../../server/infrastructure/public-origin";
import { uuidPattern } from "../../../server/domain/pet";
import { readJsonRecord, readJsonString } from "../../../server/transport/request-json";

const shareTokenPattern = /^[0-9a-f]{20}$/i;

function createShareToken() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 20);
}

function sharePayload(token: string) {
  return { link: `${PUBLIC_ORIGIN}/share/${encodeURIComponent(token)}` };
}

async function ownedPet(petId: string, clientId: string) {
  const [pet] = await withDb((db) => db
    .select({ id: pets.id })
    .from(pets)
    .where(and(eq(pets.id, petId), eq(pets.clientId, clientId)))
    .limit(1));
  return pet;
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return privateJson({ error: "Запрос отклонён." }, { status: 403 });
  }

  try {
    const session = await getClientSession(request);
    if (!session) return privateJson({ error: "Сессия истекла. Обновите страницу." }, { status: 401 });

    const payload = await readJsonRecord(request);
    const petId = readJsonString(payload, "petId").trim();
    if (!uuidPattern.test(petId)) {
      return privateJson({ error: "Некорректные данные питомца." }, { status: 400 });
    }
    if (!await ownedPet(petId, session.clientId)) {
      return privateJson({ error: "Поделиться может только владелец питомца." }, { status: 403 });
    }

    const [existing] = await withDb((db) => db
      .select({ token: petShareLinks.token })
      .from(petShareLinks)
      .where(eq(petShareLinks.petId, petId))
      .limit(1));
    if (existing && shareTokenPattern.test(existing.token)) {
      return privateJson(sharePayload(existing.token));
    }

    const token = createShareToken();
    const [created] = await withDb((db) => db
      .insert(petShareLinks)
      .values({ token, petId })
      .onConflictDoUpdate({
        target: petShareLinks.petId,
        set: { token, updatedAt: new Date() }
      })
      .returning({ token: petShareLinks.token }));
    return privateJson(sharePayload(created.token), { status: 201 });
  } catch {
    return privateJson({ error: "Не удалось получить ссылку на питомца." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) {
    return privateJson({ error: "Запрос отклонён." }, { status: 403 });
  }

  try {
    const session = await getClientSession(request);
    if (!session) return privateJson({ error: "Сессия истекла. Обновите страницу." }, { status: 401 });

    const payload = await readJsonRecord(request);
    const petId = readJsonString(payload, "petId").trim();
    if (!uuidPattern.test(petId)) {
      return privateJson({ error: "Некорректные данные питомца." }, { status: 400 });
    }
    if (!await ownedPet(petId, session.clientId)) {
      return privateJson({ error: "Обновить ссылку может только владелец питомца." }, { status: 403 });
    }

    const token = createShareToken();
    const [link] = await withDb((db) => db
      .insert(petShareLinks)
      .values({ token, petId, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: petShareLinks.petId,
        set: { token, updatedAt: new Date() }
      })
      .returning({ token: petShareLinks.token }));

    return privateJson(sharePayload(link.token));
  } catch {
    return privateJson({ error: "Не удалось создать новую ссылку." }, { status: 500 });
  }
}
