"use client";

import { useEffect, useRef, useState } from "react";
import { requestJson } from "../api/client";
import { useChatPolling } from "./use-chat-polling";

export function useUnread(ready: boolean) {
  const [count, setCount] = useState(0);
  const revision = useRef(0);
  const refresh = useChatPolling(ready ? "unread" : null, async signal => {
    const version = revision.current;
    const result = await requestJson<{ unreadCount: number }>("/api/dialogs?unread=1", { cache: "no-store", signal });
    if (!signal.aborted && version === revision.current) setCount(result.unreadCount);
  }, () => {});
  useEffect(() => {
    const changed = () => { revision.current++; refresh(); };
    window.addEventListener("dogmeet-chat-changed", changed);
    return () => window.removeEventListener("dogmeet-chat-changed", changed);
  }, [refresh]);
  return count;
}
