export const MAX_PHOTO_SIZE = 1024 * 1024;
export const MAX_BREED_LENGTH = 20;
export const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const containsLetter = /\p{L}/u;

export function normalizeName(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");

  return normalized.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase("ru-RU"));
}

export function canEditPet(ownerClientId: string, sessionClientId: string, isCollaborator: boolean) {
  return ownerClientId === sessionClientId || isCollaborator;
}
