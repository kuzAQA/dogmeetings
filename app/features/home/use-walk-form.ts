"use client";

import { useMemo, useRef, useState } from "react";
import type { ApiWalk, ScheduleType } from "../../../lib/walks";
import {
  containsLetter,
  MAX_WALK_COMMENT_LENGTH,
  MAX_WALK_PLACE_LENGTH,
  normalizePlaceForComparison,
  type Pet,
  type SharedPlace
} from "./model";
import { matchingPlaces } from "./selectors";

export type WalkSubmission = {
  petId: string;
  place: string;
  walkTime: string;
};

export function useWalkForm(savedPets: Pet[], sharedPlaces: SharedPlace[], placesLoaded: boolean) {
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const [submitError, setSubmitError] = useState("");
  const [placeInput, setPlaceInput] = useState("");
  const [placeMenuOpen, setPlaceMenuOpen] = useState(false);
  const [scheduleType, setScheduleType] = useState<ScheduleType>("today");
  const [selectedPetId, setSelectedPetId] = useState("");
  const [walkTime, setWalkTime] = useState("");
  const [walkTimePickerOpen, setWalkTimePickerOpen] = useState(false);
  const [walkComment, setWalkComment] = useState("");
  const [walkFormDirty, setWalkFormDirty] = useState(false);
  const dockFormRef = useRef<HTMLFormElement>(null);
  const { normalizedValue, places: matchingSharedPlaces } = useMemo(
    () => matchingPlaces(sharedPlaces, placeInput),
    [placeInput, sharedPlaces]
  );
  const placeSuggestionsVisible = placeMenuOpen && (!normalizedValue || (placesLoaded && matchingSharedPlaces.length > 0));
  const placeIsValid = containsLetter.test(placeInput.trim()) && placeInput.trim().length <= MAX_WALK_PLACE_LENGTH;
  const timeIsValid = /^([01]\d|2[0-3]):[0-5]\d$/.test(walkTime);
  const formIsValid = Boolean(selectedPetId && placeIsValid && timeIsValid);

  function touchField(field: string) {
    setTouchedFields((current) => current[field] ? current : { ...current, [field]: true });
  }

  function markDirty(inDock: boolean) {
    if (inDock) setWalkFormDirty(true);
  }

  function changeScheduleType(value: ScheduleType, inDock = false) {
    if (value === scheduleType) return;
    markDirty(inDock);
    setScheduleType(value);
    setWalkTime("");
    setSubmitError("");
    setTouchedFields((current) => current["walk-time"] ? { ...current, "walk-time": false } : current);
  }

  function selectPet(petId: string, inDock = false) {
    markDirty(inDock);
    setSelectedPetId(petId);
    setSubmitError("");
  }

  function updatePlaceInput(value: string, inDock = false) {
    markDirty(inDock);
    const normalizedInput = normalizePlaceForComparison(value);
    const existingPlace = sharedPlaces.find((place) => normalizePlaceForComparison(place.name) === normalizedInput);
    const hasMatches = !normalizedInput || sharedPlaces.some((place) => normalizePlaceForComparison(place.name).includes(normalizedInput));
    setPlaceInput(existingPlace?.name ?? value);
    setSubmitError("");
    setPlaceMenuOpen(hasMatches);
  }

  function chooseSharedPlace(place: SharedPlace, inDock = false) {
    markDirty(inDock);
    setPlaceInput(place.name);
    setPlaceMenuOpen(false);
  }

  function changeWalkTime(value: string, inDock = false) {
    markDirty(inDock);
    setWalkTime(value);
    setSubmitError("");
  }

  function changeWalkComment(value: string, inDock = false) {
    markDirty(inDock);
    setWalkComment(value);
  }

  function prepareNewWalk() {
    setTouchedFields({});
    setSubmitError("");
    setSelectedPetId(savedPets.length === 1 ? savedPets[0].id : "");
    setPlaceInput("");
    setPlaceMenuOpen(false);
    setScheduleType("today");
    setWalkTime("");
    setWalkComment("");
    setWalkFormDirty(false);
  }

  function prepareWalkEdit(walk: ApiWalk) {
    setTouchedFields({});
    setSubmitError("");
    setSelectedPetId(walk.petId);
    setPlaceInput(walk.point);
    setPlaceMenuOpen(false);
    setScheduleType(walk.scheduleType);
    setWalkTime(walk.walkTime.slice(0, 5));
    setWalkComment(walk.comment?.slice(0, MAX_WALK_COMMENT_LENGTH) ?? "");
    setWalkFormDirty(false);
  }

  function resetWalkForm() {
    setTouchedFields({});
    setSubmitError("");
    setPlaceInput("");
    setPlaceMenuOpen(false);
    setScheduleType("today");
    setWalkTime("");
    setWalkComment("");
    setWalkFormDirty(false);
  }

  function readSubmission(formData: FormData): WalkSubmission | null {
    const petId = formData.get("pet");
    const place = String(formData.get("place") ?? "").trim();
    const submittedWalkTime = formData.get("walkTime");
    if (typeof petId !== "string" || !petId) {
      touchField("walk-pet");
      setSubmitError("");
      return null;
    }
    if (!containsLetter.test(place) || place.length > MAX_WALK_PLACE_LENGTH) {
      touchField("walk-place");
      setSubmitError("");
      return null;
    }
    if (typeof submittedWalkTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(submittedWalkTime)) {
      touchField("walk-time");
      setSubmitError("");
      return null;
    }
    return { petId, place, walkTime: submittedWalkTime };
  }

  return {
    dockFormRef,
    touchedFields,
    submitError,
    placeInput,
    placeMenuOpen,
    scheduleType,
    selectedPetId,
    walkTime,
    walkTimePickerOpen,
    walkComment,
    walkFormDirty,
    matchingSharedPlaces,
    placeSuggestionsVisible,
    placeIsValid,
    timeIsValid,
    formIsValid,
    touchField,
    setSubmitError,
    setPlaceMenuOpen,
    setWalkTimePickerOpen,
    changeScheduleType,
    selectPet,
    updatePlaceInput,
    chooseSharedPlace,
    changeWalkTime,
    changeWalkComment,
    prepareNewWalk,
    prepareWalkEdit,
    resetWalkForm,
    readSubmission
  };
}

export type WalkFormState = ReturnType<typeof useWalkForm>;
