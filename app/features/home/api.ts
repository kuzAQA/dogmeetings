import { requestJson } from "../api/client";
import type { ApiWalk } from "../../../lib/walks";
import type { AvailableLocation, Location, Pet, SharedPlace, WalkMutation } from "./model";

type LocationsResponse = { locations?: AvailableLocation[] };
type PetsResponse = { pets?: Pet[] };
type WalksResponse = { walks?: ApiWalk[] };
type PlacesResponse = { places?: SharedPlace[] };

export async function listLocations() {
  const data = await requestJson<LocationsResponse>("/api/locations");
  if (!Array.isArray(data.locations)) throw new Error("Не удалось загрузить список локаций.");
  return data.locations;
}

export async function listPets() {
  const data = await requestJson<PetsResponse>("/api/pets");
  if (!Array.isArray(data.pets)) throw new Error("Не удалось загрузить питомцев.");
  return data.pets;
}

export async function listMyWalks() {
  const data = await requestJson<WalksResponse>("/api/walks?scope=mine");
  if (!Array.isArray(data.walks)) throw new Error("Не удалось загрузить мои прогулки.");
  return data.walks;
}

export async function listWalks(location: Location) {
  const params = new URLSearchParams(location);
  const data = await requestJson<WalksResponse>(`/api/walks?${params}`);
  if (!Array.isArray(data.walks)) throw new Error("Не удалось загрузить прогулки.");
  return data.walks;
}

export async function listPlaces(location: Location) {
  const params = new URLSearchParams(location);
  const data = await requestJson<PlacesResponse>(`/api/places?${params}`);
  if (!Array.isArray(data.places)) throw new Error("Не удалось загрузить места.");
  return data.places;
}

export async function createLocationRequest(location: Location) {
  const data = await requestJson<{ request?: { id: string } }>("/api/location-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(location)
  });
  if (!data.request) throw new Error("Не удалось отправить заявку.");
  return data.request;
}

export async function saveSessionLocation(location: Location) {
  const data = await requestJson<{ location?: Location | null; hasLocation?: boolean }>("/api/session", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ location })
  });
  if (!data.hasLocation || !data.location) throw new Error("Не удалось сохранить локацию.");
  return data.location;
}

export async function requestPetShareLink(petId: string, rotate = false) {
  const data = await requestJson<{ link?: string }>("/api/pet-shares", {
    method: rotate ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ petId })
  });
  if (!data.link) throw new Error("Не удалось получить ссылку.");
  return data.link;
}

export async function savePet(formData: FormData, editing: boolean) {
  const data = await requestJson<{ pet?: Pet }>("/api/pets", {
    method: editing ? "PATCH" : "POST",
    body: formData
  });
  if (!data.pet) throw new Error("Не удалось сохранить питомца.");
  return data.pet;
}

export async function saveWalk(payload: WalkMutation) {
  const data = await requestJson<{ walk?: ApiWalk }>("/api/walks", {
    method: payload.walkId ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!data.walk) throw new Error("Не удалось сохранить прогулку.");
  return data.walk;
}

export async function deleteWalk(walkId: string) {
  const data = await requestJson<{ deleted?: boolean }>("/api/walks", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walkId })
  });
  if (!data.deleted) throw new Error("Не удалось удалить прогулку.");
}

export async function deletePet(petId: string) {
  const data = await requestJson<{ deleted?: boolean; detached?: boolean }>("/api/pets", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ petId })
  });
  if (!data.deleted) throw new Error("Не удалось удалить питомца.");
  return { detached: Boolean(data.detached) };
}
