import {
  allowedPhotoTypes,
  containsLetter,
  MAX_BREED_LENGTH,
  MAX_PHOTO_SIZE,
  normalizeName,
  uuidPattern
} from "../domain/pet";

type MutationMode = "create" | "update";

type PetFields = {
  name: string;
  breed: string;
  ownerName: string;
  photo: File | null;
};

type CreatePetInput = PetFields;
type UpdatePetInput = PetFields & { petId: string };

type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function photoError(photo: File | null) {
  if (!photo) return "";
  if (!allowedPhotoTypes.has(photo.type)) return "Поддерживаются фотографии JPEG, PNG и WebP.";
  if (photo.size > MAX_PHOTO_SIZE) return "Фотография после сжатия должна быть меньше 1 МБ.";
  return "";
}

export function parsePetMutation(formData: FormData, mode: "create"): ParseResult<CreatePetInput>;
export function parsePetMutation(formData: FormData, mode: "update"): ParseResult<UpdatePetInput>;
export function parsePetMutation(formData: FormData, mode: MutationMode): ParseResult<PetFields | UpdatePetInput> {
  const petId = String(formData.get("petId") ?? "").trim();
  const name = normalizeName(formData.get("petName"));
  const breed = String(formData.get("breed") ?? "").trim();
  const ownerName = normalizeName(formData.get("ownerName"));
  const uploadedPhoto = formData.get("photo");
  const photo = uploadedPhoto instanceof File && uploadedPhoto.size > 0 ? uploadedPhoto : null;

  if (mode === "update" && !uuidPattern.test(petId)) {
    return { ok: false, error: "Некорректные данные питомца." };
  }
  if (!name || name.length > 40) {
    return { ok: false, error: mode === "create" ? "Укажите имя питомца до 40 символов." : "Укажите корректное имя питомца до 40 символов." };
  }
  if (!containsLetter.test(name)) {
    return { ok: false, error: mode === "create" ? "Имя питомца должно содержать хотя бы одну букву." : "Укажите корректное имя питомца до 40 символов." };
  }
  if (!breed || breed.length > MAX_BREED_LENGTH) {
    return { ok: false, error: mode === "create" ? `Укажите породу до ${MAX_BREED_LENGTH} символов.` : `Укажите корректную породу до ${MAX_BREED_LENGTH} символов.` };
  }
  if (!containsLetter.test(breed)) {
    return { ok: false, error: mode === "create" ? "Порода должна содержать хотя бы одну букву." : `Укажите корректную породу до ${MAX_BREED_LENGTH} символов.` };
  }
  if (!ownerName || ownerName.length > 60) {
    return { ok: false, error: mode === "create" ? "Укажите имя хозяина до 60 символов." : "Укажите корректное имя хозяина до 60 символов." };
  }
  if (!containsLetter.test(ownerName)) {
    return { ok: false, error: mode === "create" ? "Имя хозяина должно содержать хотя бы одну букву." : "Укажите корректное имя хозяина до 60 символов." };
  }

  const invalidPhoto = photoError(photo);
  if (invalidPhoto) return { ok: false, error: invalidPhoto };

  const value: PetFields = { name, breed, ownerName, photo };
  return mode === "update"
    ? { ok: true, value: { ...value, petId } }
    : { ok: true, value };
}
