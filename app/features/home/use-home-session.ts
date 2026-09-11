"use client";

import { useCallback, useEffect, useState } from "react";
import { type SessionBootstrapData, uuidPattern } from "./model";
import { bootstrapSession, clearLegacySessionData, resetSessionBootstrap } from "./session";

export type SharedPetNavigation = {
  sharedPetId: string;
  sharedPetAlreadyAddedId: string;
};

function readSharedPetNavigation(): SharedPetNavigation {
  const searchParameters = new URLSearchParams(window.location.search);
  const sharedPetId = searchParameters.get("sharedPet") ?? "";
  const sharedPetAlreadyAddedId = searchParameters.get("sharedPetAlreadyAdded") ?? "";
  return {
    sharedPetId: uuidPattern.test(sharedPetId) ? sharedPetId : "",
    sharedPetAlreadyAddedId: uuidPattern.test(sharedPetAlreadyAddedId) ? sharedPetAlreadyAddedId : ""
  };
}

export function useHomeSession(onReady: (data: SessionBootstrapData, sharedPetNavigation: SharedPetNavigation) => void) {
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [sessionAttempt, setSessionAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    bootstrapSession()
      .then((data) => {
        if (!active) return;
        onReady(data, readSharedPetNavigation());
        setSessionReady(true);
        clearLegacySessionData();
      })
      .catch((error) => {
        if (!active) return;
        setSessionError(error instanceof Error ? error.message : "Не удалось восстановить безопасную сессию.");
      });

    return () => { active = false; };
  }, [onReady, sessionAttempt]);

  const retrySession = useCallback(() => {
    setSessionError("");
    resetSessionBootstrap();
    setSessionAttempt((value) => value + 1);
  }, []);

  return { sessionReady, sessionError, retrySession };
}
