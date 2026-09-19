import { requestJson } from "../api/client";
import type { AdminLocation, AdminLocationTarget, AdminPet, LocationRequest, LoginChallenge, LoginProof } from "./model";

export async function getAdminSession() {
  return requestJson<{ authenticated?: boolean }>("/api/dogsfather/session", {
    cache: "no-store",
    credentials: "same-origin"
  });
}

export async function loadLocationRequests() {
  const data = await requestJson<{ requests?: LocationRequest[] }>("/api/dogsfather/location-requests", {
    cache: "no-store",
    credentials: "same-origin"
  });
  return data.requests ?? [];
}

export async function loadAdminPets() {
  const data = await requestJson<{ pets?: AdminPet[] }>("/api/dogsfather/pets", {
    cache: "no-store",
    credentials: "same-origin"
  });
  return data.pets ?? [];
}

export async function getLoginChallenge() {
  return requestJson<LoginChallenge>("/api/dogsfather/challenge", {
    cache: "no-store",
    credentials: "same-origin"
  });
}

export async function submitLogin(proof: LoginProof) {
  return requestJson<{ authenticated?: boolean }>("/api/dogsfather/session", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(proof)
  });
}

export async function logoutAdmin() {
  await requestJson<{ authenticated?: boolean }>("/api/dogsfather/session", {
    method: "DELETE",
    credentials: "same-origin"
  });
}

export async function approveLocationRequest(id: string) {
  await requestJson("/api/dogsfather/location-requests", {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id })
  });
}

export async function rejectLocationRequest(id: string) {
  await requestJson("/api/dogsfather/location-requests", {
    method: "DELETE",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id })
  });
}

export async function saveAdminPet(formData: FormData) {
  const data = await requestJson<{ pet?: AdminPet }>("/api/dogsfather/pets", {
    method: "PATCH",
    credentials: "same-origin",
    body: formData
  });
  if (!data.pet) throw new Error("Не удалось сохранить питомца.");
  return data.pet;
}

export async function deleteAdminPet(petId: string) {
  await requestJson("/api/dogsfather/pets", {
    method: "DELETE",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ petId })
  });
}

export async function loadAdminLocations() {
  const data = await requestJson<{ locations?: AdminLocation[] }>("/api/dogsfather/locations", {
    cache: "no-store",
    credentials: "same-origin"
  });
  return data.locations ?? [];
}

export async function renameAdminLocation(target: AdminLocationTarget, name: string) {
  await requestJson("/api/dogsfather/locations", {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...target, name })
  });
}

export async function deleteAdminLocation(target: AdminLocationTarget, proof: string) {
  await requestJson("/api/dogsfather/locations", {
    method: "DELETE",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...target, proof })
  });
}
