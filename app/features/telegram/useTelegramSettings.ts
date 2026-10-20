"use client";

import { useEffect, useState } from "react";
import { requestJson } from "../api/client";

export type TelegramSettings = { enabled: boolean; subscribed: boolean; status: "active" | "inactive" | "unknown" };
export const telegramStatusText = { active: "Активна", inactive: "Неактивна", unknown: "Неизвестна" };

export function useTelegramSettings(sessionReady: boolean) {
  const [settings, setSettings] = useState<TelegramSettings | null>(null);
  useEffect(() => {
    if (!sessionReady) return;
    let controller: AbortController;
    const load = () => {
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      void requestJson<TelegramSettings>("/api/telegram/notifications", {
        cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(15000)])
      }).then(value => { if (!signal.aborted) setSettings(value); })
        .catch(() => { if (!signal.aborted) setSettings(null); });
    };
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    load();
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", onVisible);
    return () => { controller.abort(); window.removeEventListener("focus", load); document.removeEventListener("visibilitychange", onVisible); };
  }, [sessionReady]);
  return settings;
}
