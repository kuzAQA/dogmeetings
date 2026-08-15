import { eq } from "drizzle-orm";
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

export async function GET(_request: Request, context: RouteContext) {
  const { token } = await context.params;
  if (!shareTokenPattern.test(token)) {
    return Response.json({ error: "Ссылка недействительна." }, { status: 404 });
  }

  try {
    const pet = await sharedPet(token);
    if (!pet) return Response.json({ error: "Ссылка недействительна или была обновлена." }, { status: 404 });

    return Response.json({
      pet: {
        id: pet.id,
        name: pet.name,
        breed: pet.breed,
        ownerName: pet.ownerName,
        photoUrl: `/api/pet-photo?id=${encodeURIComponent(pet.id)}&v=${pet.updatedAt.getTime()}`
      }
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
    if (!pet) return privateJson({ error: "Ссылка недействительна или была обновлена." }, { status: 404 });

    if (pet.ownerClientId === session.clientId) {
      return privateJson({ petId: pet.id, added: false, alreadyAdded: true });
    }

    const [createdCollaboration] = await withDb((db) => db
      .insert(petCollaborators)
      .values({
        petId: pet.id,
        clientId: session.clientId,
        grantedByClientId: pet.ownerClientId
      })
      .onConflictDoNothing({
        target: [petCollaborators.petId, petCollaborators.clientId]
      })
      .returning({ petId: petCollaborators.petId }));

    return privateJson({
      petId: pet.id,
      added: Boolean(createdCollaboration),
      alreadyAdded: !createdCollaboration
    });
  } catch {
    return privateJson({ error: "Не удалось добавить питомца." }, { status: 500 });
  }
}
