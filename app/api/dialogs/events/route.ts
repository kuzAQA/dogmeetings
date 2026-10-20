import { getClientSession, privateJson } from "../../../../lib/session";
import { chatEventStream } from "../../../../server/infrastructure/chat-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await getClientSession(request);
    if (!session) return privateJson({ error: "Сессия истекла. Обновите страницу." }, { status: 401 });
    return chatEventStream(request, session);
  } catch {
    return privateJson({ error: "Уведомления временно недоступны." }, { status: 503 });
  }
}
