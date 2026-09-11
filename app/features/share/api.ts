import { ApiRequestError, requestJson } from "../api/client";

export type SharedPet = {
  id: string;
  name: string;
  breed: string;
  ownerName: string;
  photoUrl: string;
};

type SharedPetPreview = {
  pet?: SharedPet;
  alreadyAdded?: boolean;
  inactive?: boolean;
  error?: string;
};

type SharedPetAcceptance = {
  petId?: string;
  added?: boolean;
  alreadyAdded?: boolean;
  inactive?: boolean;
  error?: string;
};

export async function ensureClientSession() {
  try {
    await requestJson("/api/session", { cache: "no-store" });
    return;
  } catch (error) {
    if (!(error instanceof ApiRequestError) || error.status !== 401) {
      throw new Error("Не удалось восстановить сессию.");
    }
  }

  await requestJson("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
}

export function loadSharedPet(token: string) {
  return requestJson<SharedPetPreview>(`/api/pet-shares/${encodeURIComponent(token)}`, { cache: "no-store" });
}

export function addSharedPet(token: string) {
  return requestJson<SharedPetAcceptance>(`/api/pet-shares/${encodeURIComponent(token)}`, { method: "POST" });
}
