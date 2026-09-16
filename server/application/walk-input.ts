import {
  capitalizePlaceName,
  cleanComment,
  isScheduleType,
  isValidWalkTime,
  isWalkTimeInPast,
  normalizePlaceName,
  MAX_WALK_META_LENGTH,
  MAX_WALK_PLACE_LENGTH
} from "../domain/walk";

type MutationMode = "create" | "update";

type WalkMutationFields = {
  petId: string;
  place: string;
  normalizedPlace: string;
  comment: string;
  scheduleType: string;
  walkTime: string;
};

type CreateWalkMutationInput = WalkMutationFields;
type UpdateWalkMutationInput = WalkMutationFields & { walkId: string };

type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function stringValue(record: Record<string, unknown> | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" ? value.trim() : "";
}

export function parseWalkMutation(payload: unknown, mode: "create"): ParseResult<CreateWalkMutationInput>;
export function parseWalkMutation(payload: unknown, mode: "update"): ParseResult<UpdateWalkMutationInput>;
export function parseWalkMutation(payload: unknown, mode: MutationMode): ParseResult<WalkMutationFields | UpdateWalkMutationInput> {
  const record = isObject(payload) ? payload : null;
  const walkId = stringValue(record, "walkId");
  const petId = stringValue(record, "petId");
  const place = capitalizePlaceName(stringValue(record, "place"));
  const comment = cleanComment(stringValue(record, "comment"));
  const scheduleType = stringValue(record, "scheduleType");
  const walkTime = stringValue(record, "walkTime");

  if (mode === "update" && (!/^[0-9a-f-]{36}$/i.test(walkId) || !/^[0-9a-f-]{36}$/i.test(petId))) {
    return { ok: false, error: "Некорректные данные прогулки." };
  }
  if (mode === "create" && !/^[0-9a-f-]{36}$/i.test(petId)) {
    return { ok: false, error: "Выберите питомца." };
  }
  if (!place || place.length > MAX_WALK_PLACE_LENGTH) {
    return { ok: false, error: `Укажите место прогулки до ${MAX_WALK_PLACE_LENGTH} символов.` };
  }
  if (!/\p{L}/u.test(place)) {
    return { ok: false, error: "Название места прогулки должно содержать хотя бы одну букву." };
  }
  if (comment.length > MAX_WALK_META_LENGTH) {
    return { ok: false, error: `Комментарий должен содержать не более ${MAX_WALK_META_LENGTH} символов.` };
  }
  if (!isScheduleType(scheduleType)) {
    return { ok: false, error: "Выберите день прогулки." };
  }
  if (!isValidWalkTime(walkTime)) {
    return { ok: false, error: "Укажите корректное время прогулки." };
  }
  if (isWalkTimeInPast(scheduleType, walkTime)) {
    return { ok: false, error: "Для сегодняшней прогулки выберите будущее время." };
  }

  const value: WalkMutationFields = {
      petId,
      place,
      normalizedPlace: normalizePlaceName(place),
      comment,
      scheduleType,
      walkTime
  };
  return mode === "update"
    ? { ok: true, value: { ...value, walkId } }
    : { ok: true, value };
}
