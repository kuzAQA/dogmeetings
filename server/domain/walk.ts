export const MAX_WALK_META_LENGTH = 40;
export const MAX_WALK_PLACE_LENGTH = MAX_WALK_META_LENGTH;

const scheduleTypes = new Set(["today", "tomorrow", "always"]);

export function isScheduleType(value: string) {
  return scheduleTypes.has(value);
}

export function isValidWalkTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function moscowDate(offsetDays = 0) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000));
}

export function cleanPlaceName(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function capitalizePlaceName(value: string) {
  return cleanPlaceName(value).replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase("ru-RU"));
}

export function normalizePlaceName(value: string) {
  return cleanPlaceName(value).toLocaleLowerCase("ru-RU");
}

export function cleanComment(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}
