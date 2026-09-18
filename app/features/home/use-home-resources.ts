import { useCallback, useEffect, useState } from "react";
import { listMyWalks, listPets, listPlaces, listWalks } from "./api";
import type { Location, Pet, SharedPlace } from "./model";
import type { ApiWalk, Walk } from "../../../lib/walks";
import { apiWalkToCard, isWalkScheduledForToday } from "../../../lib/walks";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function preloadImages(sources: string[]) {
  for (const source of sources) {
    const image = new Image();
    image.src = source;
    void image.decode().catch(() => undefined);
  }
}

export function useHomeResources(
  sessionReady: boolean,
  { city, district, complex }: Location
) {
  const [savedPets, setSavedPets] = useState<Pet[]>([]);
  const [petsLoaded, setPetsLoaded] = useState(false);
  const [petsError, setPetsError] = useState("");
  const [sharedPlaces, setSharedPlaces] = useState<SharedPlace[]>([]);
  const [placesLoaded, setPlacesLoaded] = useState(false);
  const [placesError, setPlacesError] = useState("");
  const [savedWalks, setSavedWalks] = useState<Walk[]>([]);
  const [walksLoaded, setWalksLoaded] = useState(false);
  const [walksError, setWalksError] = useState("");
  const [myWalks, setMyWalks] = useState<ApiWalk[]>([]);
  const [myWalksLoaded, setMyWalksLoaded] = useState(false);
  const [myWalksError, setMyWalksError] = useState("");

  const reloadPets = useCallback(async () => {
    setPetsLoaded(false);
    setPetsError("");
    try {
      const pets = await listPets();
      preloadImages(pets.map((pet) => pet.photoUrl));
      setSavedPets(pets);
    } catch (error) {
      setPetsError(errorMessage(error, "Не удалось загрузить питомцев."));
      throw error;
    } finally {
      setPetsLoaded(true);
    }
  }, []);

  const retryWalks = useCallback(async () => {
    if (!city || !district || !complex) return;
    setWalksLoaded(false);
    setWalksError("");
    try {
      const walks = await listWalks({ city, district, complex });
      const todayWalks = walks.filter(isWalkScheduledForToday);
      preloadImages(todayWalks.map((walk) => walk.image));
      setSavedWalks(todayWalks.map(apiWalkToCard));
    } catch (error) {
      setWalksError(errorMessage(error, "Не удалось загрузить прогулки."));
    } finally {
      setWalksLoaded(true);
    }
  }, [city, complex, district]);

  const retryPlaces = useCallback(async () => {
    if (!city || !district || !complex) return;
    setPlacesLoaded(false);
    setPlacesError("");
    try {
      setSharedPlaces(await listPlaces({ city, district, complex }));
    } catch (error) {
      setPlacesError(errorMessage(error, "Не удалось загрузить места."));
    } finally {
      setPlacesLoaded(true);
    }
  }, [city, complex, district]);

  const retryMyWalks = useCallback(async () => {
    setMyWalksLoaded(false);
    setMyWalksError("");
    try {
      const walks = await listMyWalks();
      preloadImages(walks.map((walk) => walk.image));
      setMyWalks(walks);
    } catch (error) {
      setMyWalksError(errorMessage(error, "Не удалось загрузить прогулки."));
    } finally {
      setMyWalksLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    let active = true;
    listPets()
      .then((pets) => {
        if (!active) return;
        preloadImages(pets.map((pet) => pet.photoUrl));
        setSavedPets(pets);
      })
      .catch((error) => { if (active) setPetsError(errorMessage(error, "Не удалось загрузить питомцев.")); })
      .finally(() => { if (active) setPetsLoaded(true); });
    return () => { active = false; };
  }, [sessionReady]);

  useEffect(() => {
    if (!sessionReady) return;
    let active = true;
    listMyWalks()
      .then((walks) => {
        if (!active) return;
        preloadImages(walks.map((walk) => walk.image));
        setMyWalks(walks);
      })
      .catch((error) => { if (active) setMyWalksError(errorMessage(error, "Не удалось загрузить прогулки.")); })
      .finally(() => { if (active) setMyWalksLoaded(true); });
    return () => { active = false; };
  }, [sessionReady]);

  useEffect(() => {
    if (!sessionReady || !city || !district || !complex) return;
    let active = true;
    listWalks({ city, district, complex })
      .then((walks) => {
        if (!active) return;
        const todayWalks = walks.filter(isWalkScheduledForToday);
        preloadImages(todayWalks.map((walk) => walk.image));
        setSavedWalks(todayWalks.map(apiWalkToCard));
      })
      .catch((error) => { if (active) setWalksError(errorMessage(error, "Не удалось загрузить прогулки.")); })
      .finally(() => { if (active) setWalksLoaded(true); });
    return () => { active = false; };
  }, [city, complex, district, sessionReady]);

  useEffect(() => {
    if (!sessionReady || !city || !district || !complex) return;
    let active = true;
    listPlaces({ city, district, complex })
      .then((places) => { if (active) setSharedPlaces(places); })
      .catch((error) => { if (active) setPlacesError(errorMessage(error, "Не удалось загрузить места.")); })
      .finally(() => { if (active) setPlacesLoaded(true); });
    return () => { active = false; };
  }, [city, complex, district, sessionReady]);

  return {
    savedPets,
    setSavedPets,
    petsLoaded,
    petsError,
    sharedPlaces,
    setSharedPlaces,
    placesLoaded,
    placesError,
    setPlacesLoaded,
    savedWalks,
    setSavedWalks,
    walksLoaded,
    walksError,
    setWalksLoaded,
    myWalks,
    setMyWalks,
    myWalksLoaded,
    myWalksError,
    reloadPets,
    retryWalks,
    retryPlaces,
    retryMyWalks
  };
}
