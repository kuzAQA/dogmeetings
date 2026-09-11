"use client";

import {
  ChevronDown,
  Compass,
  EllipsisVertical,
  PawPrint,
  Share2,
  X
} from "lucide-react";
import Image from "next/image";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createLocationRequest,
  deletePet as deletePetRequest,
  deleteWalk as deleteWalkRequest,
  listLocations,
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
import { filterWalksByPeriod, locationOptions, petsById, walksById } from "./features/home/selectors";
import { useWalkForm } from "./features/home/use-walk-form";
import { compressPetPhoto } from "../lib/pet-photo";
import { WalkAnnouncementForm } from "./features/home/components/WalkAnnouncementForm";
import { PetCollection, WalkCollection } from "./features/home/components/Collections";
import { HomeDialogs } from "./features/home/components/HomeDialogs";
import { LocationEditor, LocationRequestForm } from "./features/home/components/LocationFlow";
import { PetForm } from "./features/home/components/PetForm";
import { WalksWorkspace } from "./features/home/components/WalksWorkspace";
import { apiWalkToCard, type ApiWalk, type Period } from "../lib/walks";

type BrowserGuidePlatform = "ios" | "android";
type PetReturnTarget = "my-pets" | "announce";
type WalkEditReturnTarget = "walks" | "my-walks";
type FormScreen = "pet" | "announce";

export default function Home() {
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
  } = useHomeResources(sessionReady, location);
  const walkForm = useWalkForm(savedPets, sharedPlaces, placesLoaded);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
  const informationButtonRef = useRef<HTMLButtonElement>(null);
  const locationRequestButtonRef = useRef<HTMLButtonElement>(null);
  const shareDoneButtonRef = useRef<HTMLButtonElement>(null);
  const profileHeadingRef = useRef<HTMLHeadingElement>(null);

  function touchField(field: string) {
    setTouchedFields((current) => current[field] ? current : { ...current, [field]: true });
  }

  function openBrowserGuide() {
    const userAgent = navigator.userAgent;
    const isIPadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    setBrowserGuidePlatform(/Android/i.test(userAgent) && !isIPadOs ? "android" : "ios");
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
      if (event.key !== "Escape") return;
      if (walkPendingDelete) {
        if (!walkDeleting) setWalkPendingDelete(null);
      } else if (petPendingDelete) {
        if (!petDeleting) setPetPendingDelete(null);
      } else if (screen === "walks" && menuOpen) {
        replaceNavigation("walks", { menuOpen: false, dockWalkOpen: false, dockReturnSection: "nearby" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen, petDeleting, petPendingDelete, replaceNavigation, screen, walkDeleting, walkPendingDelete]);

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

  const visibleWalks = useMemo(() => filterWalksByPeriod(savedWalks, period), [period, savedWalks]);
  const ownedWalksById = useMemo(() => walksById(myWalks), [myWalks]);
  const savedPetsById = useMemo(() => petsById(savedPets), [savedPets]);
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
      if (locationOpenedFromMenu) {
        window.history.go(-2);
        return;
      }
      pushNavigation("walks");
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
    setPetReturnTarget("my-pets");
    setGuidedWalkFlow(false);
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
    setTouchedFields({});
    setPetNameInput("");
    setOwnerNameInput("");
    setBreedInput("");
    setPetBeingEdited(null);
    setPetReturnTarget("announce");
    setGuidedWalkFlow(true);
    openFormScreen("pet");
  }

  function refreshPets() {
    void reloadPets().catch(() => undefined);
  }

  function openCollectionScreen(nextScreen: "my-walks" | "my-pets", source: AppNavigationState["petsSource"] = null) {
    pushNavigation(nextScreen, { petsSource: nextScreen === "my-pets" ? source : null });
    if (nextScreen === "my-pets") refreshPets();
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

  function handleDockWalkAction() {
    if (!dockWalkOpen) {
      if (screen === "my-pets" && petsSource === "dock") {
        if (savedPets.length === 0) {
          setShowPetRequiredPopup(true);
          return;
        }
        prepareNewWalkAnnouncement();
        pushNavigation("walks", { dockWalkOpen: true, dockReturnSection: "nearby" });
        return;
      }
      selectDockSection("walk");
      return;
    }
    if (!walkForm.walkFormDirty || !walkForm.formIsValid || walkSaving) return;
    walkForm.dockFormRef.current?.requestSubmit();
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
      if (returnTarget === "announce") {
        setPetReturnTarget("my-pets");
        walkForm.selectPet(savedPet.id);
        beginFormClose("announce", "replace");
      } else {
        beginFormClose("my-pets");
      }
    } catch (error) {
      setPetSubmitError(error instanceof Error ? error.message : "Не удалось сохранить питомца.");
      setPetSaving(false);
    }
  }

  async function saveWalk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const editedWalk = walkBeingEdited;
    const editReturnTarget = walkEditReturnTarget;
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
      const appearsToday = walkForm.scheduleType === "today" || walkForm.scheduleType === "always";
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
      if (dockWalkOpen && !editedWalk) {
        closeDockWalkAnnouncement();
      } else {
        beginFormClose(editedWalk ? editReturnTarget : "walks");
      }
    } catch (error) {
      walkForm.setSubmitError(error instanceof Error ? error.message : "Не удалось сохранить прогулку.");
      setWalkSaving(false);
    }
  }

  async function deleteWalk() {
    if (!walkPendingDelete || walkDeleting) return;

    setWalkDeleting(true);
    setWalkDeleteError("");
    try {
      await deleteWalkRequest(walkPendingDelete.id);

      const deletedId = walkPendingDelete.id;
      setMyWalks((current) => current.filter((walk) => walk.id !== deletedId));
      setSavedWalks((current) => current.filter((walk) => walk.id !== deletedId));
      setWalkPendingDelete(null);
    } catch (error) {
      setWalkDeleteError(error instanceof Error ? error.message : "Не удалось удалить прогулку.");
    } finally {
      setWalkDeleting(false);
    }
  }

  async function deletePet() {
    if (!petPendingDelete || petDeleting) return;

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
      setPetPendingDelete(null);
    } catch (error) {
      setPetDeleteError(error instanceof Error ? error.message : "Не удалось удалить питомца.");
    } finally {
      setPetDeleting(false);
    }
  }

  if (screen === null) {
    return (
      <main className="page-shell">
        <section className="app-shell restoring-shell" aria-label="Сервис совместных прогулок" aria-busy="true">
          {sessionError ? (
            <div className="session-error" role="alert">
              <p>{sessionError}</p>
              <button className="primary-button" type="button" onClick={retrySession}>
                Повторить
              </button>
            </div>
          ) : (
            <span className="visually-hidden" role="status">Восстанавливаем безопасную сессию</span>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className={`app-shell screen-${screen}`} aria-label="Сервис совместных прогулок">
        {(screen === "walks" || (screen === "my-pets" && petsSource === "dock")) && (
          <BottomDock
            section={dockSection}
            menuOpen={menuOpen}
            dockWalkOpen={dockWalkOpen}
            walkFormDirty={walkForm.walkFormDirty}
            walkFormIsValid={walkForm.formIsValid}
            petsLoaded={petsLoaded}
            walkSaving={walkSaving}
            onNearbyClick={() => selectDockSection("nearby")}
            onWalkClick={handleDockWalkAction}
            onPetsClick={() => { if (dockSection !== "pets") openCollectionScreen("my-pets", "dock"); }}
            onProfileClick={() => selectDockSection("profile")}
          />
        )}
        {screen === "welcome" && (
          <div className="screen welcome-screen">
            <div className="welcome-copy">
              <div className="paw-mark" aria-hidden="true"><PawPrint /></div>
              <h1>Гулять вместе веселее</h1>
              <p>Находите хозяев собак поблизости, договаривайтесь о прогулках и знакомьте питомцев.</p>
            </div>
            <div className="hero-wrap">
              <Image
                src="/walk-hero.webp"
                alt="Хозяйка гуляет с собакой в парке"
                fill
                priority
                sizes="(max-width: 520px) 100vw, 430px"
              />
            </div>
            <button className="primary-button" type="button" onClick={openBrowserGuide}>
              Найти компанию
            </button>
          </div>
        )}

        {screen === "browser-guide" && (
          <div className="screen browser-guide-screen">

            <div className="screen-heading browser-guide-heading">
              <h1>Откройте сайт в браузере</h1>
              <p>Если ссылка открылась внутри Telegram или другого мессенджера, перейдите в обычный браузер</p>
            </div>

            <div className="browser-guide-content">
              <div className="browser-guide-platforms" role="group" aria-label="Выберите устройство">
                <span
                  className="filter-indicator browser-guide-platform-indicator"
                  aria-hidden="true"
                  style={{ left: browserGuidePlatform === "ios" ? "var(--space-1)" : "50%" }}
                />
                <button
                  className={`filter-button browser-guide-platform-button ${browserGuidePlatform === "ios" ? "is-active" : ""}`}
                  type="button"
                  aria-pressed={browserGuidePlatform === "ios"}
                  onClick={() => setBrowserGuidePlatform("ios")}
                >
                  <span>iPhone</span>
                </button>
                <button
                  className={`filter-button browser-guide-platform-button ${browserGuidePlatform === "android" ? "is-active" : ""}`}
                  type="button"
                  aria-pressed={browserGuidePlatform === "android"}
                  onClick={() => setBrowserGuidePlatform("android")}
                >
                  <span>Android</span>
                </button>
              </div>

              {browserGuidePlatform === "ios" ? (
                <section className="browser-tip-card browser-tip-card--ios" aria-labelledby="ios-browser-tip-title">
                  <div className="browser-tip-copy">
                    <span className="browser-tip-number" aria-hidden="true">1</span>
                    <div>
                      <h2 id="ios-browser-tip-title">Откройте в Safari</h2>
                      <p>Нажмите значок компаса внизу предварительного окна</p>
                    </div>
                  </div>
                  <div className="browser-preview browser-preview--ios" aria-hidden="true">
                    <span className="browser-preview-label">Нажмите сюда</span>
                    <span className="browser-preview-arrow browser-preview-arrow--down" />
                    <span className="browser-preview-action"><Compass /></span>
                  </div>
                </section>
              ) : (
                <section className="browser-tip-card browser-tip-card--android" aria-labelledby="android-browser-tip-title">
                  <div className="browser-preview browser-preview--android" aria-hidden="true">
                    <div className="android-inapp-toolbar">
                      <span className="android-status-time">11:29</span>
                      <span className="android-status-icons">● ◒ ▮</span>
                      <span className="android-toolbar-actions"><X /><ChevronDown /></span>
                      <span className="android-toolbar-identity"><strong>Гулять вместе</strong><small>dogmeet.ru</small></span>
                      <Share2 className="android-toolbar-share" />
                      <span className="browser-preview-action"><EllipsisVertical /></span>
                    </div>
                    <span className="browser-preview-label">Нажмите сюда</span>
                    <span className="browser-preview-arrow browser-preview-arrow--android" />
                  </div>
                  <div className="browser-tip-copy">
                    <span className="browser-tip-number" aria-hidden="true">1</span>
                    <div>
                      <h2 id="android-browser-tip-title">Откройте в браузере</h2>
                      <p>Нажмите три точки справа сверху, затем выберите «Открыть в браузере»</p>
                    </div>
                  </div>
                </section>
              )}

            </div>

            <p className="browser-guide-note">
              Если сайт уже открыт в Safari или Chrome,<br />
              просто продолжите
            </p>

            <button className="primary-button browser-guide-continue" type="button" onClick={continueFromBrowserGuide}>
              Продолжить
            </button>
          </div>
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
          />
        )}

        {screen === "walks" && (
          <WalksWorkspace
            dockSection={dockSection}
            location={location}
            period={period}
            visibleWalks={visibleWalks}
            savedWalks={savedWalks}
            walksLoaded={walksLoaded}
            ownedWalksById={ownedWalksById}
            petsById={savedPetsById}
            openWalkActionsId={openWalkActionsId}
            onPeriodChange={selectPeriod}
            onToggleWalkActions={(id) => setOpenWalkActionsId((currentId) => currentId === id ? null : id)}
            onCloseWalkActions={() => setOpenWalkActionsId(null)}
            onEditWalk={(walk) => { setOpenWalkActionsId(null); editWalk(walk, "walks"); }}
            onDeleteWalk={(walk) => { setOpenWalkActionsId(null); setWalkDeleteError(""); setWalkPendingDelete(walk); }}
            onSharePet={(pet) => { setOpenWalkActionsId(null); requestPetShareLink(pet); }}
            guidedWalkFlow={guidedWalkFlow}
            savedPets={savedPets}
            placesLoaded={placesLoaded}
            walkForm={walkForm}
            walkSaving={walkSaving}
            editingWalk={Boolean(walkBeingEdited)}
            onWalkSubmit={saveWalk}
            profileHeadingRef={profileHeadingRef}
            onOpenLocationEditor={openLocationEditor}
            onOpenMyWalks={() => openCollectionScreen("my-walks")}
            onOpenMyPets={() => openCollectionScreen("my-pets", "profile")}
          />
        )}


        {screen === "my-walks" && (
          <WalkCollection
            walks={myWalks}
            loaded={myWalksLoaded}
            petsLoaded={petsLoaded}
            openWalkActionsId={openWalkActionsId}
            onStartWalk={startWalkAnnouncement}
            onToggleWalkActions={(id) => setOpenWalkActionsId((currentId) => currentId === id ? null : id)}
            onCloseWalkActions={() => setOpenWalkActionsId(null)}
            onEditWalk={(walk) => { setOpenWalkActionsId(null); editWalk(walk, "my-walks"); }}
            onDeleteWalk={(walk) => { setOpenWalkActionsId(null); setWalkDeleteError(""); setWalkPendingDelete(walk); }}
          />
        )}

        {screen === "my-pets" && (
          <PetCollection
            pets={savedPets}
            fromDock={petsSource === "dock"}
            highlightedPetId={highlightedPetId}
            onDismissHighlight={dismissSharedPetHighlight}
            onShare={requestPetShareLink}
            onEdit={editPet}
            onDelete={(pet) => { setPetDeleteError(""); setPetPendingDelete(pet); }}
            onAdd={addPet}
          />
        )}

        {screen === "pet" && (
          <PetForm
            guidedWalkFlow={guidedWalkFlow}
            requiresWalkStepper={petReturnTarget === "announce"}
            petBeingEdited={petBeingEdited}
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
          />
        )}

        {screen === "announce" && (
          <div className="screen form-screen announce-screen">
            <WalkAnnouncementForm
              guidedWalkFlow={guidedWalkFlow}
              savedPets={savedPets}
              placesLoaded={placesLoaded}
              walkForm={walkForm}
              walkSaving={walkSaving}
              editing={Boolean(walkBeingEdited)}
              onSubmit={saveWalk}
            />
          </div>
        )}

        <HomeDialogs
          showPetRequired={showPetRequiredPopup}
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
  );
}
