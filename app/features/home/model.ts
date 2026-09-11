import type { ScheduleType } from "../../../lib/walks";
import { allowedPhotoTypes, containsLetter, MAX_SOURCE_PHOTO_SIZE } from "../shared/validation";

export type Location = {
  city: string;
  district: string;
  complex: string;
};

export type Pet = {
  id: string;
  name: string;
  breed: string;
  ownerName: string;
  photoUrl: string;
  createdAt: string;
  updatedAt: string;
  isOwner: boolean;
  isShared: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canShare: boolean;
};

export type SharedPlace = {
  id: string;
  name: string;
};

export type AvailableLocation = Location;

export type SessionBootstrapData = {
  hasLocation: boolean;
  location: Location | null;
};

export type LegacySessionData = {
  legacyClientId?: string;
  legacyLocation?: Location | null;
  legacyHasLocation?: boolean;
};

export type WalkMutation = {
  walkId?: string;
  petId: string;
  place: string;
  comment: string;
  scheduleType: ScheduleType;
  walkTime: string;
  city?: string;
  district?: string;
  complex?: string;
};

export const STORAGE_KEY = "dogwalk.location.v1";
export const HAS_LOCATION_KEY = "dogwalk.hasLocation.v1";
export const CLIENT_ID_KEY = "dogwalk.clientId.v1";
export const MAX_WALK_META_LENGTH = 40;
export const MAX_WALK_COMMENT_LENGTH = MAX_WALK_META_LENGTH;
export const MAX_BREED_LENGTH = 20;
export const MAX_WALK_PLACE_LENGTH = MAX_WALK_META_LENGTH;
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export { allowedPhotoTypes, containsLetter, MAX_SOURCE_PHOTO_SIZE };

export const defaultLocation: Location = {
  city: "",
  district: "",
  complex: ""
};

export function normalizePlaceForComparison(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");
}

export function uniqueLocationValues(values: string[]) {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right, "ru"));
}

export function normalizeLocationSelection(current: Location, rows: AvailableLocation[]): Location {
  const cities = uniqueLocationValues(rows.map((row) => row.city));
  const city = cities.includes(current.city) ? current.city : cities.length === 1 ? cities[0] : "";
  const districts = uniqueLocationValues(rows.filter((row) => row.city === city).map((row) => row.district));
  const district = districts.includes(current.district) ? current.district : districts.length === 1 ? districts[0] : "";
  const complexes = uniqueLocationValues(rows
    .filter((row) => row.city === city && row.district === district)
    .map((row) => row.complex));
  const complex = complexes.includes(current.complex) ? current.complex : complexes.length === 1 ? complexes[0] : "";
  return { city, district, complex };
}
