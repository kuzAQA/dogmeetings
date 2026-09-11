import { requestJson } from "../api/client";
import type { AdminPet, LocationRequest, LoginChallenge, LoginProof } from "./model";

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

export async function getPushPublicKey() {
  const data = await requestJson<{ publicKey?: string }>("/api/dogsfather/push-subscriptions", {
    cache: "no-store",
    credentials: "same-origin"
  });
  if (!data.publicKey) throw new Error("Уведомления ещё не настроены на сервере.");
  return data.publicKey;
}

export async function savePushSubscription(subscription: PushSubscription) {
  await requestJson<{ subscribed?: boolean }>("/api/dogsfather/push-subscriptions", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON())
  });
}

export async function deletePushSubscription(endpoint: string) {
  await requestJson<{ subscribed?: boolean }>("/api/dogsfather/push-subscriptions", {
    method: "DELETE",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint })
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
