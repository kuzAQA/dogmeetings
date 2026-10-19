import { requestJson } from "../api/client";

export type SharedPet = {
  id: string;
  name: string;
  breed: string;
  ownerName: string;
  description?: string | null;
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

export async function ensureClientSession(token: string) {
  await requestJson("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shareToken: token })
  });
}

export function loadSharedPet(token: string) {
  return requestJson<SharedPetPreview>(`/api/pet-shares/${encodeURIComponent(token)}`, { cache: "no-store" });
}

export function addSharedPet(token: string) {
  return requestJson<SharedPetAcceptance>(`/api/pet-shares/${encodeURIComponent(token)}`, { method: "POST" });
}
