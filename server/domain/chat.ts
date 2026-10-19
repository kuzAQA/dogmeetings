export const MAX_MESSAGE_LENGTH = 2000;
export const CHAT_POLL_MS = 7000;
export const CHAT_NOTICE = "Сообщения хранятся 3 дня. Через 72 часа после первого сообщения диалог удалится у обоих участников";
export const CHAT_DELETE_NOTICE = "Удалить диалог только у вас? У собеседника переписка останется";

export function messageLength(text: string) {
  return Array.from(text.replace(/\r\n?/g, "\n")).length;
}

export function chatText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\r\n?/g, "\n");
  return text.trim() && !text.includes("\0") && messageLength(text) <= MAX_MESSAGE_LENGTH ? text : null;
}

export type ChatPeer = { clientId: string; name: string; photoUrl?: string };
export type ChatDialog = { id: string; peer: ChatPeer; expiresAt: string | null; hiddenThrough: number };
export type ChatMessage = { seq: number; requestId: string; text: string; createdAt: string; readAt: string | null; mine: boolean };
export type DialogSummary = ChatDialog & { lastMessage: ChatMessage; unreadCount: number };
export type ChatHistory = {
  dialog: ChatDialog; messages: ChatMessage[]; receipts: { seq: number; readAt: string | null }[];
  hasOlder: boolean; hasMore: boolean; serverTime: string;
};
