import { requestJson } from "../api/client";
import type { ChatDialog, ChatHistory, ChatMessage, DialogSummary } from "../../../server/domain/chat";

export function createMessageId() {
  // getRandomValues also works on HTTP LAN origins, where randomUUID is unavailable.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const json = (body: unknown) => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
export function openChat(target: ({ walkId: string } | { peerClientId: string }) & { petId?: string }, signal?: AbortSignal) {
  return requestJson<{ dialog: ChatDialog; serverTime: string }>("/api/dialogs", { method: "POST", ...json(target), signal });
}
export function listChats(cursor: string | null, signal: AbortSignal) {
  return requestJson<{ dialogs: DialogSummary[]; nextCursor: string | null }>(`/api/dialogs${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    { cache: "no-store", signal });
}
export function loadChat(id: string, params: URLSearchParams, signal?: AbortSignal) {
  return requestJson<ChatHistory>(`/api/dialogs/${id}/messages?${params}`, { cache: "no-store", signal });
}
export function postMessage(id: string, attempt: { requestId: string; text: string }) {
  return requestJson<{ message: ChatMessage; dialog: ChatDialog; serverTime: string }>(`/api/dialogs/${id}/messages`,
    { method: "POST", ...json(attempt), signal: AbortSignal.timeout(15000) });
}
export async function hideChat(id: string) {
  const result = await requestJson<{ hiddenThrough: number }>(`/api/dialogs/${id}`, { method: "PATCH", ...json({ action: "hide" }), signal: AbortSignal.timeout(15000) });
  window.dispatchEvent(new Event("dogmeet-chat-changed"));
  return result;
}
export function readChat(id: string, messageSeqs: number[], signal: AbortSignal) {
  return requestJson(`/api/dialogs/${id}`, { method: "PATCH", ...json({ action: "read", messageSeqs }), signal });
}
