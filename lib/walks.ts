export type Period = "Все" | "Утро" | "День" | "Вечер";
export type ScheduleType = "today" | "tomorrow" | "always";

export type Walk = {
  id: string;
  petId: string;
  pet: string;
  breed: string;
  owner: string;
  time: string;
  point: string;
  comment: string;
  period: Exclude<Period, "Все">;
  image: string;
};

export type ApiWalk = {
  id: string;
  petId: string;
  pet: string;
  breed: string;
  owner: string;
  city: string;
  district: string;
  complex: string;
  placeId: string;
  point: string;
  comment: string | null;
  walkDate: string;
  walkTime: string;
  scheduleType: ScheduleType;
  updatedAt: string;
  image: string;
};

export function apiWalkToCard(walk: ApiWalk): Walk {
  const [hours = "0", minutes = "00"] = walk.walkTime.split(":");
  const hour = Number(hours);
  const period: Exclude<Period, "Все"> = hour < 12 ? "Утро" : hour < 18 ? "День" : "Вечер";

  return {
    id: walk.id,
    petId: walk.petId,
    pet: walk.pet,
    breed: walk.breed,
    owner: walk.owner,
    point: walk.point,
    comment: walk.comment?.trim() ?? "",
    period,
    image: walk.image,
    time: `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`
  };
}

export function formatWalkDate(walk: ApiWalk) {
  if (walk.scheduleType === "always") return "Всегда";
  const [year = "", month = "", day = ""] = walk.walkDate.split("-");
  return `${day}.${month}.${year}`;
}

export function formatResidentialComplex(value: string) {
  const complex = value.trim().replace(/^жилой комплекс\s+/iu, "");
  return /^дзен[\s-]+кварталы$/iu.test(complex) ? "Дзен-Кварталы" : complex;
}
