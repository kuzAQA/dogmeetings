"use client";

import { useEffect, useSyncExternalStore } from "react";

type MessageNotice = { dialogId: string; messageSeq: number };
type State = { count: number; notification: MessageNotice | null };
const initial: State = { count: 0, notification: null };
let state = initial;
let source: EventSource | null = null;
let consumers = 0;
let activeDialog: string | null = null;
const listeners = new Set<() => void>();
const seen = new Map<string, number>();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function publish(next: State) {
  state = next;
  for (const listener of listeners) listener();
}
function disconnect() {
  source?.close();
  source = null;
}
function connect() {
  if (source || !consumers || document.visibilityState !== "visible" || typeof EventSource === "undefined") return;
  const current = new EventSource("/api/dialogs/events");
  source = current;
  current.addEventListener("unread", event => {
    if (source !== current) return;
    try {
      const data = JSON.parse(event.data);
      if (Number.isSafeInteger(data.unreadCount) && data.unreadCount >= 0) publish({ ...state, count: data.unreadCount });
    } catch { /* Keep the last confirmed state on malformed frames. */ }
  });
  current.addEventListener("message", event => {
    if (source !== current || document.visibilityState !== "visible") return;
    try {
      const data = JSON.parse(event.data) as MessageNotice;
      if (!uuid.test(data.dialogId) || !Number.isSafeInteger(data.messageSeq) || data.messageSeq < 1 ||
        data.messageSeq <= (seen.get(data.dialogId) ?? 0)) return;
      seen.delete(data.dialogId);
      seen.set(data.dialogId, data.messageSeq);
      if (seen.size > 100) seen.delete(seen.keys().next().value!);
      window.dispatchEvent(new Event("dogmeet-chat-changed"));
      if (data.dialogId !== activeDialog) publish({ ...state, notification: data });
    } catch { /* EventSource owns retries; errors never start HTTP polling. */ }
  });
}
function visibilityChanged() {
  if (document.visibilityState === "visible") connect();
  else {
    disconnect();
    if (state.notification) dismissChatNotification();
  }
}
function sessionChanged() {
  disconnect();
  seen.clear();
  publish(initial);
  connect();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function useChatState(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    consumers++;
    if (consumers === 1) {
      document.addEventListener("visibilitychange", visibilityChanged);
      window.addEventListener("dogmeet-session-changed", sessionChanged);
      connect();
    }
    return () => {
      consumers--;
      if (!consumers) {
        disconnect();
        document.removeEventListener("visibilitychange", visibilityChanged);
        window.removeEventListener("dogmeet-session-changed", sessionChanged);
      }
    };
  }, [ready]);
  return useSyncExternalStore(subscribe, () => state, () => initial);
}
export function dismissChatNotification() {
  if (state.notification) publish({ ...state, notification: null });
}
export function useUnread(ready: boolean) {
  return useChatState(ready).count;
}
export function useChatNotifications(ready: boolean, dialogId: string | null) {
  const snapshot = useChatState(ready);
  useEffect(() => {
    activeDialog = dialogId;
    if (state.notification?.dialogId === dialogId) dismissChatNotification();
    return () => { activeDialog = null; };
  }, [dialogId]);
  return snapshot;
}
