"use client";

import { useEffect, useState } from "react";
import type { Period } from "../../../lib/walks";
import { moscowDate } from "../../../server/domain/walk";

export function useNearbyPeriod() {
  const [automaticPeriod, setAutomaticPeriod] = useState<Period>("Все");
  const [manualPeriod, setManualPeriod] = useState<Period | null>(null);

  useEffect(() => {
    if (manualPeriod !== null) return;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      clearTimeout(timer);
      const hour = Number(new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Moscow", hour: "2-digit", hourCycle: "h23"
      }).format(new Date()));
      setAutomaticPeriod(hour < 12 ? "Утро" : hour < 18 ? "День" : "Вечер");
      const midnight = new Date(`${moscowDate()}T00:00:00+03:00`).getTime();
      const deadline = midnight + (hour < 12 ? 12 : hour < 18 ? 18 : 24) * 60 * 60 * 1000;
      timer = setTimeout(refresh, Math.max(0, deadline - Date.now()));
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [manualPeriod]);

  return [manualPeriod ?? automaticPeriod, setManualPeriod] as const;
}
