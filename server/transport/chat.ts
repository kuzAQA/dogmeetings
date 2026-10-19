import { databaseErrorMessage } from "../../lib/database-error";
import { getClientSession, isSameOriginRequest, privateJson } from "../../lib/session";
import { uuidPattern } from "../domain/pet";
import { ChatError } from "../infrastructure/chat-repository";

export type ChatRouteContext = { params: Promise<{ id: string }> };

export async function chatRequest(request: Request, operation: (clientId: string) => Promise<Response>) {
  if (request.method !== "GET" && !isSameOriginRequest(request)) {
    return privateJson({ error: "Запрос отклонён." }, { status: 403 });
  }
  try {
    const session = await getClientSession(request);
    if (!session) return privateJson({ error: "Сессия истекла. Обновите страницу." }, { status: 401 });
    return await operation(session.clientId);
  } catch (error) {
    return privateJson({ error: error instanceof ChatError ? error.message
      : databaseErrorMessage(error, "Не удалось выполнить запрос диалога.") },
    { status: error instanceof ChatError ? error.status : 500 });
  }
}

export function chatId(value: unknown): string {
  if (typeof value !== "string" || !uuidPattern.test(value)) throw new ChatError(400, "Некорректный идентификатор.");
  return value.toLowerCase();
}

export function chatSeq(value: unknown): number {
  if ((typeof value !== "number" && typeof value !== "string") || !/^\d+$/.test(String(value))) {
    throw new ChatError(400, "Некорректный номер сообщения.");
  }
  const seq = Number(value);
  if (!Number.isSafeInteger(seq) || seq < 0) throw new ChatError(400, "Некорректный номер сообщения.");
  return seq;
}
