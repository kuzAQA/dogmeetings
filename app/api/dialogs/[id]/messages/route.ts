import { privateJson } from "../../../../../lib/session";
import { chatText } from "../../../../../server/domain/chat";
import { ChatError, dialogHistory, sendMessage } from "../../../../../server/infrastructure/chat-repository";
import { chatId, chatRequest, chatSeq, type ChatRouteContext } from "../../../../../server/transport/chat";
import { readJsonRecord } from "../../../../../server/transport/request-json";

export function GET(request: Request, context: ChatRouteContext) {
  return chatRequest(request, async clientId => {
    const id = chatId((await context.params).id);
    const params = new URL(request.url).searchParams;
    const before = params.has("beforeSeq") ? chatSeq(params.get("beforeSeq")) : undefined;
    const after = params.has("afterSeq") ? chatSeq(params.get("afterSeq")) : undefined;
    if (before !== undefined && after !== undefined) throw new ChatError(400, "Выберите одно направление истории.");
    const pending = params.get("pendingIds")?.split(",").map(chatSeq) ?? [];
    if (pending.length > 50) throw new ChatError(400, "Не более 50 статусов за запрос.");
    return privateJson(await dialogHistory(clientId, id, { before, after, pending }));
  });
}

export function POST(request: Request, context: ChatRouteContext) {
  return chatRequest(request, async clientId => {
    const id = chatId((await context.params).id);
    const payload = await readJsonRecord(request);
    const text = chatText(payload?.text);
    if (text === null) throw new ChatError(400, "Введите текст от 1 до 2000 символов, не состоящий из пробелов.");
    const result = await sendMessage(clientId, id, chatId(payload?.requestId), text);
    return privateJson(result, { status: result.duplicate ? 200 : 201 });
  });
}
