"use client";

import Image from "next/image";
import { DogmeetState } from "./components/ui/DogmeetState";
import { ChangeEvent, FormEvent, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createLocationRequest,
  deletePet as deletePetRequest,
  deleteWalk as deleteWalkRequest,
  listLocations,
  listWalks,
  requestPetShareLink as requestPetShareLinkRequest,
  savePet as savePetRequest,
  saveSessionLocation,
  saveWalk as saveWalkRequest
} from "./features/home/api";
import {
  allowedPhotoTypes,
  containsLetter,
  defaultLocation,
  MAX_BREED_LENGTH,
  MAX_SOURCE_PHOTO_SIZE,
  normalizeLocationSelection,
  uniqueLocationValues,
  type AvailableLocation,
  type Location,
  type Pet,
} from "./features/home/model";
import { useHomeResources } from "./features/home/use-home-resources";
import { BottomDock } from "./features/home/BottomDock";
import {
  createNavigationState,
  type AppNavigationState,
  type DockPanelSection,
  type PrimaryDockSection,
  type Screen,
  useHomeNavigation
} from "./features/home/use-home-navigation";
import { useHomeSession } from "./features/home/use-home-session";
import { filterWalksByPeriod, locationOptions, walksById } from "./features/home/selectors";
import { useWalkForm } from "./features/home/use-walk-form";
import { compressPetPhoto } from "../lib/pet-photo";
import { WalkAnnouncementForm } from "./features/home/components/WalkAnnouncementForm";
import { PetCollection, WalkCollection } from "./features/home/components/Collections";
import { HomeDialogs } from "./features/home/components/HomeDialogs";
import { LocationEditor, LocationRequestForm } from "./features/home/components/LocationFlow";
import { PetForm } from "./features/home/components/PetForm";
import { WalksWorkspace } from "./features/home/components/WalksWorkspace";
import { apiWalkToCard, isWalkScheduledForToday, type ApiWalk, type Period, type Walk } from "../lib/walks";
import { BrowserGuide, detectBrowserGuidePlatform, isInAppBrowser, type BrowserGuidePlatform } from "./components/ui/BrowserGuide";
import { DogmeetBrand, DogmeetDialog, DogmeetFrame, DogmeetHeader, requestDialogClose } from "./components/ui/DogmeetFrame";
import { animateHeaderExit } from "./components/ui/motion.mjs";

type PetReturnTarget = "my-pets" | "announce";
type WalkEditReturnTarget = "walks" | "my-walks";
type FormScreen = "pet" | "announce";

export default function Home() {
  const [selectedWalk, setSelectedWalk] = useState<Walk | null>(null);
  const [result, setResultState] = useState<{ title: string; message: string; action?: string; sheet?: string; receipt?: { title: string; place: string; pet: string }; onContinue: () => void } | null>(null);
  function setResult(next: typeof result) {
    if (next) animateHeaderExit();
    setResultState(next);
  }
  const [browserGuidePlatform, setBrowserGuidePlatform] = useState<BrowserGuidePlatform>("ios");
  const [location, setLocation] = useState<Location>(defaultLocation);
  const [locationDraft, setLocationDraft] = useState<Location>(defaultLocation);
  const [availableLocations, setAvailableLocations] = useState<AvailableLocation[]>([]);
  const [locationsLoaded, setLocationsLoaded] = useState(false);
  const [locationsError, setLocationsError] = useState("");
  const [hasLocation, setHasLocation] = useState(false);
  const [locationSaving, setLocationSaving] = useState(false);
  const [locationSubmitError, setLocationSubmitError] = useState("");
  const [locationRequestDraft, setLocationRequestDraft] = useState<Location>(defaultLocation);
  const [locationRequestSaving, setLocationRequestSaving] = useState(false);
  const [locationRequestError, setLocationRequestError] = useState("");
  const [locationRequestSent, setLocationRequestSent] = useState(false);
  const [period, setPeriod] = useState<Period>("Все");
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [petSubmitError, setPetSubmitError] = useState("");
  const [petSaving, setPetSaving] = useState(false);
  const [petNameInput, setPetNameInput] = useState("");
  const [ownerNameInput, setOwnerNameInput] = useState("");
  const [breedInput, setBreedInput] = useState("");
  const [petBeingEdited, setPetBeingEdited] = useState<Pet | null>(null);
  const [petScreenMode, setPetScreenMode] = useState<"view" | "edit">("edit");
  const [petReturnTarget, setPetReturnTarget] = useState<PetReturnTarget>("my-pets");
  const [guidedWalkFlow, setGuidedWalkFlow] = useState(false);
  const [showPetRequiredPopup, setShowPetRequiredPopup] = useState(false);
  const [walkSaving, setWalkSaving] = useState(false);
  const [walkBeingEdited, setWalkBeingEdited] = useState<ApiWalk | null>(null);
  const [walkEditReturnTarget, setWalkEditReturnTarget] = useState<WalkEditReturnTarget>("my-walks");
  const [walkPendingDelete, setWalkPendingDelete] = useState<ApiWalk | null>(null);
  const [walkDeleting, setWalkDeleting] = useState(false);
  const [walkDeleteError, setWalkDeleteError] = useState("");
  const [openWalkActionsId, setOpenWalkActionsId] = useState<string | null>(null);
  const [petPendingDelete, setPetPendingDelete] = useState<Pet | null>(null);
  const [petDeleting, setPetDeleting] = useState(false);
  const [petDeleteError, setPetDeleteError] = useState("");
  const [petToShare, setPetToShare] = useState<Pet | null>(null);
  const [petShareLink, setPetShareLink] = useState("");
  const [petShareLoading, setPetShareLoading] = useState(false);
  const [petShareRefreshing, setPetShareRefreshing] = useState(false);
  const [petShareError, setPetShareError] = useState("");
  const [petShareCopied, setPetShareCopied] = useState(false);
  const [highlightedPetId, setHighlightedPetId] = useState("");
  const [pendingSharedPetHighlightId, setPendingSharedPetHighlightId] = useState("");
  const [showSharedPetAlreadyAddedPopup, setShowSharedPetAlreadyAddedPopup] = useState(false);
  const {
    screen,
    menuOpen,
    locationOpenedFromMenu,
    dockWalkOpen,
    dockReturnSection,
    petsSource,
    dockSection,
    initializeNavigation,
    pushNavigation,
    replaceNavigation,
    returnThroughHistory
  } = useHomeNavigation(hasLocation);
  const initializeSession = useCallback((data: { hasLocation: boolean; location: Location | null }, sharedPetNavigation: { sharedPetId: string; sharedPetAlreadyAddedId: string }) => {
    const restoredLocation = data.hasLocation && data.location ? data.location : defaultLocation;
    const initialScreen: Screen = sharedPetNavigation.sharedPetId || sharedPetNavigation.sharedPetAlreadyAddedId
      ? "my-pets"
      : data.hasLocation && data.location ? "walks" : "welcome";
    const initialNavigation = createNavigationState(initialScreen);

    setHighlightedPetId("");
    setPendingSharedPetHighlightId(sharedPetNavigation.sharedPetId);
    setShowSharedPetAlreadyAddedPopup(Boolean(sharedPetNavigation.sharedPetAlreadyAddedId));
    setLocation(restoredLocation);
    setLocationDraft((current) => data.hasLocation && data.location ? restoredLocation : current);
    setHasLocation(Boolean(data.hasLocation && data.location));

    if (sharedPetNavigation.sharedPetId || sharedPetNavigation.sharedPetAlreadyAddedId) {
      initializeNavigation(initialNavigation, createNavigationState(data.hasLocation && data.location ? "walks" : "welcome"));
      return;
    }
    initializeNavigation(initialNavigation);
  }, [initializeNavigation]);
  const { sessionReady, sessionError, retrySession } = useHomeSession(initializeSession);
  const {
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
  } = useHomeResources(sessionReady, location);
  const walkForm = useWalkForm(savedPets, sharedPlaces, placesLoaded);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
  const informationButtonRef = useRef<HTMLButtonElement>(null);
  const locationRequestButtonRef = useRef<HTMLButtonElement>(null);
  const shareDoneButtonRef = useRef<HTMLButtonElement>(null);
  const profileHeadingRef = useRef<HTMLHeadingElement>(null);
  const pendingWalkRefreshRef = useRef<{ deletedId: string; request: Promise<ApiWalk[]> } | null>(null);
  const closingDeletedWalkResultRef = useRef(false);

  function touchField(field: string) {
    setTouchedFields((current) => current[field] ? current : { ...current, [field]: true });
  }

  function openBrowserGuide() {
    if (!isInAppBrowser(navigator.userAgent)) {
      pushNavigation(hasLocation ? "walks" : "location");
      return;
    }
    setBrowserGuidePlatform(detectBrowserGuidePlatform(navigator.userAgent, navigator.platform, navigator.maxTouchPoints));
    pushNavigation("browser-guide");
  }

  function continueFromBrowserGuide() {
    pushNavigation(hasLocation ? "walks" : "location");
  }

  useEffect(() => {
    let active = true;

    listLocations()
      .then((locations) => {
        if (!active) return;
        setAvailableLocations(locations);
        setLocation((current) => normalizeLocationSelection(current, locations));
        setLocationDraft((current) => normalizeLocationSelection(current, locations));
      })
      .catch((error) => {
        if (active) setLocationsError(error instanceof Error ? error.message : "Не удалось загрузить список локаций.");
      })
      .finally(() => { if (active) setLocationsLoaded(true); });

    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!pendingSharedPetHighlightId || !petsLoaded) return;

    const highlightTimer = window.setTimeout(() => {
      if (savedPets.some((pet) => pet.id === pendingSharedPetHighlightId)) {
        setHighlightedPetId(pendingSharedPetHighlightId);
      }
      setPendingSharedPetHighlightId("");
    }, 0);

    return () => window.clearTimeout(highlightTimer);
  }, [pendingSharedPetHighlightId, petsLoaded, savedPets]);

  useEffect(() => {
    if (!walkPendingDelete && !petPendingDelete && !(screen === "walks" && menuOpen)) return;
    if (walkPendingDelete || petPendingDelete) deleteCancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || walkPendingDelete || petPendingDelete) return;
      if (screen === "walks" && menuOpen) {
        replaceNavigation("walks", { menuOpen: false, dockWalkOpen: false, dockReturnSection: "nearby" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen, petPendingDelete, replaceNavigation, screen, walkPendingDelete]);

  useEffect(() => {
    if (screen === "walks" && menuOpen) profileHeadingRef.current?.focus();
  }, [menuOpen, screen]);

  useEffect(() => {
    if (showPetRequiredPopup) informationButtonRef.current?.focus();
  }, [showPetRequiredPopup]);

  useEffect(() => {
    if (locationRequestSent) locationRequestButtonRef.current?.focus();
  }, [locationRequestSent]);

  useEffect(() => {
    if (petToShare && !petShareLoading) shareDoneButtonRef.current?.focus();
  }, [petShareLoading, petToShare]);

  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [screen]);

  const visibleWalks = useMemo(() => filterWalksByPeriod(savedWalks, period), [period, savedWalks]);
  const ownedWalksById = useMemo(() => walksById(myWalks), [myWalks]);
  const { cities: locationCityOptions, districts: locationDistrictOptions, complexes: locationComplexOptions } = useMemo(
    () => locationOptions(availableLocations, locationDraft),
    [availableLocations, locationDraft]
  );
  const locationFormIsValid = Boolean(
    locationsLoaded && !locationsError && locationDraft.city && locationDraft.district && locationDraft.complex
  );
  const locationRequestCityIsValid = containsLetter.test(locationRequestDraft.city.trim()) && locationRequestDraft.city.trim().length <= 80;
  const locationRequestDistrictIsValid = containsLetter.test(locationRequestDraft.district.trim()) && locationRequestDraft.district.trim().length <= 80;
  const locationRequestComplexIsValid = containsLetter.test(locationRequestDraft.complex.trim()) && locationRequestDraft.complex.trim().length <= 120;
  const locationRequestFormIsValid = locationRequestCityIsValid && locationRequestDistrictIsValid && locationRequestComplexIsValid;
  const petNameIsValid = containsLetter.test(petNameInput.trim());
  const ownerNameIsValid = containsLetter.test(ownerNameInput.trim());
  const breedIsValid = containsLetter.test(breedInput.trim()) && breedInput.trim().length <= MAX_BREED_LENGTH;

  function chooseLocationCity(city: string) {
    const districts = uniqueLocationValues(availableLocations.filter((row) => row.city === city).map((row) => row.district));
    const district = districts.length === 1 ? districts[0] : "";
    const complexes = uniqueLocationValues(availableLocations
      .filter((row) => row.city === city && row.district === district)
      .map((row) => row.complex));
    setLocationDraft({ city, district, complex: complexes.length === 1 ? complexes[0] : "" });
  }

  function chooseLocationDistrict(district: string) {
    const complexes = uniqueLocationValues(availableLocations
      .filter((row) => row.city === locationDraft.city && row.district === district)
      .map((row) => row.complex));
    setLocationDraft({ ...locationDraft, district, complex: complexes.length === 1 ? complexes[0] : "" });
  }

  function openLocationRequest() {
    setLocationRequestDraft(defaultLocation);
    setLocationRequestError("");
    setTouchedFields({});
    pushNavigation("location-request");
  }

  async function sendLocationRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!locationRequestFormIsValid) {
      setTouchedFields((current) => ({
        ...current,
        "request-city": true,
        "request-district": true,
        "request-complex": true
      }));
      return;
    }

    setLocationRequestSaving(true);
    setLocationRequestError("");

    try {
      await createLocationRequest(locationRequestDraft);

      setLocationDraft(normalizeLocationSelection(defaultLocation, availableLocations));
      setLocationRequestDraft(defaultLocation);
      setTouchedFields({});
      returnThroughHistory();
      setLocationRequestSent(true);
    } catch (error) {
      setLocationRequestError(error instanceof Error ? error.message : "Не удалось отправить заявку.");
    } finally {
      setLocationRequestSaving(false);
    }
  }

  function selectPeriod(nextPeriod: Period) {
    if (nextPeriod === period) return;
    setPeriod(nextPeriod);
  }

  async function saveLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!locationFormIsValid) {
      setTouchedFields((current) => ({
        ...current,
        "location-city": true,
        "location-district": true,
        "location-complex": true
      }));
      return;
    }
    setLocationSaving(true);
    setLocationSubmitError("");

    try {
      const savedLocation = await saveSessionLocation(locationDraft);
      const locationChanged =
        location.city !== savedLocation.city ||
        location.district !== savedLocation.district ||
        location.complex !== savedLocation.complex;
      if (locationChanged) {
        setWalksLoaded(false);
        setSavedWalks([]);
        setPlacesLoaded(false);
        setSharedPlaces([]);
        setLocation(savedLocation);
      }
      setLocationDraft(savedLocation);
      setHasLocation(true);
      setTouchedFields({});
      setResult({ title: "Район выбран", message: "Теперь вы видите прогулки соседей.", onContinue: () => {
      if (locationOpenedFromMenu) {
        window.history.go(-2);
        return;
      }
      pushNavigation("walks");
      } });
    } catch (error) {
      setLocationSubmitError(error instanceof Error ? error.message : "Не удалось сохранить локацию.");
    } finally {
      setLocationSaving(false);
    }
  }

  function openLocationEditor() {
    setLocationDraft(location);
    setTouchedFields({});
    pushNavigation("location", { locationOpenedFromMenu: true });
  }

  function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPhotoError("");
    setPetSubmitError("");
    if (!file) return;
    if (!allowedPhotoTypes.has(file.type)) {
      setPhotoError("Выберите изображение в формате JPEG, PNG или WebP.");
      return;
    }
    if (file.size > MAX_SOURCE_PHOTO_SIZE) {
      setPhotoError("Исходная фотография должна быть меньше 10 МБ.");
      return;
    }
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(URL.createObjectURL(file));
  }

  function openFormScreen(nextScreen: FormScreen) {
    const source = screen === "my-pets" ? petsSource : null;
    pushNavigation(nextScreen, { petsSource: source });
  }

  function beginFormClose(target: Screen, mode: "back" | "replace" = "back") {
    if (screen === "pet") {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      setPhotoUrl(null);
      setPhotoError("");
      setPetSubmitError("");
      setPetNameInput("");
      setOwnerNameInput("");
      setBreedInput("");
      setPetBeingEdited(null);
      setTouchedFields({});
      if (target === "walks") {
        setPetReturnTarget("my-pets");
        setGuidedWalkFlow(false);
      }
    } else if (screen === "announce") {
      walkForm.resetWalkForm();
      setGuidedWalkFlow(false);
      if (target === "my-walks" || target === "walks") setWalkBeingEdited(null);
    }

    if (mode === "replace") {
      replaceNavigation(target);
    } else {
      returnThroughHistory();
    }
  }

  function addPet() {
    setTouchedFields({});
    setPetSubmitError("");
    setPhotoError("");
    setPhotoUrl(null);
    setPetNameInput("");
    setOwnerNameInput("");
    setBreedInput("");
    setPetBeingEdited(null);
    setPetScreenMode("edit");
    setPetReturnTarget("my-pets");
    setGuidedWalkFlow(false);
    openFormScreen("pet");
  }

  function editPet(pet: Pet) {
    setTouchedFields({});
    setPetSubmitError("");
    setPhotoError("");
    setPhotoUrl(pet.photoUrl);
    setPetNameInput(pet.name);
    setOwnerNameInput(pet.ownerName);
    setBreedInput(pet.breed);
    setPetBeingEdited(pet);
    setPetScreenMode("edit");
    setPetReturnTarget("my-pets");
    setGuidedWalkFlow(false);
    openFormScreen("pet");
  }

  function openPet(pet: Pet) {
    setPhotoUrl(pet.photoUrl);
    setPetNameInput(pet.name);
    setOwnerNameInput(pet.ownerName);
    setBreedInput(pet.breed);
    setPetBeingEdited(pet);
    setPetReturnTarget("my-pets");
    setPetScreenMode("view");
    openFormScreen("pet");
  }

  async function requestPetShareLink(pet: Pet, rotate = false) {
    if (rotate) {
      setPetShareRefreshing(true);
    } else {
      setPetToShare(pet);
      setPetShareLoading(true);
    }
    setPetShareError("");
    setPetShareCopied(false);
    try {
      setPetShareLink(await requestPetShareLinkRequest(pet.id, rotate));
    } catch (error) {
      setPetShareError(error instanceof Error ? error.message : "Не удалось получить ссылку.");
    } finally {
      if (rotate) {
        setPetShareRefreshing(false);
      } else {
        setPetShareLoading(false);
      }
    }
  }

  function closePetShare() {
    if (petShareLoading || petShareRefreshing) return;
    setPetToShare(null);
    setPetShareLink("");
    setPetShareError("");
    setPetShareCopied(false);
  }

  async function copyPetShareLink() {
    if (!petShareLink || petShareLoading) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(petShareLink);
      } else {
        const temporaryInput = document.createElement("textarea");
        temporaryInput.value = petShareLink;
        temporaryInput.setAttribute("readonly", "");
        temporaryInput.style.position = "fixed";
        temporaryInput.style.opacity = "0";
        document.body.appendChild(temporaryInput);
        temporaryInput.select();
        const copied = document.execCommand("copy");
        temporaryInput.remove();
        if (!copied) throw new Error("copy-failed");
      }
      setPetShareCopied(true);
      window.setTimeout(() => setPetShareCopied(false), 1800);
    } catch {
      setPetShareError("Не удалось скопировать ссылку. Нажмите на поле и скопируйте её вручную.");
    }
  }

  function dismissSharedPetHighlight() {
    if (!highlightedPetId) return;
    setHighlightedPetId("");
    const url = new URL(window.location.href);
    url.searchParams.delete("sharedPet");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function dismissSharedPetAlreadyAddedPopup() {
    setShowSharedPetAlreadyAddedPopup(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("sharedPetAlreadyAdded");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function prepareNewWalkAnnouncement() {
    setWalkBeingEdited(null);
    setGuidedWalkFlow(false);
    walkForm.prepareNewWalk();
  }

  function startWalkAnnouncement() {
    if (savedPets.length === 0) {
      setShowPetRequiredPopup(true);
      return;
    }
    prepareNewWalkAnnouncement();
    openFormScreen("announce");
  }

  function startDockWalkAnnouncement() {
    if (savedPets.length === 0) {
      setShowPetRequiredPopup(true);
      return;
    }
    if (dockWalkOpen) return;
    const returnSection: PrimaryDockSection = dockSection === "nearby" || dockSection === "profile" ? dockSection : dockReturnSection;
    prepareNewWalkAnnouncement();
    pushNavigation("walks", { dockWalkOpen: true, dockReturnSection: returnSection });
  }

  function closeDockWalkAnnouncement() {
    if (walkSaving) return;
    walkForm.setPlaceMenuOpen(false);
    returnThroughHistory();
  }

  function editWalk(walk: ApiWalk, returnTarget: WalkEditReturnTarget = "my-walks") {
    setWalkBeingEdited(walk);
    setWalkEditReturnTarget(returnTarget);
    setGuidedWalkFlow(false);
    walkForm.prepareWalkEdit(walk);
    openFormScreen("announce");
  }

  function continueToRequiredPet() {
    setShowPetRequiredPopup(false);
    setPetScreenMode("edit");
    setPhotoUrl(null);
    setPhotoError("");
    setPetSubmitError("");
    setTouchedFields({});
    setPetNameInput("");
    setOwnerNameInput("");
    setBreedInput("");
    setPetBeingEdited(null);
    setPetReturnTarget("announce");
    setGuidedWalkFlow(true);
    openFormScreen("pet");
  }

  function openCollectionScreen(nextScreen: "my-walks" | "my-pets", source: AppNavigationState["petsSource"] = null) {
    if (screen === nextScreen && (nextScreen !== "my-pets" || petsSource === source)) return;
    pushNavigation(nextScreen, { petsSource: nextScreen === "my-pets" ? source : null });
  }

  function returnToMenu() {
    if (screen === "my-pets" && !petsSource) {
      returnThroughHistory();
      return;
    }
    if (screen === "my-pets" && petsSource === "dock") {
      replaceNavigation("walks", { menuOpen: false, dockWalkOpen: false, dockReturnSection: "nearby" });
      return;
    }
    returnThroughHistory();
  }

  function openMenu() {
    if (menuOpen) return;
    if (screen === "my-pets" && petsSource === "dock") {
      replaceNavigation("walks", { menuOpen: true, dockReturnSection: "profile" });
      return;
    }
    pushNavigation("walks", { menuOpen: true });
  }

  function selectDockSection(nextSection: DockPanelSection) {
    if (nextSection === "nearby" && screen === "walks" && dockSection === "nearby") return;
    if (nextSection === "nearby" && screen === "my-pets" && petsSource === "dock") {
      returnToMenu();
      return;
    }
    if (nextSection === "walk") {
      startDockWalkAnnouncement();
      return;
    }

    if (nextSection === "profile") {
      openMenu();
      return;
    }

    replaceNavigation("walks", {
      menuOpen: false,
      dockWalkOpen: false,
      dockReturnSection: nextSection
    });
  }

  async function savePet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const returnTarget = petReturnTarget;
    const editedPet = petBeingEdited;
    if (photoError) return;

    setPetSubmitError("");
    if (!containsLetter.test(String(formData.get("petName") ?? "").trim())) {
      touchField("pet-name");
      return;
    }
    if (!containsLetter.test(String(formData.get("ownerName") ?? "").trim())) {
      touchField("owner-name");
      return;
    }
    if (!containsLetter.test(String(formData.get("breed") ?? "").trim())) {
      touchField("pet-breed");
      return;
    }
    setPetSaving(true);

    try {
      const photo = formData.get("photo");
      if (photo instanceof File && photo.size > 0) {
        const compressedPhoto = await compressPetPhoto(photo);
        formData.set("photo", compressedPhoto, compressedPhoto.name);
      } else {
        formData.delete("photo");
      }
      if (editedPet) formData.set("petId", editedPet.id);
      const savedPet = await savePetRequest(formData, Boolean(editedPet));

      setSavedPets((current) => [savedPet, ...current.filter((pet) => pet.id !== savedPet.id)]);
      setSavedWalks((current) => current.map((walk) => walk.petId === savedPet.id ? {
        ...walk,
        pet: savedPet.name,
        breed: savedPet.breed,
        owner: savedPet.ownerName,
        image: savedPet.photoUrl
      } : walk));
      setMyWalks((current) => current.map((walk) => walk.petId === savedPet.id ? {
        ...walk,
        pet: savedPet.name,
        breed: savedPet.breed,
        owner: savedPet.ownerName,
        image: savedPet.photoUrl
      } : walk));
      setPetSaving(false);
      setResult({ title: editedPet ? "Паспорт обновлён" : "Рады знакомству!", message: editedPet ? "Изменения сохранены в списке питомцев." : "Питомец добавлен. Теперь можно сообщить о прогулке.", action: returnTarget === "announce" ? "Продолжить прогулку" : "Готово", onContinue: () => {
      if (returnTarget === "announce") {
        setPetReturnTarget("my-pets");
        walkForm.selectPet(savedPet.id);
        beginFormClose("announce", "replace");
      } else {
        beginFormClose("my-pets");
      }
      } });
    } catch (error) {
      setPetSubmitError(error instanceof Error ? error.message : "Не удалось сохранить питомца.");
      setPetSaving(false);
    }
  }

  async function saveWalk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const editedWalk = walkBeingEdited;
    const formData = new FormData(form);
    const submission = walkForm.readSubmission(formData);
    if (!submission) return;
    const { petId, place: submittedPlace, walkTime: submittedWalkTime } = submission;
    setWalkSaving(true);
    walkForm.setSubmitError("");

    try {
      const savedWalk = await saveWalkRequest({
        walkId: editedWalk?.id,
        petId,
        place: submittedPlace,
        comment: walkForm.walkComment.trim(),
        scheduleType: walkForm.scheduleType,
        walkTime: submittedWalkTime,
        city: editedWalk?.city ?? location.city,
        district: editedWalk?.district ?? location.district,
        complex: editedWalk?.complex ?? location.complex
      });

      const belongsToSavedLocation = savedWalk.city === location.city &&
        savedWalk.district === location.district &&
        savedWalk.complex === location.complex;
      const appearsToday = isWalkScheduledForToday({ scheduleType: walkForm.scheduleType });
      setSavedWalks((current) => {
        const withoutEditedWalk = current.filter((walk) => walk.id !== savedWalk.id);
        return belongsToSavedLocation && appearsToday
          ? [apiWalkToCard(savedWalk), ...withoutEditedWalk]
          : withoutEditedWalk;
      });
      setSharedPlaces((current) => current.some((place) => place.id === savedWalk.placeId)
        ? current
        : [...current, { id: savedWalk.placeId, name: savedWalk.point }]
          .sort((left, right) => left.name.localeCompare(right.name, "ru")));
      setMyWalks((current) => [savedWalk, ...current.filter((walk) => walk.id !== savedWalk.id)]);
      setWalkSaving(false);
      setGuidedWalkFlow(false);
      setResult({ title: editedWalk ? "Планы обновлены" : "Вы идёте гулять!", message: editedWalk ? "Новое время и место видны в расписании." : "Прогулка появилась в расписании. Соседи знают, где вас найти.", action: "Посмотреть мои планы", receipt: { title: `${savedWalk.walkTime.slice(0, 5)} · ${savedWalk.scheduleType === "always" ? "Ежедневно" : savedWalk.scheduleType === "tomorrow" ? "Завтра" : "Сегодня"}`, place: savedWalk.point, pet: `${savedWalk.pet} · ${savedWalk.complex}` }, onContinue: () => {
      replaceNavigation("my-walks");
      } });
    } catch (error) {
      walkForm.setSubmitError(error instanceof Error ? error.message : "Не удалось сохранить прогулку.");
      setWalkSaving(false);
    }
  }

  async function closeDeletedWalkResult() {
    if (closingDeletedWalkResultRef.current || !pendingWalkRefreshRef.current) return;
    closingDeletedWalkResultRef.current = true;
    setResult(null);

    const { deletedId, request } = pendingWalkRefreshRef.current;
    try {
      const walks = await request;
      setSavedWalks(walks.filter(isWalkScheduledForToday).map(apiWalkToCard));
      setMyWalks((current) => current.filter((walk) => walk.id !== deletedId));
    } catch (error) {
      setWalksError(error instanceof Error ? error.message : "Не удалось загрузить прогулки.");
    } finally {
      pendingWalkRefreshRef.current = null;
      openCollectionScreen("my-walks");
    }
  }

  function closeResultSheet() {
    if (!result) return;
    setResult(null);
    void result.onContinue();
  }

  async function deleteWalk(event: MouseEvent<HTMLButtonElement>) {
    if (!walkPendingDelete || walkDeleting) return;
    const dialogTrigger = event.currentTarget;

    setWalkDeleting(true);
    setWalkDeleteError("");
    try {
      await deleteWalkRequest(walkPendingDelete.id);

      const deletedId = walkPendingDelete.id;
      const refresh = listWalks(location);
      pendingWalkRefreshRef.current = { deletedId, request: refresh };
      closingDeletedWalkResultRef.current = false;
      void refresh.catch(() => undefined);
      await requestDialogClose(dialogTrigger, () => {
        setWalkPendingDelete(null);
        setResult({ title: "Прогулка удалена", sheet: "Удалить прогулку?", message: "Она больше не отображается в расписании.", action: "Посмотреть мои планы", onContinue: closeDeletedWalkResult });
      }, true);
    } catch (error) {
      setWalkDeleteError(error instanceof Error ? error.message : "Не удалось удалить прогулку.");
    } finally {
      setWalkDeleting(false);
    }
  }

  async function deletePet(event: MouseEvent<HTMLButtonElement>) {
    if (!petPendingDelete || petDeleting) return;
    const dialogTrigger = event.currentTarget;

    setPetDeleting(true);
    setPetDeleteError("");
    try {
      const { detached } = await deletePetRequest(petPendingDelete.id);

      const deletedId = petPendingDelete.id;
      setSavedPets((current) => current.filter((pet) => pet.id !== deletedId));
      if (!detached) {
        setMyWalks((current) => current.filter((walk) => walk.petId !== deletedId));
        setSavedWalks((current) => current.filter((walk) => walk.petId !== deletedId));
      }
      await requestDialogClose(dialogTrigger, () => {
        setPetPendingDelete(null);
        setResult({ title: detached ? "Питомец убран из списка" : "Питомец удалён", sheet: "Удалить питомца", message: "Список питомцев обновлён.", onContinue: () => openCollectionScreen("my-pets", "dock") });
      }, true);
    } catch (error) {
      setPetDeleteError(error instanceof Error ? error.message : "Не удалось удалить питомца.");
    } finally {
      setPetDeleting(false);
    }
  }

  if (result && !result.sheet) return <DogmeetFrame><main><DogmeetHeader /><h1>{screen === "pet" ? petBeingEdited ? "Изменить питомца" : "Добавить питомца" : screen === "location" ? "Мой район" : walkBeingEdited ? "Изменить прогулку" : "Сообщить о прогулке"}</h1><DogmeetState state="success" title={result.title} message={result.message} action={result.action} onAction={() => { setResult(null); result.onContinue(); }}>{result.receipt && <div className="receipt"><strong>{result.receipt.title}</strong><span>{result.receipt.place}</span><small>{result.receipt.pet}</small></div>}</DogmeetState></main></DogmeetFrame>;

  if (screen === null) {
    return (
      <DogmeetFrame>
        <main><section className="restoring-shell" aria-label="Сервис совместных прогулок" aria-busy="true">
          {sessionError ? (
            <div className="session-error" role="alert">
              <p>{sessionError}</p>
              <button className="button" type="button" onClick={retrySession}>
                Повторить
              </button>
            </div>
          ) : (
            <span className="visually-hidden" role="status">Восстанавливаем безопасную сессию</span>
          )}
        </section></main>
      </DogmeetFrame>
    );
  }

  return (
    <DogmeetFrame className={(screen === "walks" || screen === "my-walks" || (screen === "my-pets" && petsSource === "dock")) ? "floating-nav" : ""}>
      <main className={(screen === "walks" || screen === "my-walks" || (screen === "my-pets" && petsSource === "dock")) && !menuOpen && !dockWalkOpen ? "with-nav" : ""}>
      <section className={`app-shell screen-${screen}`} aria-label="Сервис совместных прогулок">
        {(screen === "walks" || screen === "my-walks" || (screen === "my-pets" && petsSource === "dock")) && !menuOpen && !dockWalkOpen && (
          <BottomDock
            section={screen === "my-walks" ? "plans" : screen === "my-pets" ? "pets" : "nearby"}
            walkFormDirty={walkForm.walkFormDirty}
            walkFormIsValid={walkForm.formIsValid}
            petsLoaded={petsLoaded}
            walkSaving={walkSaving}
            onNearbyClick={() => selectDockSection("nearby")}
            onPlansClick={() => openCollectionScreen("my-walks")}
            onWalkClick={startWalkAnnouncement}
            onAddPet={addPet}
            onPetsClick={() => { if (dockSection !== "pets") openCollectionScreen("my-pets", "dock"); }}
          />
        )}
        {screen === "welcome" && (
          <div className="screen welcome welcome-screen">
            <DogmeetBrand tagline="Встретимся во дворе" />
            <h1>Хорошая прогулка<br />начинается<br /><em>с компании.</em></h1>
            <div className="welcome-photo hero-wrap">
              <Image
                src="/walk-hero.webp"
                alt="Хозяйка гуляет с собакой в парке"
                fill
                priority
                sizes="(max-width: 520px) 100vw, 430px"
              />
              <span className="photo-caption"><span>Знакомые места.</span><strong>Новые друзья.</strong></span>
            </div>
            <p>Узнайте, кто гуляет рядом, и расскажите соседям о своих планах.</p>
            <button className="button" type="button" onClick={openBrowserGuide}>Найти компанию</button>
            <small className="center-note">Без регистрации. Начнём с вашего района.</small>
          </div>
        )}

        {screen === "browser-guide" && (
          <BrowserGuide
            platform={browserGuidePlatform}
            onPlatformChange={setBrowserGuidePlatform}
            onContinue={continueFromBrowserGuide}
            onBack={returnThroughHistory}
          />
        )}

        {screen === "location" && (
          <LocationEditor
            location={locationDraft}
            cityOptions={locationCityOptions}
            districtOptions={locationDistrictOptions}
            complexOptions={locationComplexOptions}
            locationsLoaded={locationsLoaded}
            locationsError={locationsError}
            hasLocation={hasLocation}
            saving={locationSaving}
            submitError={locationSubmitError}
            touchedFields={touchedFields}
            valid={locationFormIsValid}
            onSubmit={saveLocation}
            onTouch={touchField}
            onCityChange={chooseLocationCity}
            onDistrictChange={chooseLocationDistrict}
            onComplexChange={(complex) => setLocationDraft({ ...locationDraft, complex })}
            onRequestLocation={openLocationRequest}
            onBack={returnThroughHistory}
          />
        )}

        {screen === "location-request" && (
          <LocationRequestForm
            location={locationRequestDraft}
            touchedFields={touchedFields}
            cityValid={locationRequestCityIsValid}
            districtValid={locationRequestDistrictIsValid}
            complexValid={locationRequestComplexIsValid}
            valid={locationRequestFormIsValid}
            saving={locationRequestSaving}
            error={locationRequestError}
            onSubmit={sendLocationRequest}
            onTouch={touchField}
            onChange={(field, value) => {
              setLocationRequestDraft((current) => ({ ...current, [field]: value }));
              setLocationRequestError("");
            }}
            onBack={returnThroughHistory}
          />
        )}

        {(screen === "walks" || screen === "walk-detail" || screen === "contact") && (
          <WalksWorkspace
            selectedWalk={selectedWalk}
            onSelectWalk={setSelectedWalk}
            dockSection={dockSection}
            detailOpen={screen === "walk-detail"}
            contactOpen={screen === "contact"}
            onOpenDetail={() => pushNavigation("walk-detail")}
            onOpenContact={() => pushNavigation("contact")}
            location={location}
            period={period}
            visibleWalks={visibleWalks}
            savedWalks={savedWalks}
            walksLoaded={walksLoaded}
            walksError={walksError}
            onRetryWalks={() => { void retryWalks(); }}
            ownedWalksById={ownedWalksById}
            openWalkActionsId={openWalkActionsId}
            onPeriodChange={selectPeriod}
            onToggleWalkActions={(id) => setOpenWalkActionsId((currentId) => currentId === id ? null : id)}
            onCloseWalkActions={() => setOpenWalkActionsId(null)}
            onEditWalk={(walk) => { setOpenWalkActionsId(null); editWalk(walk, "walks"); }}
            onDeleteWalk={(walk) => { setOpenWalkActionsId(null); setWalkDeleteError(""); setWalkPendingDelete(walk); }}
            guidedWalkFlow={guidedWalkFlow}
            savedPets={savedPets}
            sharedPlaces={sharedPlaces}
            onAddPet={continueToRequiredPet}
            placesLoaded={placesLoaded}
            placesError={placesError}
            onRetryPlaces={() => { void retryPlaces(); }}
            walkForm={walkForm}
            walkSaving={walkSaving}
            editingWalk={Boolean(walkBeingEdited)}
            onWalkSubmit={saveWalk}
            onStartWalk={startWalkAnnouncement}
            profileHeadingRef={profileHeadingRef}
            onOpenLocationEditor={openLocationEditor}
            onOpenMyWalks={() => openCollectionScreen("my-walks")}
            onOpenMyPets={() => openCollectionScreen("my-pets", "profile")}
            onOpenProfile={() => selectDockSection("profile")}
            onBack={screen === "walk-detail" || screen === "contact" ? returnThroughHistory : dockWalkOpen ? closeDockWalkAnnouncement : () => selectDockSection("nearby")}
          />
        )}


        {screen === "my-walks" && (
          <WalkCollection
            walks={myWalks}
            loaded={myWalksLoaded}
            error={myWalksError}
            onRetry={() => { void retryMyWalks(); }}
            petsLoaded={petsLoaded}
            openWalkActionsId={openWalkActionsId}
            onStartWalk={startWalkAnnouncement}
            onToggleWalkActions={(id) => setOpenWalkActionsId((currentId) => currentId === id ? null : id)}
            onCloseWalkActions={() => setOpenWalkActionsId(null)}
            onEditWalk={(walk) => { setOpenWalkActionsId(null); editWalk(walk, "my-walks"); }}
            onDeleteWalk={(walk) => { setOpenWalkActionsId(null); setWalkDeleteError(""); setWalkPendingDelete(walk); }}
            onBack={returnToMenu}
            location={location.complex}
            onLocation={openLocationEditor}
            onProfile={openMenu}
          />
        )}

        {screen === "my-pets" && (
          <PetCollection
            pets={savedPets}
            fromDock={petsSource === "dock"}
            loaded={petsLoaded}
            error={petsError}
            highlightedPetId={highlightedPetId}
            onDismissHighlight={dismissSharedPetHighlight}
            onShare={requestPetShareLink}
            onEdit={editPet}
            onOpen={openPet}
            onDelete={(pet) => { setPetDeleteError(""); setPetPendingDelete(pet); }}
            onAdd={addPet}
            onRetry={() => { void reloadPets(); }}
            onBack={returnToMenu}
            location={location.complex}
            onLocation={openLocationEditor}
            onProfile={openMenu}
          />
        )}

        {screen === "pet" && (
          <PetForm
            guidedWalkFlow={guidedWalkFlow}
            requiresWalkStepper={petReturnTarget === "announce"}
            petBeingEdited={petBeingEdited}
            mode={petScreenMode}
            photoUrl={photoUrl}
            photoError={photoError}
            submitError={petSubmitError}
            name={petNameInput}
            ownerName={ownerNameInput}
            breed={breedInput}
            nameValid={petNameIsValid}
            ownerNameValid={ownerNameIsValid}
            breedValid={breedIsValid}
            saving={petSaving}
            touchedFields={touchedFields}
            onSubmit={savePet}
            onPhotoChange={handlePhoto}
            onTouch={touchField}
            onNameChange={(value) => { setPetNameInput(value); setPetSubmitError(""); }}
            onOwnerNameChange={(value) => { setOwnerNameInput(value); setPetSubmitError(""); }}
            onBreedChange={(value) => { setBreedInput(value); setPetSubmitError(""); }}
            onEdit={() => setPetScreenMode("edit")}
            onShare={() => { if (petBeingEdited) void requestPetShareLink(petBeingEdited); }}
            onDelete={() => { if (petBeingEdited) { setPetDeleteError(""); setPetPendingDelete(petBeingEdited); } }}
            onBack={() => beginFormClose(petReturnTarget === "announce" ? "announce" : "my-pets")}
          />
        )}

        {screen === "announce" && (
          <div className="screen form-screen announce-screen">
            <WalkAnnouncementForm
              guidedWalkFlow={guidedWalkFlow}
              savedPets={savedPets}
              sharedPlaces={sharedPlaces}
              locationName={location.complex}
              onAddPet={continueToRequiredPet}
              placesLoaded={placesLoaded}
              placesError={placesError}
              onRetryPlaces={() => { void retryPlaces(); }}
              walkForm={walkForm}
              walkSaving={walkSaving}
              editing={Boolean(walkBeingEdited)}
              onSubmit={saveWalk}
              onBack={() => beginFormClose(walkBeingEdited ? walkEditReturnTarget : "walks")}
            />
          </div>
        )}

        {result?.sheet && <DogmeetDialog className="sheet--result" aria-label={result.title} onDismiss={closeResultSheet} footer={<button className="button" type="button" onClick={(event) => requestDialogClose(event.currentTarget, closeResultSheet)}>{result.action ?? "Готово"}</button>}><DogmeetState state="success" title={result.title} message={result.message} /></DogmeetDialog>}
        <HomeDialogs
          showPetRequired={showPetRequiredPopup}
          onDismissPetRequired={() => setShowPetRequiredPopup(false)}
          informationButtonRef={informationButtonRef}
          onContinueToRequiredPet={continueToRequiredPet}
          showSharedPetAlreadyAdded={showSharedPetAlreadyAddedPopup}
          onDismissSharedPetAlreadyAdded={dismissSharedPetAlreadyAddedPopup}
          locationRequestSent={locationRequestSent}
          locationRequestButtonRef={locationRequestButtonRef}
          onDismissLocationRequestSent={() => setLocationRequestSent(false)}
          petToShare={petToShare}
          petShareLink={petShareLink}
          petShareLoading={petShareLoading}
          petShareRefreshing={petShareRefreshing}
          petShareError={petShareError}
          petShareCopied={petShareCopied}
          shareDoneButtonRef={shareDoneButtonRef}
          onCopyPetShareLink={copyPetShareLink}
          onRotatePetShareLink={(pet) => requestPetShareLink(pet, true)}
          onClosePetShare={closePetShare}
          walkPendingDelete={walkPendingDelete}
          walkDeleting={walkDeleting}
          walkDeleteError={walkDeleteError}
          petPendingDelete={petPendingDelete}
          petDeleting={petDeleting}
          petDeleteError={petDeleteError}
          deleteCancelRef={deleteCancelRef}
          onDeleteWalk={deleteWalk}
          onCancelDeleteWalk={() => setWalkPendingDelete(null)}
          onDeletePet={deletePet}
          onCancelDeletePet={() => setPetPendingDelete(null)}
        />
      </section>
      </main>
    </DogmeetFrame>
  );
}
