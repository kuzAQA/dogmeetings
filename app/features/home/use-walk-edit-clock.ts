"use client";

import { useEffect, useState } from "react";
import { walkEditDeadline } from "../../../server/domain/walk";

export function useWalkEditClock(walks: Array<{ walkDate: string; walkTime: string }>) {
  const [now, setNow] = useState(() => Date.now());
  const deadline = Math.min(...walks.map(walkEditDeadline).filter((value) => value > now));

  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const timer = Number.isFinite(deadline)
      ? setTimeout(refresh, Math.min(Math.max(0, deadline - Date.now()), 2_147_483_647))
      : undefined;
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [deadline, now]);

  return now;
}
