export const MAX_BREED_LENGTH = 20;
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

export function petPhotoUrl(id: string, updatedAt: Date, photoType: string | null) {
  // Bypass responses previously stored with a year-long immutable policy.
  return photoType
    ? `/api/pet-photo?id=${encodeURIComponent(id)}&v=${updatedAt.getTime()}&cache=2`
    : "/dog-placeholder.webp";
}
