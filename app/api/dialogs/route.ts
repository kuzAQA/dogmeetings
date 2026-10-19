import { privateJson } from "../../../lib/session";
import { ChatError, listDialogs, openDialog } from "../../../server/infrastructure/chat-repository";
import { chatId, chatRequest } from "../../../server/transport/chat";
import { readJsonRecord } from "../../../server/transport/request-json";

export function GET(request: Request) {
  return chatRequest(request, async clientId => {
    const raw = new URL(request.url).searchParams.get("cursor");
    let cursor: { at: string; id: string } | undefined;
    if (raw) {
      const [at, id, extra] = raw.split("|");
      if (!at || !Number.isFinite(Date.parse(at)) || extra) throw new ChatError(400, "Некорректная страница списка.");
      cursor = { at, id: chatId(id) };
    }
    return privateJson(await listDialogs(clientId, cursor));
  });
}

export function POST(request: Request) {
  return chatRequest(request, async clientId => {
    const payload = await readJsonRecord(request);
    const target = payload?.walkId ? { walkId: chatId(payload.walkId) }
      : { peerClientId: chatId(payload?.peerClientId) };
    const petId = payload?.petId === undefined ? undefined : chatId(payload.petId);
    return privateJson(await openDialog(clientId, { ...target, petId }));
  });
}
