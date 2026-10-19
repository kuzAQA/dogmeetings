"use client";

import { useCallback, useEffect, useRef } from "react";
import { CHAT_POLL_MS } from "../../../server/domain/chat";

export function useChatPolling(key: string | null, poll: (signal: AbortSignal) => Promise<void>, onError: (error: unknown) => void) {
  const callbacks = useRef({ poll, onError });
  const refresh = useRef(() => {});
  useEffect(() => { callbacks.current = { poll, onError }; });
  useEffect(() => {
    if (!key) return;
    let stopped = false;
    let running = false;
    let requested = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    async function run() {
      if (stopped || document.visibilityState !== "visible") return;
      if (running) { requested = true; return; }
      if (timer) clearTimeout(timer);
      running = true;
      try {
        await callbacks.current.poll(AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]));
      } catch (error) {
        if (!stopped) callbacks.current.onError(error);
      } finally {
        running = false;
        if (!stopped && document.visibilityState === "visible") {
          timer = setTimeout(run, requested ? 0 : CHAT_POLL_MS);
          requested = false;
        }
      }
    }
    function visibility() {
      if (timer) clearTimeout(timer);
      if (document.visibilityState === "visible") void run();
    }
    refresh.current = () => { void run(); };
    document.addEventListener("visibilitychange", visibility);
    void run();
    return () => {
      stopped = true;
      controller.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", visibility);
      refresh.current = () => {};
    };
  }, [key]);
  return useCallback(() => refresh.current(), []);
}
