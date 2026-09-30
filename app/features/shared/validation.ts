import { MAX_SOURCE_PHOTO_SIZE } from "../../../server/domain/pet-photo-limits.mjs";

export const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
export { MAX_SOURCE_PHOTO_SIZE };
export const containsLetter = /\p{L}/u;
