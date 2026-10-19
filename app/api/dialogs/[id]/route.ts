import { privateJson } from "../../../../lib/session";
import { ChatError, updateDialog } from "../../../../server/infrastructure/chat-repository";
import { chatId, chatRequest, chatSeq, type ChatRouteContext } from "../../../../server/transport/chat";
import { readJsonRecord } from "../../../../server/transport/request-json";

export function PATCH(request: Request, context: ChatRouteContext) {
  return chatRequest(request, async clientId => {
    const id = chatId((await context.params).id);
    const payload = await readJsonRecord(request);
    if (payload?.action !== "hide" && payload?.action !== "read") throw new ChatError(400, "Некорректное действие.");
    const seqs = payload.action === "read" ? payload.messageSeqs : [];
    if (!Array.isArray(seqs) || seqs.length > 50) throw new ChatError(400, "Не более 50 сообщений за запрос.");
    return privateJson(await updateDialog(clientId, id, payload.action, seqs.map(chatSeq)));
  });
}
