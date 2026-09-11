import { useCallback, useEffect, useState } from "react";
import { listMyWalks, listPets, listPlaces, listWalks } from "./api";
import type { Location, Pet, SharedPlace } from "./model";
import type { ApiWalk, Walk } from "../../../lib/walks";
import { apiWalkToCard } from "../../../lib/walks";

export function useHomeResources(
  sessionReady: boolean,
  { city, district, complex }: Location
) {
  const [savedPets, setSavedPets] = useState<Pet[]>([]);
  const [petsLoaded, setPetsLoaded] = useState(false);
  const [sharedPlaces, setSharedPlaces] = useState<SharedPlace[]>([]);
  const [placesLoaded, setPlacesLoaded] = useState(false);
  const [savedWalks, setSavedWalks] = useState<Walk[]>([]);
  const [walksLoaded, setWalksLoaded] = useState(false);
  const [myWalks, setMyWalks] = useState<ApiWalk[]>([]);
  const [myWalksLoaded, setMyWalksLoaded] = useState(false);

  const reloadPets = useCallback(async () => {
    setSavedPets(await listPets());
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    let active = true;
    listPets()
      .then((pets) => { if (active) setSavedPets(pets); })
      .catch(() => undefined)
      .finally(() => { if (active) setPetsLoaded(true); });
    return () => { active = false; };
  }, [sessionReady]);

  useEffect(() => {
    if (!sessionReady) return;
    let active = true;
    listMyWalks()
      .then((walks) => { if (active) setMyWalks(walks); })
      .catch(() => undefined)
      .finally(() => { if (active) setMyWalksLoaded(true); });
    return () => { active = false; };
  }, [sessionReady]);

  useEffect(() => {
    if (!sessionReady || !city || !district || !complex) return;
    let active = true;
    listWalks({ city, district, complex })
      .then((walks) => { if (active) setSavedWalks(walks.map(apiWalkToCard)); })
      .catch(() => undefined)
      .finally(() => { if (active) setWalksLoaded(true); });
    return () => { active = false; };
  }, [city, complex, district, sessionReady]);

  useEffect(() => {
    if (!sessionReady || !city || !district || !complex) return;
    let active = true;
    listPlaces({ city, district, complex })
      .then((places) => { if (active) setSharedPlaces(places); })
      .catch(() => undefined)
      .finally(() => { if (active) setPlacesLoaded(true); });
    return () => { active = false; };
  }, [city, complex, district, sessionReady]);

  return {
    savedPets,
    setSavedPets,
    petsLoaded,
    sharedPlaces,
    setSharedPlaces,
    placesLoaded,
    setPlacesLoaded,
    savedWalks,
    setSavedWalks,
    walksLoaded,
    setWalksLoaded,
    myWalks,
    setMyWalks,
    myWalksLoaded,
    reloadPets
  };
}
