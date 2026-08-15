import { and, eq } from "drizzle-orm";
import { withDb } from "../../../../db";
import { petCollaborators, petShareLinks, pets } from "../../../../db/schema";
import { getClientSession, isSameOriginRequest, privateJson } from "../../../../lib/session";

const shareTokenPattern = /^[0-9a-f]{20}$/i;

type RouteContext = { params: Promise<{ token: string }> };

async function sharedPet(token: string) {
  const [row] = await withDb((db) => db
    .select({
      id: pets.id,
      ownerClientId: pets.clientId,
      name: pets.name,
      breed: pets.breed,
      ownerName: pets.ownerName,
      updatedAt: pets.updatedAt
    })
    .from(petShareLinks)
    .innerJoin(pets, eq(petShareLinks.petId, pets.id))
    .where(eq(petShareLinks.token, token))
    .limit(1));
  return row;
}

async function clientAlreadyAddedPet(petId: string, ownerClientId: string, clientId?: string) {
  if (!clientId) return false;
  if (ownerClientId === clientId) return true;

  const [collaboration] = await withDb((db) => db
    .select({ petId: petCollaborators.petId })
    .from(petCollaborators)
    .where(and(eq(petCollaborators.petId, petId), eq(petCollaborators.clientId, clientId)))
    .limit(1));
  return Boolean(collaboration);
}

export async function GET(request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!shareTokenPattern.test(token)) {
    return Response.json({ error: "Ссылка недействительна." }, { status: 404 });
  }

  try {
    const pet = await sharedPet(token);
    if (!pet) {
      return Response.json({
        error: "Ссылка неактивна. По этой ссылке питомец уже добавлен.",
        inactive: true
      }, { status: 410 });
    }

    const session = await getClientSession(request);
    const alreadyAdded = await clientAlreadyAddedPet(pet.id, pet.ownerClientId, session?.clientId);

    return Response.json({
      pet: {
        id: pet.id,
        name: pet.name,
        breed: pet.breed,
        ownerName: pet.ownerName,
        photoUrl: `/api/pet-photo?id=${encodeURIComponent(pet.id)}&v=${pet.updatedAt.getTime()}`
      },
      alreadyAdded
    }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch {
    return Response.json({ error: "Не удалось открыть питомца." }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  if (!isSameOriginRequest(request)) {
    return privateJson({ error: "Запрос отклонён." }, { status: 403 });
  }

  const { token } = await context.params;
  if (!shareTokenPattern.test(token)) {
    return privateJson({ error: "Ссылка недействительна." }, { status: 404 });
  }

  try {
    const session = await getClientSession(request);
    if (!session) return privateJson({ error: "Сессия не найдена." }, { status: 401 });

    const pet = await sharedPet(token);
    if (!pet) {
      return privateJson({
        error: "Ссылка неактивна. По этой ссылке питомец уже добавлен.",
        inactive: true
      }, { status: 410 });
    }

    if (pet.ownerClientId === session.clientId) {
      return privateJson({ petId: pet.id, added: false, alreadyAdded: true });
    }

    // Consuming the token and adding a collaborator happen in one transaction.
    // Therefore two devices cannot accept the same share link at the same time.
    const result = await withDb((db) => db.transaction(async (tx) => {
      const [consumedLink] = await tx
        .delete(petShareLinks)
        .where(eq(petShareLinks.token, token))
        .returning({ petId: petShareLinks.petId });

      if (!consumedLink) return null;

      const [createdCollaboration] = await tx
        .insert(petCollaborators)
        .values({
          petId: consumedLink.petId,
          clientId: session.clientId,
          grantedByClientId: pet.ownerClientId
        })
        .onConflictDoNothing({
          target: [petCollaborators.petId, petCollaborators.clientId]
        })
        .returning({ petId: petCollaborators.petId });

      return {
        petId: consumedLink.petId,
        added: Boolean(createdCollaboration),
        alreadyAdded: !createdCollaboration
      };
    }));

    if (!result) {
      return privateJson({
        error: "Ссылка неактивна. По этой ссылке питомец уже добавлен.",
        inactive: true
      }, { status: 410 });
    }

    return privateJson(result);
  } catch {
    return privateJson({ error: "Не удалось добавить питомца." }, { status: 500 });
  }
}
