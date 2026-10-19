import type { AnnouncementExclusions, AnnouncementLocation } from "./announcement-types";

export const ANNOUNCEMENT_DAY_MS = 86_400_000;
// Stay within the four-digit ISO years supported by all existing date consumers.
export const ANNOUNCEMENT_MAX_END = "9999-12-31T23:59:59.999Z";
const MAX_EXTENSION_DAYS = 3_652_058;

export function maxExtensionDays(endsAt: string) {
  return Math.max(0, Math.floor((Date.parse(ANNOUNCEMENT_MAX_END) - Date.parse(endsAt)) / ANNOUNCEMENT_DAY_MS));
}

export function validExtensionDays(value: unknown, endsAt?: string): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    && value <= (endsAt ? maxExtensionDays(endsAt) : MAX_EXTENSION_DAYS);
}

export function allowsAnnouncement(exclusions: AnnouncementExclusions, location: AnnouncementLocation | null) {
  if (!location) return true;
  return !(location.city && exclusions.cities.includes(location.city))
    && !exclusions.districts.some((item) => location.city && location.district && item.city === location.city && item.district === location.district)
    && !exclusions.complexes.some((item) => location.city && location.district && location.complex
      && item.city === location.city && item.district === location.district && item.complex === location.complex);
}

export function parseAnnouncementExclusions(value: unknown): AnnouncementExclusions | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { cities, districts, complexes } = value as Record<string, unknown>;
  const name = (item: unknown, length: number) => typeof item === "string" && item.trim().length > 0 && item.length <= length;
  const district = (item: unknown): item is { city: string; district: string } => {
    if (!item || typeof item !== "object") return false;
    const row = item as Record<string, unknown>;
    return name(row.city, 80) && name(row.district, 80);
  };
  if (!Array.isArray(cities) || !cities.every((item) => name(item, 80))
    || !Array.isArray(districts) || !districts.every(district)
    || !Array.isArray(complexes) || !complexes.every((item) => district(item) && name((item as Record<string, unknown>).complex, 120))) return null;
  return {
    cities: [...new Set(cities as string[])],
    districts: districts.map(({ city, district }) => ({ city, district })),
    complexes: complexes.map(({ city, district, complex }) => ({ city, district, complex }))
  };
}

export function parseAnnouncementSchedule(value: Record<string, unknown>) {
  if (typeof value.permanent !== "boolean") return null;
  const parseDate = (date: unknown) => {
    if (date === null) return null;
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(date)) return undefined;
    const calendar = new Date(`${date.slice(0, 19)}Z`);
    if (!Number.isFinite(+calendar) || calendar.toISOString().slice(0, 19) !== date.slice(0, 19)) return undefined;
    const time = Date.parse(date);
    return Number.isFinite(time) && time >= Date.parse("0001-01-01T00:00:00Z") && time <= Date.parse(ANNOUNCEMENT_MAX_END)
      ? new Date(time).toISOString() : undefined;
  };
  const startsAt = parseDate(value.startsAt);
  const endsAt = parseDate(value.endsAt);
  if (startsAt === undefined || endsAt === undefined || (startsAt && endsAt && endsAt <= startsAt)) return null;
  return { permanent: value.permanent, startsAt, endsAt };
}

export function announcementDateInput(value: string | null) {
  return value ? new Date(Date.parse(value) + 3 * 3_600_000).toISOString().slice(0, 19) : "";
}

export function announcementDateValue(value: string) {
  return value ? `${value.length === 16 ? value + ":00" : value}+03:00` : null;
}
