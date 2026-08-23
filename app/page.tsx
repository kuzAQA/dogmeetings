"use client";

import {
  ArrowLeft,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Compass,
  Copy,
  Dog,
  EllipsisVertical,
  Forward,
  House,
  Hourglass,
  MessageCircle,
  PawPrint,
  Pencil,
  Plus,
  RefreshCw,
  Share2,
  Trash2,
  UserRound,
  X
} from "lucide-react";
import Image from "next/image";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { compressPetPhoto } from "../lib/pet-photo";
import { DropdownSelect } from "./components/ui/DropdownSelect";
import { TimeDropdown } from "./components/ui/TimeDropdown";
import { WalkPlace } from "./components/ui/WalkPlace";
import { WalkSetupStepper } from "./components/ui/WalkSetupStepper";
import {
  apiWalkToCard,
  formatResidentialComplex,
  formatWalkDate,
  type ApiWalk,
  type Period,
  type ScheduleType,
  type Walk
} from "../lib/walks";

type Screen = "welcome" | "browser-guide" | "location" | "location-request" | "walks" | "pet" | "announce" | "my-walks" | "my-pets";
type AppNavigationState = {
  dogmeetNavigation: true;
  screen: Screen;
  menuOpen: boolean;
  locationOpenedFromMenu: boolean;
  dockWalkOpen: boolean;
  dockReturnSection: PrimaryDockSection;
  petsSource: "dock" | "profile" | null;
};
type BrowserGuidePlatform = "ios" | "android";
type PrimaryDockSection = "nearby" | "profile";
type DockSection = PrimaryDockSection | "walk" | "pets";
type DockPanelSection = "nearby" | "walk" | "profile";
type DockSlide = {
  from: DockPanelSection;
  to: DockPanelSection;
  direction: "forward" | "backward";
};
type DockMotion = "enter-left" | "exit-left";
type BrowserGuideTarget = "walks" | "location";
type PetReturnTarget = "my-pets" | "announce";
type WalkEditReturnTarget = "walks" | "my-walks";
type FilterMotion = "idle" | "exit-left" | "exit-right" | "enter-left" | "enter-right";
type LocationCloseTarget = "history" | "menu" | "walks" | null;
type ScreenMotion = "enter-right" | "exit-left" | "exit-right" | null;
type FormScreen = "pet" | "announce";

type Location = {
  city: string;
  district: string;
  complex: string;
};

type Pet = {
  id: string;
  name: string;
  breed: string;
  ownerName: string;
  photoUrl: string;
  createdAt: string;
  updatedAt: string;
  isOwner: boolean;
  isShared: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canShare: boolean;
};

type SharedPlace = {
  id: string;
  name: string;
};

type AvailableLocation = {
  city: string;
  district: string;
  complex: string;
};

type SessionBootstrapData = {
  hasLocation: boolean;
  location: Location | null;
};

const STORAGE_KEY = "dogwalk.location.v1";
const HAS_LOCATION_KEY = "dogwalk.hasLocation.v1";
const CLIENT_ID_KEY = "dogwalk.clientId.v1";
const MAX_SOURCE_PHOTO_SIZE = 10 * 1024 * 1024;
const MAX_WALK_META_LENGTH = 40;
const MAX_WALK_COMMENT_LENGTH = MAX_WALK_META_LENGTH;
const MAX_BREED_LENGTH = 20;
const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const containsLetter = /\p{L}/u;
const MAX_WALK_PLACE_LENGTH = MAX_WALK_META_LENGTH;
const periodOptions: Period[] = ["Все", "Утро", "День", "Вечер"];
const filterIndicatorLeft: Record<Period, string> = {
  "Все": "0",
  "Утро": "calc(25% + 2px)",
  "День": "calc(50% + 4px)",
  "Вечер": "calc(75% + 6px)"
};
const scheduleIndicatorLeft: Record<ScheduleType, string> = {
  today: "0",
  tomorrow: "calc(33.333333% + 2.666667px)",
  always: "calc(66.666667% + 5.333333px)"
};
const defaultLocation: Location = {
  city: "",
  district: "",
  complex: ""
};

function readLegacySessionData() {
  try {
    const legacyClientId = window.localStorage.getItem(CLIENT_ID_KEY) ?? "";
    const storedLocation = window.localStorage.getItem(STORAGE_KEY);
    const parsedLocation = storedLocation ? JSON.parse(storedLocation) as Partial<Location> : null;
    const legacyLocation = parsedLocation ? {
      city: parsedLocation.city?.trim() ?? "",
      district: parsedLocation.district?.trim() ?? "",
      complex: parsedLocation.complex?.trim() ?? ""
    } : null;

    return {
      legacyClientId: uuidPattern.test(legacyClientId) ? legacyClientId : undefined,
      legacyLocation,
      legacyHasLocation: window.localStorage.getItem(HAS_LOCATION_KEY) === "true"
    };
  } catch {
    return {};
  }
}

function clearLegacySessionData() {
  try {
    window.localStorage.removeItem(CLIENT_ID_KEY);
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(HAS_LOCATION_KEY);
  } catch {
    // Работа с сайтом уже продолжается через HttpOnly cookie.
  }
}

let sessionBootstrapPromise: Promise<SessionBootstrapData> | null = null;

async function postSessionBootstrap(body: object) {
  const response = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json() as Partial<SessionBootstrapData> & { error?: string };
  if (!response.ok) {
    throw Object.assign(
      new Error(data.error || "Не удалось восстановить безопасную сессию."),
      { status: response.status }
    );
  }
  return {
    hasLocation: Boolean(data.hasLocation),
    location: data.location ?? null
  };
}

async function getSessionBootstrap() {
  const response = await fetch("/api/session", { cache: "no-store" });
  const data = await response.json() as Partial<SessionBootstrapData> & { error?: string };
  if (!response.ok) {
    throw Object.assign(
      new Error(data.error || "Не удалось восстановить безопасную сессию."),
      { status: response.status }
    );
  }
  return {
    hasLocation: Boolean(data.hasLocation),
    location: data.location ?? null
  };
}

function bootstrapSession() {
  if (!sessionBootstrapPromise) {
    sessionBootstrapPromise = getSessionBootstrap()
      .catch(async (error: Error & { status?: number }) => {
        if (error.status !== 401) throw error;

        try {
          await postSessionBootstrap(readLegacySessionData());
        } catch (migrationError) {
          if ((migrationError as Error & { status?: number }).status !== 409) throw migrationError;
          await new Promise((resolve) => window.setTimeout(resolve, 100));
        }

        try {
          return await getSessionBootstrap();
        } catch (verificationError) {
          if ((verificationError as Error & { status?: number }).status === 401) {
            throw new Error("Браузер не сохранил cookie. Разрешите cookie для этого сайта и повторите попытку.");
          }
          throw verificationError;
        }
      })
      .catch((error) => {
        sessionBootstrapPromise = null;
        throw error;
      });
  }
  return sessionBootstrapPromise;
}

function normalizePlaceForComparison(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ru-RU");
}

function uniqueLocationValues(values: string[]) {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right, "ru"));
}

function normalizeLocationSelection(current: Location, rows: AvailableLocation[]): Location {
  const cities = uniqueLocationValues(rows.map((row) => row.city));
  const city = cities.includes(current.city) ? current.city : cities.length === 1 ? cities[0] : "";
  const districts = uniqueLocationValues(rows.filter((row) => row.city === city).map((row) => row.district));
  const district = districts.includes(current.district) ? current.district : districts.length === 1 ? districts[0] : "";
  const complexes = uniqueLocationValues(rows
    .filter((row) => row.city === city && row.district === district)
    .map((row) => row.complex));
  const complex = complexes.includes(current.complex) ? current.complex : complexes.length === 1 ? complexes[0] : "";
  return { city, district, complex };
}

export default function Home() {
  const [screen, setScreen] = useState<Screen | null>(null);
  const [browserGuidePlatform, setBrowserGuidePlatform] = useState<BrowserGuidePlatform>("ios");
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [sessionAttempt, setSessionAttempt] = useState(0);
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
  const [displayedPeriod, setDisplayedPeriod] = useState<Period>("Все");
  const [filterMotion, setFilterMotion] = useState<FilterMotion>("idle");
  const [menuOpen, setMenuOpen] = useState(false);
  const [animateMenuOpen, setAnimateMenuOpen] = useState(true);
  const [menuClosing, setMenuClosing] = useState(false);
  const [dockSection, setDockSection] = useState<DockSection>("nearby");
  const [dockWalkOpen, setDockWalkOpen] = useState(false);
  const [dockWalkClosing, setDockWalkClosing] = useState(false);
  const [dockReturnSection, setDockReturnSection] = useState<PrimaryDockSection>("nearby");
  const [dockVisibleSection, setDockVisibleSection] = useState<DockPanelSection>("nearby");
  const [dockSlide, setDockSlide] = useState<DockSlide | null>(null);
  const [dockTransitionVisible, setDockTransitionVisible] = useState(false);
  const [petsSource, setPetsSource] = useState<AppNavigationState["petsSource"]>(null);
  const [petsDockDirection, setPetsDockDirection] = useState<"forward" | "backward">("forward");
  const [collectionClosing, setCollectionClosing] = useState(false);
  const [petsTransitionTarget, setPetsTransitionTarget] = useState<"nearby" | "walk" | "profile" | null>(null);
  const [profileTransitionTarget, setProfileTransitionTarget] = useState<"my-walks" | "my-pets" | "profile" | null>(null);
  const [browserGuideClosing, setBrowserGuideClosing] = useState(false);
  const [browserGuideExitDirection, setBrowserGuideExitDirection] = useState<"left" | "right">("right");
  const [browserGuideTransitionTarget, setBrowserGuideTransitionTarget] = useState<BrowserGuideTarget | null>(null);
  const [locationOpenedFromMenu, setLocationOpenedFromMenu] = useState(false);
  const [locationCloseTarget, setLocationCloseTarget] = useState<LocationCloseTarget>(null);
  const [locationMotion, setLocationMotion] = useState<ScreenMotion>(null);
  const [locationRequestClosing, setLocationRequestClosing] = useState(false);
  const [formClosing, setFormClosing] = useState(false);
  const [formCloseTarget, setFormCloseTarget] = useState<Screen | null>(null);
  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [petSubmitError, setPetSubmitError] = useState("");
  const [petSaved, setPetSaved] = useState(false);
  const [petSaving, setPetSaving] = useState(false);
  const [petNameInput, setPetNameInput] = useState("");
  const [ownerNameInput, setOwnerNameInput] = useState("");
  const [breedInput, setBreedInput] = useState("");
  const [savedPets, setSavedPets] = useState<Pet[]>([]);
  const [petsLoaded, setPetsLoaded] = useState(false);
  const [petBeingEdited, setPetBeingEdited] = useState<Pet | null>(null);
  const [petReturnTarget, setPetReturnTarget] = useState<PetReturnTarget>("my-pets");
  const [guidedWalkFlow, setGuidedWalkFlow] = useState(false);
  const [showPetRequiredPopup, setShowPetRequiredPopup] = useState(false);
  const [walkSaved, setWalkSaved] = useState(false);
  const [walkSaving, setWalkSaving] = useState(false);
  const [walkSubmitError, setWalkSubmitError] = useState("");
  const [sharedPlaces, setSharedPlaces] = useState<SharedPlace[]>([]);
  const [placesLoaded, setPlacesLoaded] = useState(false);
  const [placeInput, setPlaceInput] = useState("");
  const [placeMenuOpen, setPlaceMenuOpen] = useState(false);
  const [savedWalks, setSavedWalks] = useState<Walk[]>([]);
  const [walksLoaded, setWalksLoaded] = useState(false);
  const [myWalks, setMyWalks] = useState<ApiWalk[]>([]);
  const [myWalksLoaded, setMyWalksLoaded] = useState(false);
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
  const [scheduleType, setScheduleType] = useState<ScheduleType>("today");
  const [selectedPetId, setSelectedPetId] = useState("");
  const [walkTime, setWalkTime] = useState("");
  const [walkTimePickerOpen, setWalkTimePickerOpen] = useState(false);
  const [walkComment, setWalkComment] = useState("");
  const [walkFormDirty, setWalkFormDirty] = useState(false);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
  const browserGuidePendingNavigationRef = useRef<AppNavigationState | null>(null);
  const browserGuideRestoringHistoryRef = useRef(false);
  const browserGuideFinalizingHistoryRef = useRef(false);
  const formPendingNavigationRef = useRef<AppNavigationState | null>(null);
  const formRestoringHistoryRef = useRef(false);
  const formFinalizingHistoryRef = useRef(false);
  const informationButtonRef = useRef<HTMLButtonElement>(null);
  const locationRequestButtonRef = useRef<HTMLButtonElement>(null);
  const shareDoneButtonRef = useRef<HTMLButtonElement>(null);
  const formCloseModeRef = useRef<"back" | "replace">("back");
  const dockWalkFormRef = useRef<HTMLFormElement>(null);

  const applyNavigationState = useCallback((navigation: AppNavigationState, preserveDockSlide = false) => {
    setCollectionClosing(false);
    setPetsTransitionTarget(null);
    setProfileTransitionTarget(null);
    setLocationCloseTarget(null);
    setFormClosing(false);
    setFormCloseTarget(null);
    setBrowserGuideClosing(false);
    setBrowserGuideTransitionTarget(null);
    setMenuClosing(false);
    setDockWalkClosing(false);
    setLocationOpenedFromMenu(navigation.locationOpenedFromMenu);
    setMenuOpen(navigation.menuOpen);
    setDockWalkOpen(navigation.dockWalkOpen);
    setDockReturnSection(navigation.dockReturnSection);
    setPetsSource(navigation.petsSource);
    setDockSection(navigation.petsSource === "dock" ? "pets" : navigation.dockWalkOpen ? "walk" : navigation.menuOpen ? "profile" : navigation.dockReturnSection);
    if (!preserveDockSlide) {
      setDockVisibleSection(navigation.dockWalkOpen ? "walk" : navigation.menuOpen ? "profile" : "nearby");
      setDockSlide(null);
    }
    setScreen(navigation.screen);
  }, []);

  const pushNavigation = useCallback((
    nextScreen: Screen,
    options: Partial<Pick<AppNavigationState, "menuOpen" | "locationOpenedFromMenu" | "dockWalkOpen" | "dockReturnSection" | "petsSource">> = {},
    preserveDockSlide = false
  ) => {
    const currentDockSection: PrimaryDockSection = dockSection === "nearby" || dockSection === "profile" ? dockSection : dockReturnSection;
    const navigation: AppNavigationState = {
      dogmeetNavigation: true,
      screen: nextScreen,
      menuOpen: options.menuOpen ?? false,
      locationOpenedFromMenu: options.locationOpenedFromMenu ?? false,
      dockWalkOpen: options.dockWalkOpen ?? false,
      dockReturnSection: options.dockReturnSection ?? currentDockSection,
      petsSource: options.petsSource ?? null
    };
    window.history.pushState(navigation, "", window.location.href);
    applyNavigationState(navigation, preserveDockSlide);
  }, [applyNavigationState, dockReturnSection, dockSection]);

  const replaceNavigation = useCallback((
    nextScreen: Screen,
    options: Partial<Pick<AppNavigationState, "menuOpen" | "locationOpenedFromMenu" | "dockWalkOpen" | "dockReturnSection" | "petsSource">> = {},
    preserveDockSlide = false
  ) => {
    const currentDockSection: PrimaryDockSection = dockSection === "nearby" || dockSection === "profile" ? dockSection : dockReturnSection;
    const navigation: AppNavigationState = {
      dogmeetNavigation: true,
      screen: nextScreen,
      menuOpen: options.menuOpen ?? false,
      locationOpenedFromMenu: options.locationOpenedFromMenu ?? false,
      dockWalkOpen: options.dockWalkOpen ?? false,
      dockReturnSection: options.dockReturnSection ?? currentDockSection,
      petsSource: options.petsSource ?? null
    };
    window.history.replaceState(navigation, "", window.location.href);
    applyNavigationState(navigation, preserveDockSlide);
  }, [applyNavigationState, dockReturnSection, dockSection]);

  const returnThroughHistory = useCallback(() => {
    const current = window.history.state as Partial<AppNavigationState> | null;
    if (current?.dogmeetNavigation) {
      window.history.back();
      return;
    }
    replaceNavigation(hasLocation ? "walks" : "welcome");
  }, [hasLocation, replaceNavigation]);

  function touchField(field: string) {
    setTouchedFields((current) => current[field] ? current : { ...current, [field]: true });
  }

  function changeWalkScheduleType(value: ScheduleType, inDock = false) {
    if (value === scheduleType) return;
    if (inDock) setWalkFormDirty(true);
    setScheduleType(value);
    setWalkTime("");
    setWalkSubmitError("");
    setTouchedFields((current) => current["walk-time"]
      ? { ...current, "walk-time": false }
      : current);
  }

  function openBrowserGuide() {
    const userAgent = navigator.userAgent;
    const isIPadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    setBrowserGuidePlatform(/Android/i.test(userAgent) && !isIPadOs ? "android" : "ios");
    pushNavigation("browser-guide");
  }

  function continueFromBrowserGuide() {
    setBrowserGuideExitDirection("left");
    setBrowserGuideTransitionTarget(hasLocation ? "walks" : "location");
    setBrowserGuideClosing(true);
  }

  function completeBrowserGuideClose() {
    if (browserGuideTransitionTarget) {
      if (browserGuideTransitionTarget === "location") setLocationMotion("enter-right");
      pushNavigation(browserGuideTransitionTarget);
      return;
    }
    if (browserGuidePendingNavigationRef.current) {
      browserGuidePendingNavigationRef.current = null;
      browserGuideFinalizingHistoryRef.current = true;
      window.history.back();
    }
  }

  useEffect(() => {
    let active = true;

    bootstrapSession()
      .then((data) => {
        if (!active) return;

        const restoredLocation = data.hasLocation && data.location
          ? data.location
          : defaultLocation;
        const searchParameters = new URLSearchParams(window.location.search);
        const sharedPetId = searchParameters.get("sharedPet") ?? "";
        const sharedPetAlreadyAddedId = searchParameters.get("sharedPetAlreadyAdded") ?? "";
        const validSharedPetId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sharedPetId)
          ? sharedPetId
          : "";
        const validSharedPetAlreadyAddedId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sharedPetAlreadyAddedId)
          ? sharedPetAlreadyAddedId
          : "";
        const initialScreen: Screen = validSharedPetId || validSharedPetAlreadyAddedId
          ? "my-pets"
          : data.hasLocation && data.location ? "walks" : "welcome";
        // Сначала показываем сам экран «Мои питомцы» и дожидаемся его данных.
        // Подсветка новой карточки включается отдельным эффектом ниже.
        setHighlightedPetId("");
        setPendingSharedPetHighlightId(validSharedPetId);
        setShowSharedPetAlreadyAddedPopup(Boolean(validSharedPetAlreadyAddedId));
        setLocation(restoredLocation);
        setLocationDraft((current) => data.hasLocation && data.location ? restoredLocation : current);
        setHasLocation(Boolean(data.hasLocation && data.location));
        const initialNavigation: AppNavigationState = {
          dogmeetNavigation: true,
          screen: initialScreen,
          menuOpen: false,
          locationOpenedFromMenu: false,
          dockWalkOpen: false,
          dockReturnSection: "nearby",
          petsSource: null
        };
        if (validSharedPetId || validSharedPetAlreadyAddedId) {
          // A share acceptance reaches the app through location.replace(), so
          // there is no previous Dogmeet entry to return to. Seed one before
          // opening «Мои питомцы»; otherwise iOS goes back to the messenger's
          // discarded preview and may leave a blank page.
          const returnNavigation: AppNavigationState = {
            dogmeetNavigation: true,
            screen: data.hasLocation && data.location ? "walks" : "welcome",
            menuOpen: false,
            locationOpenedFromMenu: false,
            dockWalkOpen: false,
            dockReturnSection: "nearby",
            petsSource: null
          };
          window.history.replaceState(returnNavigation, "", window.location.href);
          window.history.pushState(initialNavigation, "", window.location.href);
        } else {
          window.history.replaceState(initialNavigation, "", window.location.href);
        }
        applyNavigationState(initialNavigation);
        setSessionReady(true);
        clearLegacySessionData();
      })
      .catch((error) => {
        if (!active) return;
        setSessionError(error instanceof Error ? error.message : "Не удалось восстановить безопасную сессию.");
      });

    return () => { active = false; };
  }, [applyNavigationState, sessionAttempt]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const navigation = event.state as Partial<AppNavigationState> | null;
      if (!navigation?.dogmeetNavigation || !navigation.screen) return;
      const nextNavigation: AppNavigationState = {
        dogmeetNavigation: true,
        screen: navigation.screen,
        menuOpen: Boolean(navigation.menuOpen),
        locationOpenedFromMenu: Boolean(navigation.locationOpenedFromMenu),
        dockWalkOpen: Boolean(navigation.dockWalkOpen),
        dockReturnSection: navigation.dockReturnSection ?? "nearby",
        petsSource: navigation.petsSource === "dock" || navigation.petsSource === "profile" ? navigation.petsSource : null
      };
      if (browserGuideRestoringHistoryRef.current) {
        browserGuideRestoringHistoryRef.current = false;
        return;
      }
      if (browserGuideFinalizingHistoryRef.current) {
        browserGuideFinalizingHistoryRef.current = false;
        applyNavigationState(nextNavigation);
        return;
      }
      if (formRestoringHistoryRef.current) {
        formRestoringHistoryRef.current = false;
        return;
      }
      if (formFinalizingHistoryRef.current) {
        formFinalizingHistoryRef.current = false;
        applyNavigationState(nextNavigation);
        return;
      }
      if (screen === "browser-guide" && navigation.screen !== "browser-guide") {
        browserGuidePendingNavigationRef.current = nextNavigation;
        browserGuideRestoringHistoryRef.current = true;
        setBrowserGuideExitDirection("right");
        setBrowserGuideClosing(true);
        window.history.forward();
        return;
      }
      if (screen === "location" && navigation.screen !== "location" && !locationCloseTarget && !formPendingNavigationRef.current) {
        formPendingNavigationRef.current = nextNavigation;
        formRestoringHistoryRef.current = true;
        setLocationCloseTarget("history");
        setLocationMotion("exit-right");
        window.history.forward();
        return;
      }
      if (screen === "location-request" && navigation.screen !== "location-request" && !locationRequestClosing && !formPendingNavigationRef.current) {
        formPendingNavigationRef.current = nextNavigation;
        formRestoringHistoryRef.current = true;
        setLocationRequestClosing(true);
        window.history.forward();
        return;
      }
      if (screen === "pet" && navigation.screen === "walks" && !formClosing) {
        formPendingNavigationRef.current = nextNavigation;
        formRestoringHistoryRef.current = true;
        setFormCloseTarget("walks");
        setDockTransitionVisible(true);
        setFormClosing(true);
        window.history.forward();
        return;
      }
      setAnimateMenuOpen(false);
      applyNavigationState(nextNavigation);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [applyNavigationState, formClosing, locationCloseTarget, locationRequestClosing, screen]);

  useEffect(() => {
    let active = true;

    fetch("/api/locations")
      .then(async (response) => {
        const data = await response.json() as { locations?: AvailableLocation[]; error?: string };
        if (!response.ok || !Array.isArray(data.locations)) {
          throw new Error(data.error || "Не удалось загрузить список локаций.");
        }
        if (!active) return;
        setAvailableLocations(data.locations);
        setLocation((current) => normalizeLocationSelection(current, data.locations!));
        setLocationDraft((current) => normalizeLocationSelection(current, data.locations!));
      })
      .catch((error) => {
        if (active) setLocationsError(error instanceof Error ? error.message : "Не удалось загрузить список локаций.");
      })
      .finally(() => { if (active) setLocationsLoaded(true); });

    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (!sessionReady) return;

    fetch("/api/pets")
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json() as { pets?: Pet[] };
        if (active && Array.isArray(data.pets)) setSavedPets(data.pets);
      })
      .catch(() => undefined)
      .finally(() => { if (active) setPetsLoaded(true); });

    return () => { active = false; };
  }, [sessionReady]);

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
    let active = true;
    if (!sessionReady) return;

    fetch("/api/walks?scope=mine")
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json() as { walks?: ApiWalk[] };
        if (active && Array.isArray(data.walks)) setMyWalks(data.walks);
      })
      .catch(() => undefined)
      .finally(() => { if (active) setMyWalksLoaded(true); });

    return () => { active = false; };
  }, [sessionReady]);

  useEffect(() => {
    let active = true;
    if (!sessionReady || !location.city || !location.district || !location.complex) {
      return;
    }
    const params = new URLSearchParams({
      city: location.city,
      district: location.district,
      complex: location.complex
    });

    fetch(`/api/walks?${params}`)
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json() as { walks?: ApiWalk[] };
        if (active && Array.isArray(data.walks)) setSavedWalks(data.walks.map(apiWalkToCard));
      })
      .catch(() => undefined)
      .finally(() => { if (active) setWalksLoaded(true); });

    return () => { active = false; };
  }, [sessionReady, location.city, location.district, location.complex]);

  useEffect(() => {
    let active = true;
    if (!sessionReady || !location.city || !location.district || !location.complex) {
      return;
    }
    const params = new URLSearchParams({
      city: location.city,
      district: location.district,
      complex: location.complex
    });

    fetch(`/api/places?${params}`)
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json() as { places?: SharedPlace[] };
        if (active && Array.isArray(data.places)) setSharedPlaces(data.places);
      })
      .catch(() => undefined)
      .finally(() => { if (active) setPlacesLoaded(true); });

    return () => { active = false; };
  }, [sessionReady, location.city, location.district, location.complex]);

  useEffect(() => {
    if (!walkPendingDelete && !petPendingDelete) return;
    if (walkPendingDelete || petPendingDelete) deleteCancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (walkPendingDelete) {
        if (!walkDeleting) setWalkPendingDelete(null);
      } else if (petPendingDelete) {
        if (!petDeleting) setPetPendingDelete(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [petDeleting, petPendingDelete, walkDeleting, walkPendingDelete]);

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
    if (filterMotion !== "exit-left" && filterMotion !== "exit-right") return;
    const movesRight = filterMotion === "exit-left";
    const exitTimer = window.setTimeout(() => {
      setDisplayedPeriod(period);
      setFilterMotion(movesRight ? "enter-right" : "enter-left");
    }, 120);
    return () => window.clearTimeout(exitTimer);
  }, [filterMotion, period]);

  useEffect(() => {
    if (filterMotion !== "enter-left" && filterMotion !== "enter-right") return;
    const enterTimer = window.setTimeout(() => setFilterMotion("idle"), 170);
    return () => window.clearTimeout(enterTimer);
  }, [filterMotion]);

  const visibleWalks = useMemo(
    () => displayedPeriod === "Все" ? savedWalks : savedWalks.filter((walk) => walk.period === displayedPeriod),
    [displayedPeriod, savedWalks]
  );
  const ownedWalksById = useMemo(
    () => new Map(myWalks.map((walk) => [walk.id, walk])),
    [myWalks]
  );
  const petsById = useMemo(
    () => new Map(savedPets.map((pet) => [pet.id, pet])),
    [savedPets]
  );
  const locationCityOptions = useMemo(
    () => uniqueLocationValues(availableLocations.map((row) => row.city)).map((value) => ({ value, label: value })),
    [availableLocations]
  );
  const locationDistrictOptions = useMemo(
    () => uniqueLocationValues(availableLocations
      .filter((row) => row.city === locationDraft.city)
      .map((row) => row.district))
      .map((value) => ({ value, label: value })),
    [availableLocations, locationDraft.city]
  );
  const locationComplexOptions = useMemo(
    () => uniqueLocationValues(availableLocations
      .filter((row) => row.city === locationDraft.city && row.district === locationDraft.district)
      .map((row) => row.complex))
      .map((value) => ({ value, label: value })),
    [availableLocations, locationDraft.city, locationDraft.district]
  );
  const normalizedPlaceInput = normalizePlaceForComparison(placeInput);
  const matchingSharedPlaces = useMemo(
    () => sharedPlaces.filter(
      (place) => !normalizedPlaceInput || normalizePlaceForComparison(place.name).includes(normalizedPlaceInput)
    ),
    [normalizedPlaceInput, sharedPlaces]
  );
  const placeSuggestionsVisible = placeMenuOpen && (
    !normalizedPlaceInput || (placesLoaded && matchingSharedPlaces.length > 0)
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
  const petFormIsValid = petNameIsValid && ownerNameIsValid && breedIsValid;
  const placeIsValid = containsLetter.test(placeInput.trim()) && placeInput.trim().length <= MAX_WALK_PLACE_LENGTH;
  const timeIsValid = /^([01]\d|2[0-3]):[0-5]\d$/.test(walkTime);
  const walkFormIsValid = Boolean(selectedPetId && placeIsValid && timeIsValid);

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
    setLocationRequestClosing(false);
    setLocationMotion("enter-right");
    pushNavigation("location-request");
  }

  function leaveLocationRequest() {
    if (locationRequestClosing) return;
    setLocationRequestError("");
    setTouchedFields({});
    setLocationRequestClosing(true);
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
      const response = await fetch("/api/location-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(locationRequestDraft)
      });
      const data = await response.json() as { request?: { id: string }; error?: string };
      if (!response.ok || !data.request) {
        throw new Error(data.error || "Не удалось отправить заявку.");
      }

      setLocationOpenedFromMenu(false);
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

    const movesRight = periodOptions.indexOf(nextPeriod) > periodOptions.indexOf(period);
    setPeriod(nextPeriod);
    setFilterMotion(movesRight ? "exit-left" : "exit-right");
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
      const response = await fetch("/api/session", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ location: locationDraft })
      });
      const data = await response.json() as {
        location?: Location | null;
        hasLocation?: boolean;
        error?: string;
      };
      if (!response.ok || !data.hasLocation || !data.location) {
        throw new Error(data.error || "Не удалось сохранить локацию.");
      }

      const savedLocation = data.location;
      if (
        location.city !== savedLocation.city ||
        location.district !== savedLocation.district ||
        location.complex !== savedLocation.complex
      ) {
        setWalksLoaded(false);
        setSavedWalks([]);
        setPlacesLoaded(false);
        setSharedPlaces([]);
      }
      setLocation(savedLocation);
      setLocationDraft(savedLocation);
      setHasLocation(true);
      setTouchedFields({});
      if (locationOpenedFromMenu) {
        setLocationCloseTarget("walks");
        setLocationMotion("exit-right");
        return;
      }
      setLocationOpenedFromMenu(false);
      setLocationCloseTarget("walks");
      setLocationMotion("exit-left");
    } catch (error) {
      setLocationSubmitError(error instanceof Error ? error.message : "Не удалось сохранить локацию.");
    } finally {
      setLocationSaving(false);
    }
  }

  function leaveLocationScreen() {
    setLocationDraft(location);
    setTouchedFields({});

    if (locationOpenedFromMenu) {
      setLocationCloseTarget("menu");
      setLocationMotion("exit-right");
      return;
    }

    setLocationCloseTarget("history");
    setLocationMotion("exit-right");
  }

  function openLocationEditor() {
    setLocationDraft(location);
    setTouchedFields({});
    setLocationCloseTarget(null);
    setLocationMotion("enter-right");
    setLocationOpenedFromMenu(true);
    setMenuOpen(false);
    pushNavigation("location", { locationOpenedFromMenu: true });
  }

  function completeLocationClose() {
    const target = locationCloseTarget;
    setLocationMotion(null);
    if (formPendingNavigationRef.current) {
      formPendingNavigationRef.current = null;
      formFinalizingHistoryRef.current = true;
      window.history.back();
      return;
    }
    if (target === "menu") {
      returnThroughHistory();
    } else if (target === "walks") {
      if (locationOpenedFromMenu) {
        window.history.go(-2);
      } else {
        pushNavigation("walks");
      }
    } else if (target === "history") {
      returnThroughHistory();
    }
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
    setFormClosing(false);
    setFormCloseTarget(null);
    const source = screen === "my-pets" ? petsSource : null;
    setDockTransitionVisible(screen === "walks" || source === "dock");
    pushNavigation(nextScreen, { petsSource: source });
  }

  function beginFormClose(target: Screen, mode: "back" | "replace" = "back") {
    formCloseModeRef.current = mode;
    setFormCloseTarget(target);
    const currentNavigation = window.history.state as Partial<AppNavigationState> | null;
    if (target === "walks" || (target === "my-pets" && currentNavigation?.petsSource === "dock")) {
      setDockTransitionVisible(true);
    }
    setFormClosing(true);
  }

  function completeFormClose() {
    const target = formCloseTarget;
    if (!target) return;

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
      setPlaceMenuOpen(false);
      setScheduleType("today");
      setWalkTime("");
      setWalkComment("");
      setPlaceInput("");
      setTouchedFields({});
      setWalkSubmitError("");
      setGuidedWalkFlow(false);
      if (target === "my-walks" || target === "walks") setWalkBeingEdited(null);
    }

    if (formPendingNavigationRef.current) {
      formPendingNavigationRef.current = null;
      formFinalizingHistoryRef.current = true;
      setDockTransitionVisible(false);
      window.history.back();
    } else if (formCloseModeRef.current === "replace") {
      replaceNavigation(target);
    } else {
      if (target === "walks") setDockTransitionVisible(false);
      returnThroughHistory();
    }
    formCloseModeRef.current = "back";
  }

  function leavePetScreen() {
    if (petReturnTarget === "announce") {
      beginFormClose("walks");
    } else {
      beginFormClose("my-pets");
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
    const refreshTurn = rotate
      ? new Promise<void>((resolve) => window.setTimeout(resolve, 720))
      : Promise.resolve();
    if (rotate) {
      setPetShareRefreshing(true);
    } else {
      setPetToShare(pet);
      setPetShareLoading(true);
    }
    setPetShareError("");
    setPetShareCopied(false);
    try {
      const response = await fetch("/api/pet-shares", {
        method: rotate ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petId: pet.id })
      });
      const data = await response.json() as { link?: string; error?: string };
      if (!response.ok || !data.link) {
        throw new Error(data.error || "Не удалось получить ссылку.");
      }
      setPetShareLink(data.link);
    } catch (error) {
      setPetShareError(error instanceof Error ? error.message : "Не удалось получить ссылку.");
    } finally {
      if (rotate) {
        await refreshTurn;
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
    setTouchedFields({});
    setWalkSubmitError("");
    setSelectedPetId(savedPets.length === 1 ? savedPets[0].id : "");
    setPlaceInput("");
    setPlaceMenuOpen(false);
    setScheduleType("today");
    setWalkTime("");
    setWalkComment("");
    setWalkFormDirty(false);
  }

  function startWalkAnnouncement() {
    if (savedPets.length === 0) {
      setShowPetRequiredPopup(true);
      return;
    }
    prepareNewWalkAnnouncement();
    openFormScreen("announce");
  }

  function beginDockSlide(nextSection: DockPanelSection) {
    const fromSection = dockSlide?.to ?? dockVisibleSection;
    if (fromSection === nextSection) {
      setDockVisibleSection(nextSection);
      setDockSlide(null);
      return false;
    }

    const sectionOrder: Record<DockPanelSection, number> = {
      nearby: 1,
      walk: 2,
      profile: 3
    };
    setDockSlide({
      from: fromSection,
      to: nextSection,
      direction: sectionOrder[nextSection] > sectionOrder[fromSection] ? "forward" : "backward"
    });
    return true;
  }

  function startDockWalkAnnouncement() {
    if (savedPets.length === 0) {
      setShowPetRequiredPopup(true);
      return;
    }
    if (dockWalkOpen) return;
    const returnSection: PrimaryDockSection = dockSection === "nearby" || dockSection === "profile" ? dockSection : dockReturnSection;
    prepareNewWalkAnnouncement();
    setAnimateMenuOpen(true);
    setDockWalkClosing(false);
    const preserveDockSlide = beginDockSlide("walk");
    pushNavigation("walks", { dockWalkOpen: true, dockReturnSection: returnSection }, preserveDockSlide);
  }

  function closeDockWalkAnnouncement() {
    if (walkSaving || dockWalkClosing) return;
    setDockWalkClosing(true);
    beginDockSlide(dockReturnSection === "profile" ? "profile" : "nearby");
  }

  function editWalk(walk: ApiWalk, returnTarget: WalkEditReturnTarget = "my-walks") {
    setWalkBeingEdited(walk);
    setWalkEditReturnTarget(returnTarget);
    setGuidedWalkFlow(false);
    setTouchedFields({});
    setWalkSubmitError("");
    setSelectedPetId(walk.petId);
    setPlaceInput(walk.point);
    setPlaceMenuOpen(false);
    setScheduleType(walk.scheduleType);
    setWalkTime(walk.walkTime.slice(0, 5));
    setWalkComment(walk.comment?.slice(0, MAX_WALK_COMMENT_LENGTH) ?? "");
    openFormScreen("announce");
  }

  function leaveWalkScreen() {
    if (dockWalkOpen) {
      closeDockWalkAnnouncement();
      return;
    }
    if (walkBeingEdited) {
      beginFormClose(walkEditReturnTarget);
      return;
    }
    beginFormClose("walks");
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

  function updatePlaceInput(value: string) {
    const normalizedValue = normalizePlaceForComparison(value);
    const existingPlace = sharedPlaces.find(
      (place) => normalizePlaceForComparison(place.name) === normalizedValue
    );
    const hasMatches = !normalizedValue || sharedPlaces.some(
      (place) => normalizePlaceForComparison(place.name).includes(normalizedValue)
    );
    setPlaceInput(existingPlace?.name ?? value);
    setWalkSubmitError("");
    setPlaceMenuOpen(hasMatches);
  }

  function chooseSharedPlace(place: SharedPlace) {
    setPlaceInput(place.name);
    setPlaceMenuOpen(false);
  }

  function refreshPets() {
    fetch("/api/pets")
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json() as { pets?: Pet[] };
        if (Array.isArray(data.pets)) setSavedPets(data.pets);
      })
      .catch(() => undefined);
  }

  function openCollectionScreen(nextScreen: "my-walks" | "my-pets", source: AppNavigationState["petsSource"] = null) {
    if (nextScreen === "my-walks" && screen === "walks" && dockVisibleSection === "profile") {
      setCollectionClosing(false);
      setDockTransitionVisible(true);
      setProfileTransitionTarget("my-walks");
      return;
    }
    if (nextScreen === "my-pets" && source === "dock" && screen === "walks" && dockWalkOpen) {
      setCollectionClosing(false);
      setPetsDockDirection("forward");
      setProfileTransitionTarget("my-pets");
      refreshPets();
      return;
    }
    if (nextScreen === "my-pets" && source === "profile" && screen === "walks" && dockVisibleSection === "profile") {
      setCollectionClosing(false);
      setDockTransitionVisible(true);
      setPetsDockDirection("forward");
      setProfileTransitionTarget("my-pets");
      refreshPets();
      return;
    }
    if (nextScreen === "my-pets") {
      setPetsDockDirection(source === "dock" && dockSection === "profile" ? "backward" : "forward");
      setDockTransitionVisible(source === "profile");
    }
    setCollectionClosing(false);
    setMenuOpen(false);
    pushNavigation(nextScreen, { petsSource: nextScreen === "my-pets" ? source : null });
    if (nextScreen === "my-pets") refreshPets();
  }

  function returnToMenu() {
    if (screen === "my-pets" && !petsSource) {
      returnThroughHistory();
      return;
    }
    if (screen === "my-pets" && petsSource === "dock") {
      setDockSection("nearby");
      setPetsTransitionTarget("nearby");
    }
    if (screen === "my-pets" && petsSource === "profile") {
      setPetsTransitionTarget("profile");
      setDockTransitionVisible(true);
    }
    if (screen === "my-walks") {
      setProfileTransitionTarget("profile");
      setDockTransitionVisible(true);
    }
    setCollectionClosing(true);
  }

  function completeCollectionClose() {
    if (petsTransitionTarget === "walk") {
      pushNavigation("walks", { dockWalkOpen: true, dockReturnSection: "nearby" });
      return;
    }
    if (petsTransitionTarget === "nearby") {
      replaceNavigation("walks", { menuOpen: false, dockWalkOpen: false, dockReturnSection: "nearby" });
      return;
    }
    returnThroughHistory();
  }

  function openMenu() {
    if (menuOpen) return;
    setDockSection("profile");
    setAnimateMenuOpen(true);
    setMenuClosing(false);
    const preserveDockSlide = beginDockSlide("profile");
    pushNavigation("walks", { menuOpen: true }, preserveDockSlide);
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

    setAnimateMenuOpen(true);
    setMenuClosing(false);
    setDockWalkClosing(false);
    const preserveDockSlide = beginDockSlide("nearby");
    replaceNavigation("walks", {
      menuOpen: false,
      dockWalkOpen: false,
      dockReturnSection: nextSection
    }, preserveDockSlide);
  }

  function handleDockWalkAction() {
    if (!dockWalkOpen) {
      if (screen === "my-pets" && petsSource === "dock") {
        if (savedPets.length === 0) {
          setShowPetRequiredPopup(true);
          return;
        }
        prepareNewWalkAnnouncement();
        setAnimateMenuOpen(true);
        setDockWalkClosing(false);
        setDockReturnSection("nearby");
        setDockSection("walk");
        setPetsTransitionTarget("walk");
        setCollectionClosing(true);
        return;
      }
      selectDockSection("walk");
      return;
    }
    if (!walkFormDirty || !walkFormIsValid || walkSaving || walkSaved) return;
    dockWalkFormRef.current?.requestSubmit();
  }

  function renderBottomDock(motion: DockMotion | null = null) {
    return (
      <nav
        className={`walks-bottom-dock ${motion ? `walks-bottom-dock--${motion}` : ""}`}
        aria-label="Основная навигация"
        onAnimationEnd={(event) => {
          if (
            event.target === event.currentTarget &&
            dockTransitionVisible &&
            (event.animationName === "dock-pane-exit-left" || event.animationName === "dock-pane-exit-right")
          ) setDockTransitionVisible(false);
        }}
      >
        <button
          className={`dock-item dock-item--nearby ${dockSection === "nearby" ? "is-active" : ""}`}
          type="button"
          aria-current={dockSection === "nearby" ? "page" : undefined}
          onClick={() => selectDockSection("nearby")}
        >
          <span className="dock-item-icon dock-item-icon--nearby" aria-hidden="true">
            <span className="dock-icon-fill" />
            <span className="dock-item-nearby-glyph" />
          </span>
          <span>Рядом</span>
        </button>
        <button
          className={`dock-item dock-item--walk ${dockSection === "walk" ? "is-active" : ""} ${dockWalkOpen && walkFormDirty ? "is-form-dirty" : ""} ${dockWalkOpen && walkFormDirty && walkFormIsValid ? "is-save-ready" : ""}`}
          type="button"
          disabled={!petsLoaded || walkSaving || walkSaved || (dockWalkOpen && !walkFormIsValid)}
          aria-current={dockSection === "walk" ? "page" : undefined}
          aria-label={dockWalkOpen
            ? walkFormDirty && walkFormIsValid
              ? "Сохранить прогулку"
              : walkFormDirty
                ? "Заполните обязательные поля"
                : "Форма прогулки не изменена"
            : "Создать прогулку"}
          onClick={handleDockWalkAction}
        >
          <span className="dock-item-icon">
            <span className="dock-icon-fill" />
            <Plus className="dock-walk-state-icon dock-walk-state-icon--plus" aria-hidden="true" />
            <Check className="dock-walk-state-icon dock-walk-state-icon--check" aria-hidden="true" />
          </span>
          <span className="dock-walk-label" aria-hidden="true">
            <span className="dock-walk-label-text dock-walk-label-text--default">Прогулка</span>
            <span className="dock-walk-label-text dock-walk-label-text--save">Сохранить</span>
          </span>
        </button>
        <button
          className={`dock-item dock-item--pets ${dockSection === "pets" ? "is-active" : ""}`}
          type="button"
          aria-current={dockSection === "pets" ? "page" : undefined}
          onClick={() => { if (dockSection !== "pets") openCollectionScreen("my-pets", "dock"); }}
        >
          <span className="dock-item-icon"><span className="dock-icon-fill" /><PawPrint aria-hidden="true" /></span>
          <span>Питомцы</span>
        </button>
        <button
          className={`dock-item dock-item--profile ${dockSection === "profile" ? "is-active" : ""}`}
          type="button"
          aria-label="Открыть профиль"
          aria-expanded={menuOpen}
          aria-current={dockSection === "profile" ? "page" : undefined}
          onClick={() => selectDockSection("profile")}
        >
          <span className="dock-item-icon"><span className="dock-icon-fill" /><UserRound aria-hidden="true" /></span>
          <span>Профиль</span>
        </button>
      </nav>
    );
  }

  async function savePet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const savingStartedAt = Date.now();
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
      const response = await fetch("/api/pets", {
        method: editedPet ? "PATCH" : "POST",
        body: formData
      });
      const data = await response.json() as { pet?: Pet; error?: string };
      if (!response.ok || !data.pet) {
        throw new Error(data.error || "Не удалось сохранить питомца.");
      }

      setSavedPets((current) => [data.pet!, ...current.filter((pet) => pet.id !== data.pet!.id)]);
      setSavedWalks((current) => current.map((walk) => walk.petId === data.pet!.id ? {
        ...walk,
        pet: data.pet!.name,
        breed: data.pet!.breed,
        owner: data.pet!.ownerName,
        image: data.pet!.photoUrl
      } : walk));
      setMyWalks((current) => current.map((walk) => walk.petId === data.pet!.id ? {
        ...walk,
        pet: data.pet!.name,
        breed: data.pet!.breed,
        owner: data.pet!.ownerName,
        image: data.pet!.photoUrl
      } : walk));
      setPetSaved(true);
      const remainingLoaderTime = Math.max(600 - (Date.now() - savingStartedAt), 0);
      window.setTimeout(() => {
        setPetSaved(false);
        setPetSaving(false);
        if (returnTarget === "announce") {
          setPetReturnTarget("my-pets");
          setSelectedPetId(data.pet!.id);
          beginFormClose("announce", "replace");
        } else {
          beginFormClose("my-pets");
        }
      }, remainingLoaderTime);
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
    const petId = formData.get("pet");
    const submittedPlace = String(formData.get("place") ?? "").trim();
    const submittedWalkTime = formData.get("walkTime");
    const savingStartedAt = Date.now();
    if (typeof petId !== "string" || !petId) {
      touchField("walk-pet");
      setWalkSubmitError("");
      return;
    }
    if (!containsLetter.test(submittedPlace) || submittedPlace.length > MAX_WALK_PLACE_LENGTH) {
      touchField("walk-place");
      setWalkSubmitError("");
      return;
    }
    if (typeof submittedWalkTime !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(submittedWalkTime)) {
      touchField("walk-time");
      setWalkSubmitError("");
      return;
    }
    setWalkSaving(true);
    setWalkSubmitError("");

    try {
      const response = await fetch("/api/walks", {
        method: editedWalk ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walkId: editedWalk?.id,
          petId,
          place: submittedPlace,
          comment: walkComment.trim(),
          scheduleType,
          walkTime: submittedWalkTime,
          city: editedWalk?.city ?? location.city,
          district: editedWalk?.district ?? location.district,
          complex: editedWalk?.complex ?? location.complex
        })
      });
      const data = await response.json() as { walk?: ApiWalk; error?: string };
      if (!response.ok || !data.walk) {
        throw new Error(data.error || "Не удалось сохранить прогулку.");
      }

      const belongsToSavedLocation = data.walk.city === location.city &&
        data.walk.district === location.district &&
        data.walk.complex === location.complex;
      const appearsToday = scheduleType === "today" || scheduleType === "always";
      setSavedWalks((current) => {
        const withoutEditedWalk = current.filter((walk) => walk.id !== data.walk!.id);
        return belongsToSavedLocation && appearsToday
          ? [apiWalkToCard(data.walk!), ...withoutEditedWalk]
          : withoutEditedWalk;
      });
      setSharedPlaces((current) => current.some((place) => place.id === data.walk!.placeId)
        ? current
        : [...current, { id: data.walk!.placeId, name: data.walk!.point }]
          .sort((left, right) => left.name.localeCompare(right.name, "ru")));
      setMyWalks((current) => [data.walk!, ...current.filter((walk) => walk.id !== data.walk!.id)]);
      setWalkSaved(true);
      const remainingLoaderTime = Math.max(600 - (Date.now() - savingStartedAt), 0);
      window.setTimeout(() => {
        setWalkSaved(false);
        setWalkSaving(false);
        setGuidedWalkFlow(false);
        if (dockWalkOpen && !editedWalk) {
          closeDockWalkAnnouncement();
        } else {
          beginFormClose(editedWalk ? editReturnTarget : "walks");
        }
      }, remainingLoaderTime);
    } catch (error) {
      setWalkSubmitError(error instanceof Error ? error.message : "Не удалось сохранить прогулку.");
      setWalkSaving(false);
    }
  }

  async function deleteWalk() {
    if (!walkPendingDelete || walkDeleting) return;

    setWalkDeleting(true);
    setWalkDeleteError("");
    try {
      const response = await fetch("/api/walks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walkId: walkPendingDelete.id })
      });
      const data = await response.json() as { deleted?: boolean; error?: string };
      if (!response.ok || !data.deleted) {
        throw new Error(data.error || "Не удалось удалить прогулку.");
      }

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
      const response = await fetch("/api/pets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petId: petPendingDelete.id })
      });
      const data = await response.json() as { deleted?: boolean; detached?: boolean; error?: string };
      if (!response.ok || !data.deleted) {
        throw new Error(data.error || "Не удалось удалить питомца.");
      }

      const deletedId = petPendingDelete.id;
      setSavedPets((current) => current.filter((pet) => pet.id !== deletedId));
      if (!data.detached) {
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

  const renderWalkAnnouncementContent = (inDock = false) => (
    <>
      {!inDock && (guidedWalkFlow ? (
        <div className="guided-form-topbar">
          <button className="icon-button back-button" type="button" aria-label="Назад к прогулкам" onClick={leaveWalkScreen}>
            <ArrowLeft />
          </button>
          <WalkSetupStepper step={2} />
        </div>
      ) : (
        <button className="icon-button back-button" type="button" aria-label={walkBeingEdited ? "Назад к моим прогулкам" : "Назад к прогулкам"} onClick={leaveWalkScreen}>
          <ArrowLeft />
        </button>
      ))}
      <div className="screen-heading">
        <h1 id={inDock ? "dock-walk-title" : undefined}>Сообщить о прогулке</h1>
        <p>Укажите, с кем, где и когда вы будете гулять</p>
      </div>
      <form ref={inDock ? dockWalkFormRef : undefined} className="announce-form" onSubmit={saveWalk} aria-busy={walkSaving} noValidate>
        <div className="field">
          <span>Ваш питомец</span>
          <DropdownSelect
            id="walk-pet"
            name="pet"
            ariaLabel="Ваш питомец"
            value={selectedPetId}
            options={savedPets.map((pet) => ({ value: pet.id, label: pet.name }))}
            placeholder={savedPets.length === 0 ? "Сначала добавьте питомца" : "Выберите питомца"}
            emptyText="У вас пока нет добавленных питомцев"
            disabled={savedPets.length === 0}
            invalid={Boolean(touchedFields["walk-pet"] && !selectedPetId)}
            describedBy={touchedFields["walk-pet"] && !selectedPetId ? "walk-pet-hint" : undefined}
            onBlur={() => touchField("walk-pet")}
            onChange={(petId) => { if (inDock) setWalkFormDirty(true); setSelectedPetId(petId); setWalkSubmitError(""); }}
          />
          {touchedFields["walk-pet"] && !selectedPetId && <p className="validation-hint" id="walk-pet-hint">Выберите питомца</p>}
        </div>
        <div className="field text-field place-field">
          <label htmlFor="walk-place">Место прогулки</label>
          <div
            className="place-combobox"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setPlaceMenuOpen(false);
                touchField("walk-place");
              }
            }}
          >
            <input
              id="walk-place"
              name="place"
              value={placeInput}
              required
              maxLength={MAX_WALK_PLACE_LENGTH}
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-controls="shared-place-options"
              aria-expanded={placeSuggestionsVisible}
              aria-invalid={Boolean(touchedFields["walk-place"] && !placeIsValid)}
              aria-describedby={touchedFields["walk-place"] && !placeIsValid ? "walk-place-hint" : undefined}
              placeholder="Выберите место или укажите своё"
              onFocus={() => setPlaceMenuOpen(true)}
              onChange={(event) => { if (inDock) setWalkFormDirty(true); updatePlaceInput(event.target.value); }}
            />
            <button
              className="place-menu-toggle"
              type="button"
              aria-label={placeSuggestionsVisible ? "Закрыть список мест" : "Открыть список мест"}
              aria-expanded={placeSuggestionsVisible}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                if (placeSuggestionsVisible) {
                  setPlaceMenuOpen(false);
                } else if (!normalizedPlaceInput || matchingSharedPlaces.length > 0) {
                  setPlaceMenuOpen(true);
                }
              }}
            >
              <ChevronDown aria-hidden="true" />
            </button>
            {placeSuggestionsVisible && (
              <div className="place-options" id="shared-place-options" role="listbox" aria-label="Общие места прогулок">
                {!placesLoaded ? (
                  <p className="place-options-status">Загружаем места…</p>
                ) : matchingSharedPlaces.length > 0 ? matchingSharedPlaces.map((place) => (
                  <button
                    className="place-option"
                    key={place.id}
                    type="button"
                    role="option"
                    aria-selected={normalizePlaceForComparison(place.name) === normalizePlaceForComparison(placeInput)}
                    onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                    onClick={(event) => { event.preventDefault(); event.stopPropagation(); if (inDock) setWalkFormDirty(true); chooseSharedPlace(place); }}
                  >
                    {place.name}
                  </button>
                )) : (
                  <p className="place-options-status">Пока нет добавленных мест</p>
                )}
              </div>
            )}
          </div>
          {touchedFields["walk-place"] && !placeIsValid && (
            <p className="validation-hint" id="walk-place-hint">
              {placeInput.trim().length > MAX_WALK_PLACE_LENGTH
                ? `Название места должно содержать не более ${MAX_WALK_PLACE_LENGTH} символов`
                : placeInput.trim() ? "Название места должно содержать хотя бы одну букву" : "Укажите место прогулки"}
            </p>
          )}
        </div>
        <fieldset className="schedule-field">
          <legend>День прогулки</legend>
          <div className="filters schedule-buttons">
            <span className="filter-indicator schedule-indicator" aria-hidden="true" style={{ left: scheduleIndicatorLeft[scheduleType] }} />
            {([ ["today", "Сегодня"], ["tomorrow", "Завтра"], ["always", "Всегда"] ] as Array<[ScheduleType, string]>).map(([value, label]) => (
              <button key={value} type="button" className={`filter-button schedule-button ${scheduleType === value ? "active" : ""}`} aria-pressed={scheduleType === value} onClick={() => changeWalkScheduleType(value, inDock)}>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <span>Время прогулки</span>
          <TimeDropdown
            value={walkTime}
            futureOnly={scheduleType === "today"}
            invalid={Boolean(!walkTimePickerOpen && touchedFields["walk-time"] && !timeIsValid)}
            describedBy={!walkTimePickerOpen && touchedFields["walk-time"] && !timeIsValid ? "walk-time-hint" : undefined}
            onOpenChange={(open) => { setWalkTimePickerOpen(open); if (!open) touchField("walk-time"); }}
            onChange={(time) => { if (inDock) setWalkFormDirty(true); setWalkTime(time); setWalkSubmitError(""); }}
          />
          {!walkTimePickerOpen && touchedFields["walk-time"] && !timeIsValid && <p className="validation-hint" id="walk-time-hint">Выберите время прогулки</p>}
        </div>
        <div className="field comment-field">
          <label htmlFor="walk-comment">Комментарий <span>(необязательно)</span></label>
          <input id="walk-comment" name="comment" maxLength={MAX_WALK_COMMENT_LENGTH} value={walkComment} placeholder="Например, возьмём мячик" onChange={(event) => { if (inDock) setWalkFormDirty(true); setWalkComment(event.target.value); }} />
          <small>{walkComment.length}/{MAX_WALK_COMMENT_LENGTH}</small>
        </div>
        {(walkSubmitError || savedPets.length === 0) && <p className="error-message" role="alert">{walkSubmitError || "Сначала добавьте питомца через меню."}</p>}
        {!inDock && (
          <button className="primary-button form-submit" type="submit" disabled={!walkFormIsValid || walkSaving || walkSaved}>
            {walkSaved
              ? <><CheckCircle2 /> {walkBeingEdited ? "Изменения сохранены" : "Прогулка добавлена"}</>
              : walkSaving ? "Сохраняем…" : walkBeingEdited ? "Сохранить" : "Сообщить о прогулке"}
          </button>
        )}
      </form>
      {walkSaving && (
        <div className="saving-overlay" role="status" aria-live="polite">
          <span className="saving-spinner" aria-hidden="true" />
          <p>Информация о прогулке сохраняется</p>
        </div>
      )}
    </>
  );

  if (screen === null) {
    return (
      <main className="page-shell">
        <section className="app-shell restoring-shell" aria-label="Сервис совместных прогулок" aria-busy="true">
          {sessionError ? (
            <div className="session-error" role="alert">
              <p>{sessionError}</p>
              <button className="primary-button" type="button" onClick={() => {
                setSessionError("");
                sessionBootstrapPromise = null;
                setSessionAttempt((value) => value + 1);
              }}>
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

  const isProfileReturning = petsTransitionTarget === "profile" || profileTransitionTarget === "profile";
  const dockMotion: DockMotion | null = isProfileReturning
    ? "enter-left"
    : dockTransitionVisible && formClosing
      ? "enter-left"
    : profileTransitionTarget === "my-walks" ||
        profileTransitionTarget === "my-pets" ||
        (screen === "my-pets" && petsSource === "profile") ||
          ((screen === "pet" || screen === "announce") && dockTransitionVisible)
      ? "exit-left"
      : null;
  const hasStaticSurface =
    isProfileReturning ||
    screen === "pet" ||
    screen === "announce" ||
    screen === "browser-guide" ||
    (screen === "my-pets" && petsSource === "dock") ||
    (screen === "walks" && (dockVisibleSection !== "nearby" || dockSlide !== null));
  const surfaceExitDirection =
    screen === "walks" && dockSlide?.to === "nearby"
      ? "right"
      : screen === "my-pets" && petsSource === "dock" && collectionClosing && petsTransitionTarget !== "walk"
        ? petsDockDirection === "backward" ? "left" : "right"
        : null;

  return (
    <main className="page-shell">
      <section className={`app-shell screen-${screen}`} aria-label="Сервис совместных прогулок">
        <span className="walks-dog-background" aria-hidden="true" />
        {hasStaticSurface && (
          <span className={`app-surface-background ${surfaceExitDirection ? `app-surface-background--exit-${surfaceExitDirection}` : ""}`} aria-hidden="true" />
        )}
        {(screen === "walks" || (screen === "my-pets" && petsSource === "dock") || dockTransitionVisible || isProfileReturning) && renderBottomDock(dockMotion)}
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
          <div
            className={`screen browser-guide-screen animated-form-screen ${browserGuideClosing ? `animated-form-screen--exit-${browserGuideExitDirection}` : "animated-form-screen--enter"}`}
            onAnimationEnd={(event) => {
              if (
                event.target === event.currentTarget &&
                (event.animationName === "dock-pane-exit-left" || event.animationName === "dock-pane-exit-right") &&
                browserGuideClosing
              ) completeBrowserGuideClose();
            }}
          >
            <button className="icon-button back-button" type="button" aria-label="Назад" onClick={returnThroughHistory}>
              <ArrowLeft />
            </button>

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
          <div
            className={`screen form-screen location-screen ${locationMotion ? `animated-form-screen animated-form-screen--${locationMotion}` : locationOpenedFromMenu ? "animated-form-screen animated-form-screen--enter" : "location-default"}`}
            onAnimationEnd={(event) => {
              if (
                event.target === event.currentTarget &&
                (event.animationName === "dock-pane-exit-left" || event.animationName === "dock-pane-exit-right") &&
                locationCloseTarget
              ) completeLocationClose();
            }}
          >
            <button className="icon-button back-button" type="button" aria-label={locationOpenedFromMenu ? "Назад в меню" : "Назад"} onClick={leaveLocationScreen}>
              <ArrowLeft />
            </button>
            <div className="screen-heading">
              <h1>Где будем гулять?</h1>
              <p>Выберите локацию, чтобы увидеть прогулки рядом</p>
            </div>
            <form className="location-form" onSubmit={saveLocation} noValidate>
              <div className="field">
                <span>Город</span>
                <DropdownSelect
                  id="location-city"
                  ariaLabel="Город"
                  value={locationDraft.city}
                  options={locationCityOptions}
                  placeholder={locationsLoaded ? "Выберите город" : "Загружаем города…"}
                  emptyText="Пока нет доступных городов"
                  disabled={!locationsLoaded || locationCityOptions.length === 0}
                  invalid={Boolean(touchedFields["location-city"] && !locationDraft.city)}
                  describedBy={touchedFields["location-city"] && !locationDraft.city ? "location-city-hint" : undefined}
                  onBlur={() => touchField("location-city")}
                  onChange={chooseLocationCity}
                />
                {touchedFields["location-city"] && !locationDraft.city && <p className="validation-hint" id="location-city-hint">Выберите город</p>}
              </div>
              <div className="field">
                <span>Район</span>
                <DropdownSelect
                  id="location-district"
                  ariaLabel="Район"
                  value={locationDraft.district}
                  options={locationDistrictOptions}
                  placeholder={locationsLoaded ? "Выберите район" : "Загружаем районы…"}
                  emptyText="Пока нет доступных районов"
                  disabled={!locationsLoaded || locationDistrictOptions.length === 0}
                  invalid={Boolean(touchedFields["location-district"] && !locationDraft.district)}
                  describedBy={touchedFields["location-district"] && !locationDraft.district ? "location-district-hint" : undefined}
                  onBlur={() => touchField("location-district")}
                  onChange={chooseLocationDistrict}
                />
                {touchedFields["location-district"] && !locationDraft.district && <p className="validation-hint" id="location-district-hint">Выберите район</p>}
              </div>
              <div className="field">
                <span>Жилой комплекс</span>
                <DropdownSelect
                  id="location-complex"
                  ariaLabel="Жилой комплекс"
                  value={locationDraft.complex}
                  options={locationComplexOptions}
                  placeholder={locationsLoaded ? "Выберите жилой комплекс" : "Загружаем жилые комплексы…"}
                  emptyText="Пока нет доступных жилых комплексов"
                  disabled={!locationsLoaded || locationComplexOptions.length === 0}
                  invalid={Boolean(touchedFields["location-complex"] && !locationDraft.complex)}
                  describedBy={touchedFields["location-complex"] && !locationDraft.complex ? "location-complex-hint" : undefined}
                  onBlur={() => touchField("location-complex")}
                  onChange={(complex) => setLocationDraft({ ...locationDraft, complex })}
                />
                {touchedFields["location-complex"] && !locationDraft.complex && <p className="validation-hint" id="location-complex-hint">Выберите жилой комплекс</p>}
              </div>
              {(locationsError || locationSubmitError) && <p className="error-message" role="alert">{locationsError || locationSubmitError}</p>}
              <div className="location-form-footer">
                <p className="location-request-prompt">
                  Нет вашего города, района, жилого комплекса?{" "}
                  <button type="button" onClick={openLocationRequest}>Оставьте заявку</button>
                </p>
                <button className="primary-button form-submit" type="submit" disabled={!locationFormIsValid || locationSaving}>
                  {locationSaving ? "Сохраняем…" : hasLocation ? "Сохранить" : "Продолжить"}
                </button>
              </div>
            </form>
          </div>
        )}

        {screen === "location-request" && (
          <div
            className={`screen form-screen location-screen location-request-screen animated-form-screen ${locationRequestClosing ? "animated-form-screen--exit-right" : "animated-form-screen--enter-right"}`}
            onAnimationEnd={(event) => {
              if (
                event.target === event.currentTarget &&
                event.animationName === "dock-pane-exit-right" &&
                locationRequestClosing
              ) {
                setLocationRequestClosing(false);
                setLocationMotion(null);
                if (formPendingNavigationRef.current) {
                  formPendingNavigationRef.current = null;
                  formFinalizingHistoryRef.current = true;
                  window.history.back();
                } else {
                  returnThroughHistory();
                }
              }
            }}
          >
            <button className="icon-button back-button" type="button" aria-label="Назад к выбору локации" onClick={leaveLocationRequest}>
              <ArrowLeft />
            </button>
            <div className="screen-heading">
              <h1>Оставить заявку</h1>
              <p>Укажите вашу локацию и мы добавим её в ближайшее время</p>
            </div>
            <form className="location-form" onSubmit={sendLocationRequest} aria-busy={locationRequestSaving} noValidate>
              <label className="field text-field">
                <span>Город</span>
                <input
                  value={locationRequestDraft.city}
                  required
                  maxLength={80}
                  placeholder="Например, Москва"
                  aria-invalid={Boolean(touchedFields["request-city"] && !locationRequestCityIsValid)}
                  aria-describedby={touchedFields["request-city"] && !locationRequestCityIsValid ? "request-city-hint" : undefined}
                  onBlur={() => touchField("request-city")}
                  onChange={(event) => {
                    setLocationRequestDraft((current) => ({ ...current, city: event.target.value }));
                    setLocationRequestError("");
                  }}
                />
                {touchedFields["request-city"] && !locationRequestCityIsValid && (
                  <span className="validation-hint" id="request-city-hint">Введите название города</span>
                )}
              </label>
              <label className="field text-field">
                <span>Район</span>
                <input
                  value={locationRequestDraft.district}
                  required
                  maxLength={80}
                  placeholder="Например, Коммунарка"
                  aria-invalid={Boolean(touchedFields["request-district"] && !locationRequestDistrictIsValid)}
                  aria-describedby={touchedFields["request-district"] && !locationRequestDistrictIsValid ? "request-district-hint" : undefined}
                  onBlur={() => touchField("request-district")}
                  onChange={(event) => {
                    setLocationRequestDraft((current) => ({ ...current, district: event.target.value }));
                    setLocationRequestError("");
                  }}
                />
                {touchedFields["request-district"] && !locationRequestDistrictIsValid && (
                  <span className="validation-hint" id="request-district-hint">Введите название района</span>
                )}
              </label>
              <label className="field text-field">
                <span>Жилой комплекс</span>
                <input
                  value={locationRequestDraft.complex}
                  required
                  maxLength={120}
                  placeholder="Например, Дзен-Кварталы"
                  aria-invalid={Boolean(touchedFields["request-complex"] && !locationRequestComplexIsValid)}
                  aria-describedby={touchedFields["request-complex"] && !locationRequestComplexIsValid ? "request-complex-hint" : undefined}
                  onBlur={() => touchField("request-complex")}
                  onChange={(event) => {
                    setLocationRequestDraft((current) => ({ ...current, complex: event.target.value }));
                    setLocationRequestError("");
                  }}
                />
                {touchedFields["request-complex"] && !locationRequestComplexIsValid && (
                  <span className="validation-hint" id="request-complex-hint">Введите название жилого комплекса</span>
                )}
              </label>
              {locationRequestError && <p className="error-message" role="alert">{locationRequestError}</p>}
              <div className="location-form-footer">
                <button className="primary-button form-submit" type="submit" disabled={!locationRequestFormIsValid || locationRequestSaving}>
                  Отправить
                </button>
              </div>
            </form>
            {locationRequestSaving && (
              <div className="saving-overlay" role="status" aria-live="polite">
                <span className="saving-spinner" aria-hidden="true" />
                <p>Идёт отправка заявки</p>
              </div>
            )}
          </div>
        )}

        {(screen === "walks" || petsTransitionTarget || profileTransitionTarget === "profile") && (() => {
          const paneState = (section: DockPanelSection) => {
            if (petsTransitionTarget) return section === petsTransitionTarget ? "static" : "hidden";
            if (profileTransitionTarget === "profile") return section === "profile" ? "static" : "hidden";
            if (profileTransitionTarget === "my-walks" || profileTransitionTarget === "my-pets") {
              const fromSection = profileTransitionTarget === "my-pets" && dockWalkOpen ? "walk" : "profile";
              return section === fromSection ? "from" : "hidden";
            }
            if (!dockSlide) return section === dockVisibleSection ? "static" : "hidden";
            if (section === dockSlide.from) return "from";
            if (section === dockSlide.to) return "to";
            return "hidden";
          };
          const nearbyPane = paneState("nearby");
          const walkPane = paneState("walk");
          const profilePane = paneState("profile");
          const paneDirection = profileTransitionTarget === "my-walks" || profileTransitionTarget === "my-pets" ? "forward" : dockSlide?.direction;
          return (
          <div className={`screen walks-screen ${petsTransitionTarget || profileTransitionTarget === "profile" ? "walks-screen--collection-return" : ""}`}>
            <div
              className={`walks-screen-track ${!animateMenuOpen ? "walks-screen-track--instant" : ""}`}
              onAnimationEnd={(event) => {
                const pane = event.target as HTMLElement;
                if (pane.dataset.dockPane !== "to" || !event.animationName.startsWith("dock-pane-enter")) return;
                const nextSection = dockSlide?.to;
                if (!nextSection) return;
                setDockVisibleSection(nextSection);
                setDockSlide(null);
                if (!menuClosing && !dockWalkClosing) return;
                if (dockWalkClosing) setPlaceMenuOpen(false);
                returnThroughHistory();
              }}
            >
            <section
              className="walks-pane walks-pane--nearby"
              data-dock-pane={nearbyPane}
              data-dock-direction={paneDirection}
              aria-hidden={nearbyPane === "hidden"}
              inert={nearbyPane === "hidden" ? true : undefined}
            >
            <header className="walks-header">
              <div className="walks-heading-copy">
                <h1>Прогулки рядом</h1>
                <p>Сегодня · {location.complex}</p>
              </div>
            </header>

            <div className="filters" aria-label="Фильтр по времени">
              <span className="filter-indicator" aria-hidden="true" style={{ left: filterIndicatorLeft[period] }} />
              {periodOptions.map((item) => (
                <button key={item} type="button" className={`filter-button ${period === item ? "active" : ""}`} aria-pressed={period === item} onClick={() => selectPeriod(item)}>
                  <span>{item}</span>
                </button>
              ))}
            </div>

            <div className="walk-list">
              <div className={`walk-list-content ${filterMotion}`} aria-live="polite">
                {!walksLoaded ? (
                  <p className="visually-hidden" role="status">Загружаем прогулки</p>
                ) : visibleWalks.length === 0 ? (
                  <p className="empty-walks">
                    {savedWalks.length === 0 ? "Пока никто не сообщил о прогулке" : "В это время прогулок пока нет"}
                  </p>
                ) : visibleWalks.map((walk) => {
                  const ownedWalk = ownedWalksById.get(walk.id);
                  const shareablePet = petsById.get(walk.petId);
                  const hasCardActions = Boolean(ownedWalk || shareablePet?.canShare);
                  return (
                    <article className={`walk-card ${hasCardActions ? "walk-card--editable" : ""}`} key={walk.id}>
                      {hasCardActions && (
                        <div
                          className="walk-card-actions-menu"
                          role="toolbar"
                          aria-label={`Действия с прогулкой питомца ${walk.pet}`}
                          onBlur={(event) => {
                            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                              setOpenWalkActionsId(null);
                            }
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              setOpenWalkActionsId(null);
                              event.currentTarget.querySelector<HTMLButtonElement>(".walk-card-actions-trigger")?.focus();
                            }
                          }}
                        >
                          <button
                            className="walk-card-actions-trigger"
                            type="button"
                            aria-label={`Действия с прогулкой питомца ${walk.pet}`}
                            aria-haspopup="menu"
                            aria-expanded={openWalkActionsId === walk.id}
                            onClick={() => setOpenWalkActionsId((currentId) => currentId === walk.id ? null : walk.id)}
                          >
                            <EllipsisVertical aria-hidden="true" />
                          </button>
                          {openWalkActionsId === walk.id && (
                            <span className="walk-card-actions-popover" role="menu" aria-label={`Действия с прогулкой питомца ${walk.pet}`}>
                              <button
                                type="button"
                                role="menuitem"
                                disabled={!ownedWalk}
                                onClick={() => {
                                  if (!ownedWalk) return;
                                  setOpenWalkActionsId(null);
                                  editWalk(ownedWalk, "walks");
                                }}
                              >
                                Изменить
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                disabled={!ownedWalk}
                                onClick={() => {
                                  if (!ownedWalk) return;
                                  setOpenWalkActionsId(null);
                                  setWalkDeleteError("");
                                  setWalkPendingDelete(ownedWalk);
                                }}
                              >
                                Удалить
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                disabled={!shareablePet?.canShare}
                                onClick={() => {
                                  if (!shareablePet?.canShare) return;
                                  setOpenWalkActionsId(null);
                                  requestPetShareLink(shareablePet);
                                }}
                              >
                                Поделиться
                              </button>
                            </span>
                          )}
                        </div>
                      )}
                      <div className="walk-pet-visual">
                        <Image className="dog-avatar" src={walk.image} alt={`Собака ${walk.pet}`} width={112} height={112} sizes="112px" unoptimized={walk.image.startsWith("/api/")} />
                      </div>
                      <div className="walk-info">
                        <h2>{walk.pet}</h2>
                        <p className="pet-meta owner"><span className="walk-card-icon walk-card-icon--user" aria-hidden="true" /><span>{walk.owner}</span></p>
                        <p><Clock3 className="time-icon" aria-hidden="true" /><span>{walk.time}</span></p>
                        <p className="pet-meta breed" aria-label={`Порода: ${walk.breed}`}><Dog aria-hidden="true" /><span>{Array.from(walk.breed).slice(0, MAX_BREED_LENGTH).join("").trimEnd()}</span></p>
                      </div>
                      <WalkPlace place={walk.point} />
                      {walk.comment && (
                        <p className="walk-comment">
                          <MessageCircle aria-hidden="true" />
                          <span>{Array.from(walk.comment).slice(0, MAX_WALK_META_LENGTH).join("").trimEnd()}</span>
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
            </section>

            <section
              className="walks-pane walks-pane--walk"
              data-dock-pane={walkPane}
              data-dock-direction={paneDirection}
              aria-hidden={walkPane === "hidden"}
              inert={walkPane === "hidden" ? true : undefined}
            >
              <div className="menu-overlay" role="presentation">
                <aside className="drawer drawer--walk-form" role="dialog" aria-labelledby="dock-walk-title" aria-modal="true">
                  <div className="drawer-body drawer-walk-form">
                    {renderWalkAnnouncementContent(true)}
                  </div>
                </aside>
              </div>
            </section>

            <section
              className="walks-pane walks-pane--profile"
              data-dock-pane={profilePane}
              data-dock-direction={paneDirection}
              aria-hidden={profilePane === "hidden"}
              inert={profilePane === "hidden" ? true : undefined}
            >
              <div className="menu-overlay" role="presentation">
                <aside className="drawer" role="dialog" aria-labelledby="menu-title" aria-modal="true">
                  <div className="drawer-header">
                    <h1 className="drawer-menu-content" id="menu-title">Профиль</h1>
                  </div>
                  <div className="drawer-body drawer-menu-content">
                    <p className="drawer-label">Сохранённая локация</p>
                    <button className="location-card" type="button" onClick={openLocationEditor}>
                      <span className="location-card-summary">
                        <span className="location-card-pin" aria-hidden="true" />
                        <strong className="location-card-address">
                          <span>{location.city} · {location.district}</span>
                          <span>{formatResidentialComplex(location.complex)}</span>
                        </strong>
                        <ChevronDown className="location-card-chevron" aria-hidden="true" />
                      </span>
                      <span className="change-location">
                        <span className="change-location-pin" aria-hidden="true" />
                        Изменить локацию
                      </span>
                    </button>

                    <button className="drawer-link" type="button" onClick={() => openCollectionScreen("my-walks")}>
                      <span className="drawer-link-icon"><CalendarDays aria-hidden="true" /></span>
                      <span>Мои прогулки</span>
                      <ChevronRight />
                    </button>
                    <button className="drawer-link" type="button" onClick={() => openCollectionScreen("my-pets", "profile")}>
                      <span className="drawer-link-icon"><span className="drawer-pets-icon" aria-hidden="true" /></span>
                      <span>Мои питомцы</span>
                      <ChevronRight />
                    </button>
                    <div className="drawer-footer">
                      <a className="developer-link" href="https://t.me/kuznetsoviv" target="_blank" rel="noopener noreferrer">
                        ТГ разработчика
                      </a>
                    </div>
                  </div>
                </aside>
              </div>
            </section>
            </div>

          </div>
          );
        })()}

    {(screen === "my-walks" || profileTransitionTarget === "my-walks") && (
          <div
            className={`screen collection-screen subpage-screen-motion my-walks-screen ${profileTransitionTarget === "my-walks" ? "my-walks-screen--entering-from-profile" : ""} ${collectionClosing ? "my-walks-screen--exit" : ""}`}
            onAnimationEnd={(event) => {
              if (
                event.target === event.currentTarget &&
                event.animationName === "dock-pane-enter-right" &&
                profileTransitionTarget === "my-walks"
              ) {
                pushNavigation("my-walks");
                return;
              }
              if (
                event.target === event.currentTarget &&
                event.animationName === "dock-pane-exit-right" &&
                collectionClosing
              ) completeCollectionClose();
            }}
          >
          <button className="icon-button back-button" type="button" aria-label="Назад в меню" onClick={returnToMenu}>
            <ArrowLeft />
          </button>
            <div className="screen-heading">
              <h1>Мои прогулки</h1>
              <p>Все прогулки, о которых вы сообщили</p>
            </div>
            <div className="collection-list collection-list-with-action" aria-live="polite">
              {!myWalksLoaded ? (
                <p className="collection-empty">Загружаем прогулки…</p>
              ) : myWalks.length > 0 ? myWalks.map((walk) => (
                <article className="collection-card collection-walk" key={walk.id}>
                  <Image src={walk.image} alt={`Питомец ${walk.pet}`} width={62} height={62} unoptimized />
                  <span className="collection-card-info">
                    <strong>{walk.pet}</strong>
                    <small className="collection-complex"><House aria-hidden="true" />{walk.complex}</small>
                    <small className="collection-place"><span className="walk-card-icon walk-card-icon--pin" aria-hidden="true" />{walk.point}</small>
                    <small className="collection-date"><CalendarDays aria-hidden="true" />{formatWalkDate(walk)} · {walk.walkTime}</small>
                  </span>
                  <span className="collection-card-actions">
                    <button
                      className="edit-walk-button"
                      type="button"
                      aria-label={`Редактировать прогулку питомца ${walk.pet}`}
                      onClick={() => editWalk(walk, "my-walks")}
                    >
                      <Pencil aria-hidden="true" />
                    </button>
                    <button
                      className="delete-walk-button"
                      type="button"
                      aria-label={`Удалить прогулку питомца ${walk.pet}`}
                      onClick={() => { setWalkDeleteError(""); setWalkPendingDelete(walk); }}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </span>
                </article>
              )) : (
                <p className="collection-empty">У вас пока нет добавленных прогулок</p>
              )}
            </div>
              <button className="floating-pet-button" type="button" disabled={!petsLoaded} onClick={startWalkAnnouncement}>
              <Plus aria-hidden="true" />
              Сообщить о прогулке
            </button>
          </div>
        )}

        {(screen === "my-pets" || profileTransitionTarget === "my-pets") && (
          <div
            className={`screen collection-screen ${profileTransitionTarget === "my-pets" ? `pets-screen-motion pets-screen-motion--entering-from-${dockWalkOpen ? "walk" : "profile"}` : petsSource ? `pets-screen-motion pets-screen-motion--${petsDockDirection} ${collectionClosing ? "pets-screen-motion--exit" : "pets-screen-motion--enter"}` : ""} ${petsSource === "dock" ? "collection-screen--dock" : ""} ${petsTransitionTarget ? "collection-screen--returning-to-dock" : ""} ${highlightedPetId ? "collection-screen--shared-highlight-active" : ""}`}
            onPointerDownCapture={(event) => {
              if (!highlightedPetId) return;
              event.preventDefault();
              event.stopPropagation();
              dismissSharedPetHighlight();
            }}
            onAnimationEnd={(event) => {
              if (
                event.target === event.currentTarget &&
                event.animationName === "dock-pane-enter-right" &&
                profileTransitionTarget === "my-pets"
              ) {
                pushNavigation("my-pets", { petsSource: dockWalkOpen ? "dock" : "profile" });
                return;
              }
              if (
                event.target === event.currentTarget &&
                (event.animationName === "pets-screen-exit" || event.animationName === "pets-screen-exit-left") &&
                collectionClosing
              ) completeCollectionClose();
            }}
          >
            {highlightedPetId && <div className="shared-pet-highlight-overlay" aria-hidden="true" />}
          {petsSource !== "dock" && (
            <button className="icon-button back-button" type="button" aria-label="Назад в меню" onClick={returnToMenu}>
              <ArrowLeft />
            </button>
          )}
          <div className="screen-heading">
            <h1>Мои питомцы</h1>
              <p>Добавленные вами питомцы</p>
            </div>
            <div className="collection-list collection-list-with-action" aria-live="polite">
              {savedPets.length > 0 ? savedPets.map((pet) => {
                const isHighlighted = highlightedPetId === pet.id;
                return (
                  <div className={`collection-pet-entry ${isHighlighted ? "collection-pet-entry--shared-highlight" : ""}`} key={pet.id}>
                    <article className={`collection-card collection-pet ${isHighlighted ? "collection-pet--shared-highlight" : ""}`}>
                      <Image src={pet.photoUrl} alt={`Питомец ${pet.name}`} width={62} height={62} unoptimized />
                      <span className="collection-card-info">
                        <strong>{pet.name}</strong>
                        <small><Dog aria-hidden="true" />{pet.breed}</small>
                        <small><UserRound aria-hidden="true" />{pet.ownerName}</small>
                      </span>
                      <span className="collection-card-actions">
                        {pet.canShare && (
                          <button
                            className="share-pet-button"
                            type="button"
                            aria-label={`Поделиться питомцем ${pet.name}`}
                            onClick={() => requestPetShareLink(pet)}
                          >
                            <Forward aria-hidden="true" />
                          </button>
                        )}
                        {pet.canEdit && (
                          <button
                            className="edit-pet-button"
                            type="button"
                            aria-label={`Редактировать питомца ${pet.name}`}
                            onClick={() => editPet(pet)}
                          >
                            <Pencil aria-hidden="true" />
                          </button>
                        )}
                        {pet.canDelete && (
                          <button
                            className="delete-pet-button"
                            type="button"
                            aria-label={`Удалить питомца ${pet.name}`}
                            onClick={() => { setPetDeleteError(""); setPetPendingDelete(pet); }}
                          >
                            <Trash2 aria-hidden="true" />
                          </button>
                        )}
                      </span>
                      {pet.isOwner && pet.isShared && (
                        <span className="shared-pet-origin-label">Вы поделились этим питомцем</span>
                      )}
                      {!pet.isOwner && <span className="shared-pet-origin-label">Добавленный питомец</span>}
                    </article>
                    {isHighlighted && (
                      <p className="shared-pet-highlight-message">Теперь вы можете управлять этим питомцем</p>
                    )}
                  </div>
                );
              }) : (
                <p className="collection-empty">У вас пока нет добавленных питомцев</p>
              )}
            </div>
            <button className="floating-pet-button" type="button" onClick={addPet}>
              <Plus aria-hidden="true" />
              Добавить питомца
            </button>
          </div>
        )}

        {screen === "pet" && (
          <div
            className={`screen form-screen pet-screen animated-form-screen ${formClosing ? "animated-form-screen--exit" : "animated-form-screen--enter"}`}
            onAnimationEnd={(event) => {
              if (event.target === event.currentTarget && formClosing) completeFormClose();
            }}
          >
            {guidedWalkFlow && petReturnTarget === "announce" ? (
              <div className="guided-form-topbar">
                <button className="icon-button back-button" type="button" aria-label="Назад к прогулкам" onClick={leavePetScreen}>
                  <ArrowLeft />
                </button>
                <WalkSetupStepper step={1} />
              </div>
            ) : (
              <button className="icon-button back-button" type="button" aria-label={petReturnTarget === "announce" ? "Назад к прогулкам" : "Назад к моим питомцам"} onClick={leavePetScreen}>
                <ArrowLeft />
              </button>
            )}
            <div className="screen-heading">
              <h1>{petBeingEdited ? "Редактировать питомца" : "Добавить питомца"}</h1>
              <p>{petBeingEdited ? "Обновите информацию о вашем друге" : "Расскажите немного о вашем друге"}</p>
            </div>
            <form className="pet-form" onSubmit={savePet} aria-busy={petSaving} noValidate>
              <label className={`photo-upload ${photoUrl ? "has-photo" : ""} ${petBeingEdited ? "is-editing" : ""}`}>
                <input
                  name="photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label={petBeingEdited ? "Выбрать новую фотографию питомца" : "Добавить фотографию питомца"}
                  onChange={handlePhoto}
                />
                {photoUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoUrl} alt="Предпросмотр фотографии питомца" />
                    {petBeingEdited && <span className="photo-edit-hint">Нажмите, чтобы изменить фото</span>}
                  </>
                ) : (
                  <><Camera aria-hidden="true" /><span>Добавить фото</span><small>Необязательно</small></>
                )}
              </label>
              {(photoError || petSubmitError) && <p className="error-message" role="alert">{photoError || petSubmitError}</p>}
              <label className="field text-field">
                <span>Имя питомца</span>
                <input
                  name="petName"
                  value={petNameInput}
                  required
                  maxLength={40}
                  placeholder="Например, Боня"
                  aria-invalid={Boolean(touchedFields["pet-name"] && !petNameIsValid)}
                  aria-describedby={touchedFields["pet-name"] && !petNameIsValid ? "pet-name-hint" : undefined}
                  onBlur={() => touchField("pet-name")}
                  onChange={(event) => { setPetNameInput(event.target.value); setPetSubmitError(""); }}
                />
                {touchedFields["pet-name"] && !petNameIsValid && (
                  <span className="validation-hint" id="pet-name-hint">{petNameInput.trim() ? "Имя питомца должно содержать хотя бы одну букву" : "Введите имя питомца"}</span>
                )}
              </label>
              <label className="field text-field">
                <span>Имя хозяина</span>
                <input
                  name="ownerName"
                  value={ownerNameInput}
                  required
                  maxLength={60}
                  placeholder="Например, Анна"
                  aria-invalid={Boolean(touchedFields["owner-name"] && !ownerNameIsValid)}
                  aria-describedby={touchedFields["owner-name"] && !ownerNameIsValid ? "owner-name-hint" : undefined}
                  onBlur={() => touchField("owner-name")}
                  onChange={(event) => { setOwnerNameInput(event.target.value); setPetSubmitError(""); }}
                />
                {touchedFields["owner-name"] && !ownerNameIsValid && (
                  <span className="validation-hint" id="owner-name-hint">{ownerNameInput.trim() ? "Имя хозяина должно содержать хотя бы одну букву" : "Введите имя хозяина"}</span>
                )}
              </label>
              <label className="field text-field">
                <span>Порода</span>
                <input
                  name="breed"
                  value={breedInput}
                  required
                  maxLength={MAX_BREED_LENGTH}
                  placeholder="Например, корги"
                  aria-invalid={Boolean(touchedFields["pet-breed"] && !breedIsValid)}
                  aria-describedby={touchedFields["pet-breed"] && !breedIsValid ? "pet-breed-hint" : undefined}
                  onBlur={() => touchField("pet-breed")}
                  onChange={(event) => { setBreedInput(event.target.value); setPetSubmitError(""); }}
                />
                {touchedFields["pet-breed"] && !breedIsValid && (
                  <span className="validation-hint" id="pet-breed-hint">{breedInput.trim() ? "Порода должна содержать хотя бы одну букву" : "Введите породу"}</span>
                )}
              </label>
              <button className="primary-button form-submit" type="submit" disabled={!petFormIsValid || petSaving || petSaved}>
                {petSaved ? <><CheckCircle2 /> {petBeingEdited ? "Изменения сохранены" : "Питомец добавлен"}</> : petSaving ? "Сжимаем и сохраняем…" : "Сохранить"}
              </button>
            </form>
            {petSaving && (
              <div className="saving-overlay" role="status" aria-live="polite">
                <span className="saving-spinner" aria-hidden="true" />
                <p>Идёт сохранение данных о вашем питомце</p>
              </div>
            )}
          </div>
        )}

        {screen === "announce" && (
          <div
            className={`screen form-screen announce-screen animated-form-screen ${formClosing ? "animated-form-screen--exit" : "animated-form-screen--enter"}`}
            onAnimationEnd={(event) => {
              if (event.target === event.currentTarget && formClosing) completeFormClose();
            }}
          >
            {guidedWalkFlow ? (
              <div className="guided-form-topbar">
                <button className="icon-button back-button" type="button" aria-label="Назад к прогулкам" onClick={leaveWalkScreen}>
                  <ArrowLeft />
                </button>
                <WalkSetupStepper step={2} />
              </div>
            ) : (
              <button className="icon-button back-button" type="button" aria-label={walkBeingEdited ? "Назад к моим прогулкам" : "Назад к прогулкам"} onClick={leaveWalkScreen}>
                <ArrowLeft />
              </button>
            )}
            <div className="screen-heading">
              <h1>Сообщить о прогулке</h1>
              <p>Укажите, с кем, где и когда вы будете гулять</p>
            </div>
            <form className="announce-form" onSubmit={saveWalk} aria-busy={walkSaving} noValidate>
              <div className="field">
                <span>Ваш питомец</span>
                <DropdownSelect
                  id="walk-pet"
                  name="pet"
                  ariaLabel="Ваш питомец"
                  value={selectedPetId}
                  options={savedPets.map((pet) => ({ value: pet.id, label: pet.name }))}
                  placeholder={savedPets.length === 0 ? "Сначала добавьте питомца" : "Выберите питомца"}
                  emptyText="У вас пока нет добавленных питомцев"
                  disabled={savedPets.length === 0}
                  invalid={Boolean(touchedFields["walk-pet"] && !selectedPetId)}
                  describedBy={touchedFields["walk-pet"] && !selectedPetId ? "walk-pet-hint" : undefined}
                  onBlur={() => touchField("walk-pet")}
                  onChange={(petId) => { setSelectedPetId(petId); setWalkSubmitError(""); }}
                />
                {touchedFields["walk-pet"] && !selectedPetId && <p className="validation-hint" id="walk-pet-hint">Выберите питомца</p>}
              </div>
              <div className="field text-field place-field">
                <label htmlFor="walk-place">Место прогулки</label>
                <div
                  className="place-combobox"
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) {
                      setPlaceMenuOpen(false);
                      touchField("walk-place");
                    }
                  }}
                >
                  <input
                    id="walk-place"
                    name="place"
                    value={placeInput}
                    required
                    maxLength={MAX_WALK_PLACE_LENGTH}
                    autoComplete="off"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-controls="shared-place-options"
                    aria-expanded={placeSuggestionsVisible}
                    aria-invalid={Boolean(touchedFields["walk-place"] && !placeIsValid)}
                    aria-describedby={touchedFields["walk-place"] && !placeIsValid ? "walk-place-hint" : undefined}
                    placeholder="Выберите место или укажите своё"
                    onFocus={() => setPlaceMenuOpen(true)}
                    onChange={(event) => updatePlaceInput(event.target.value)}
                  />
                  <button
                    className="place-menu-toggle"
                    type="button"
                    aria-label={placeSuggestionsVisible ? "Закрыть список мест" : "Открыть список мест"}
                    aria-expanded={placeSuggestionsVisible}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => {
                      if (placeSuggestionsVisible) {
                        setPlaceMenuOpen(false);
                      } else if (!normalizedPlaceInput || matchingSharedPlaces.length > 0) {
                        setPlaceMenuOpen(true);
                      }
                    }}
                  >
                    <ChevronDown aria-hidden="true" />
                  </button>
                  {placeSuggestionsVisible && (
                    <div className="place-options" id="shared-place-options" role="listbox" aria-label="Общие места прогулок">
                      {!placesLoaded ? (
                        <p className="place-options-status">Загружаем места…</p>
                      ) : matchingSharedPlaces.length > 0 ? matchingSharedPlaces.map((place) => (
                        <button
                          className="place-option"
                          key={place.id}
                          type="button"
                          role="option"
                          aria-selected={normalizePlaceForComparison(place.name) === normalizePlaceForComparison(placeInput)}
                          onPointerDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            chooseSharedPlace(place);
                          }}
                        >
                          {place.name}
                        </button>
                      )) : (
                        <p className="place-options-status">Пока нет добавленных мест</p>
                      )}
                    </div>
                  )}
                </div>
                {touchedFields["walk-place"] && !placeIsValid && (
                  <p className="validation-hint" id="walk-place-hint">
                    {placeInput.trim().length > MAX_WALK_PLACE_LENGTH
                      ? `Название места должно содержать не более ${MAX_WALK_PLACE_LENGTH} символов`
                      : placeInput.trim()
                        ? "Название места должно содержать хотя бы одну букву"
                        : "Укажите место прогулки"}
                  </p>
                )}
              </div>
              <fieldset className="schedule-field">
                <legend>День прогулки</legend>
                <div className="filters schedule-buttons">
                  <span className="filter-indicator schedule-indicator" aria-hidden="true" style={{ left: scheduleIndicatorLeft[scheduleType] }} />
                  {([
                    ["today", "Сегодня"],
                    ["tomorrow", "Завтра"],
                    ["always", "Всегда"]
                  ] as Array<[ScheduleType, string]>).map(([value, label]) => (
                    <button key={value} type="button" className={`filter-button schedule-button ${scheduleType === value ? "active" : ""}`} aria-pressed={scheduleType === value} onClick={() => changeWalkScheduleType(value)}>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="field">
                <span>Время прогулки</span>
                <TimeDropdown
                  value={walkTime}
                  futureOnly={scheduleType === "today"}
                  invalid={Boolean(!walkTimePickerOpen && touchedFields["walk-time"] && !timeIsValid)}
                  describedBy={!walkTimePickerOpen && touchedFields["walk-time"] && !timeIsValid ? "walk-time-hint" : undefined}
                  onOpenChange={(open) => { setWalkTimePickerOpen(open); if (!open) touchField("walk-time"); }}
                  onChange={(time) => { setWalkTime(time); setWalkSubmitError(""); }}
                />
                {!walkTimePickerOpen && touchedFields["walk-time"] && !timeIsValid && <p className="validation-hint" id="walk-time-hint">Выберите время прогулки</p>}
              </div>
              <div className="field comment-field">
                <label htmlFor="walk-comment">Комментарий <span>(необязательно)</span></label>
                <input
                  id="walk-comment"
                  name="comment"
                  maxLength={MAX_WALK_COMMENT_LENGTH}
                  value={walkComment}
                  placeholder="Например, возьмём мячик"
                  onChange={(event) => setWalkComment(event.target.value)}
                />
                <small>{walkComment.length}/{MAX_WALK_COMMENT_LENGTH}</small>
              </div>
              {(walkSubmitError || savedPets.length === 0) && (
                <p className="error-message" role="alert">{walkSubmitError || "Сначала добавьте питомца через меню."}</p>
              )}
              <button className="primary-button form-submit" type="submit" disabled={!walkFormIsValid || walkSaving || walkSaved}>
                {walkSaved
                  ? <><CheckCircle2 /> {walkBeingEdited ? "Изменения сохранены" : "Прогулка добавлена"}</>
                  : walkSaving ? "Сохраняем…" : walkBeingEdited ? "Сохранить" : "Сообщить о прогулке"}
              </button>
            </form>
            {walkSaving && (
              <div className="saving-overlay" role="status" aria-live="polite">
                <span className="saving-spinner" aria-hidden="true" />
                <p>Информация о прогулке сохраняется</p>
              </div>
            )}
          </div>
        )}

        {showPetRequiredPopup && (
          <div className="information-overlay">
            <section className="information-dialog" role="dialog" aria-modal="true" aria-describedby="pet-required-description">
              <p id="pet-required-description">Добавьте информацию о своём питомце, чтобы сообщить о прогулке</p>
              <button ref={informationButtonRef} className="primary-button" type="button" onClick={continueToRequiredPet}>Хорошо</button>
            </section>
          </div>
        )}

        {showSharedPetAlreadyAddedPopup && (
          <div className="information-overlay">
            <section className="information-dialog shared-pet-already-added-dialog" role="alertdialog" aria-modal="true" aria-describedby="shared-pet-already-added-description">
              <p id="shared-pet-already-added-description">Этот питомец уже добавлен</p>
              <button className="primary-button" type="button" onClick={dismissSharedPetAlreadyAddedPopup}>Хорошо</button>
            </section>
          </div>
        )}

        {locationRequestSent && (
          <div className="information-overlay">
            <section className="information-dialog location-request-dialog" role="dialog" aria-modal="true" aria-describedby="location-request-description">
              <Hourglass className="location-request-dialog-icon" aria-hidden="true" />
              <p id="location-request-description">Пока вы ждёте добавления своей локации, можете выбрать другое место для прогулки</p>
              <button ref={locationRequestButtonRef} className="primary-button" type="button" onClick={() => setLocationRequestSent(false)}>Хорошо</button>
            </section>
          </div>
        )}

        {petToShare && (
          <div className="information-overlay pet-share-overlay" role="presentation">
            <section className="information-dialog pet-share-dialog" role="dialog" aria-modal="true" aria-labelledby="pet-share-title">
              <Forward className="pet-share-dialog-icon" aria-hidden="true" />
              <h2 id="pet-share-title">Поделиться питомцем</h2>
              <p>Отправьте эту ссылку человеку, с которым хотите вместе управлять питомцем</p>
              {petShareLoading ? (
                <div className="pet-share-loading" role="status">
                  <span className="saving-spinner" aria-hidden="true" />
                  <span>Получаем ссылку…</span>
                </div>
              ) : (
                <>
                  <div className="pet-share-link-row">
                    <input
                      aria-label="Ссылка на питомца"
                      readOnly
                      value={petShareLink}
                      onFocus={(event) => event.currentTarget.select()}
                    />
                    <button
                      className={`pet-share-copy-button ${petShareCopied ? "pet-share-copy-button--copied" : ""}`}
                      type="button"
                      disabled={!petShareLink}
                      aria-label="Копировать ссылку"
                      onClick={copyPetShareLink}
                    >
                      {petShareCopied ? <CheckCircle2 aria-hidden="true" /> : <Copy aria-hidden="true" />}
                    </button>
                  </div>
                  <div className="pet-share-status" aria-live="polite">
                    {petShareCopied && <span>Скопировано</span>}
                  </div>
                  <button
                    className="pet-share-renew-button"
                    type="button"
                    disabled={!petShareLink || petShareRefreshing}
                    onClick={() => requestPetShareLink(petToShare, true)}
                  >
                    <RefreshCw className={petShareRefreshing ? "pet-share-renew-icon--spinning" : ""} aria-hidden="true" />
                    Получить новую ссылку
                  </button>
                </>
              )}
              {petShareError && <p className="form-error pet-share-error" role="alert">{petShareError}</p>}
              <button ref={shareDoneButtonRef} className="primary-button" type="button" disabled={petShareLoading || petShareRefreshing} onClick={closePetShare}>Готово</button>
            </section>
          </div>
        )}

        {walkPendingDelete && (
          <div className="delete-confirm-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !walkDeleting) setWalkPendingDelete(null); }}>
            <section className="delete-confirm" role="alertdialog" aria-modal="true" aria-labelledby="delete-walk-title" aria-describedby="delete-walk-description">
              <h2 id="delete-walk-title">Удалить прогулку?</h2>
              <p id="delete-walk-description">Удалив прогулку, не забудьте добавить новую, чтобы ваши друзья вас не потеряли</p>
              {walkDeleteError && <p className="delete-confirm-error" role="alert">{walkDeleteError}</p>}
              <div className="delete-confirm-actions">
                <button className="delete-confirm-button" type="button" disabled={walkDeleting} onClick={deleteWalk}>
                  {walkDeleting ? "Удаляем…" : "Удалить"}
                </button>
                <button ref={deleteCancelRef} className="keep-walk-button" type="button" disabled={walkDeleting} onClick={() => setWalkPendingDelete(null)}>Оставить</button>
              </div>
            </section>
          </div>
        )}

        {petPendingDelete && (
          <div className="delete-confirm-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !petDeleting) setPetPendingDelete(null); }}>
            <section className="delete-confirm" role="alertdialog" aria-modal="true" aria-labelledby="delete-pet-title" aria-describedby="delete-pet-description">
              <h2 id="delete-pet-title">{petPendingDelete.isOwner ? "Удалить питомца?" : "Удалить добавленного питомца?"}</h2>
              <p id="delete-pet-description">
                {petPendingDelete.isOwner
                  ? "Вместе с питомцем будут удалены добавленные для него прогулки"
                  : "Питомец будет удалён только из вашего списка. У владельца он останется"}
              </p>
              {petDeleteError && <p className="delete-confirm-error" role="alert">{petDeleteError}</p>}
              <div className="delete-confirm-actions">
                <button className="delete-confirm-button" type="button" disabled={petDeleting} onClick={deletePet}>
                  {petDeleting ? "Удаляем…" : "Удалить"}
                </button>
                <button ref={deleteCancelRef} className="keep-walk-button" type="button" disabled={petDeleting} onClick={() => setPetPendingDelete(null)}>Оставить</button>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
