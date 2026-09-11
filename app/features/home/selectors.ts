import type { ApiWalk, Period, Walk } from "../../../lib/walks";
import { normalizePlaceForComparison, uniqueLocationValues, type AvailableLocation, type Location, type Pet, type SharedPlace } from "./model";

export type SelectOption = { value: string; label: string };

export function filterWalksByPeriod(walks: Walk[], period: Period) {
  return period === "Все" ? walks : walks.filter((walk) => walk.period === period);
}

export function walksById(walks: ApiWalk[]) {
  return new Map(walks.map((walk) => [walk.id, walk]));
}

export function petsById(pets: Pet[]) {
  return new Map(pets.map((pet) => [pet.id, pet]));
}

export function locationOptions(rows: AvailableLocation[], location: Location) {
  const cities = uniqueLocationValues(rows.map((row) => row.city));
  const districts = uniqueLocationValues(rows.filter((row) => row.city === location.city).map((row) => row.district));
  const complexes = uniqueLocationValues(rows
    .filter((row) => row.city === location.city && row.district === location.district)
    .map((row) => row.complex));
  const toOptions = (values: string[]): SelectOption[] => values.map((value) => ({ value, label: value }));

  return { cities: toOptions(cities), districts: toOptions(districts), complexes: toOptions(complexes) };
}

export function matchingPlaces(places: SharedPlace[], value: string) {
  const normalizedValue = normalizePlaceForComparison(value);
  return {
    normalizedValue,
    places: places.filter((place) => !normalizedValue || normalizePlaceForComparison(place.name).includes(normalizedValue))
  };
}
