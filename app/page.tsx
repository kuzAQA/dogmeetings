"use client";

import {
  ArrowLeft,
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Dog,
  House,
  MessageCircle,
  PawPrint,
  Pencil,
  Plus,
  Trash2,
  UserRound
} from "lucide-react";
import Image from "next/image";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Screen = "welcome" | "location" | "walks" | "pet" | "announce" | "my-walks" | "my-pets";
type Period = "Все" | "Утро" | "День" | "Вечер";
type ScheduleType = "today" | "tomorrow" | "always";
type PetReturnTarget = "my-pets" | "announce";
type FilterMotion = "idle" | "exit-left" | "exit-right" | "enter-left" | "enter-right";
type LocationCloseTarget = "menu" | "walks" | null;
type FormScreen = "pet" | "announce";

type Location = {
  city: string;
  district: string;
  complex: string;
};

type Walk = {
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

type Pet = {
  id: string;
  name: string;
  breed: string;
  ownerName: string;
  photoUrl: string;
  createdAt: string;
  updatedAt: string;
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

type DropdownOption = {
  value: string;
  label: string;
};

type ApiWalk = {
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

type SessionBootstrapData = {
  hasLocation: boolean;
  location: Location | null;
};

const STORAGE_KEY = "dogwalk.location.v1";
const HAS_LOCATION_KEY = "dogwalk.hasLocation.v1";
const CLIENT_ID_KEY = "dogwalk.clientId.v1";
const MAX_SOURCE_PHOTO_SIZE = 10 * 1024 * 1024;
const MAX_COMPRESSED_PHOTO_SIZE = 700 * 1024;
const MAX_PHOTO_DIMENSION = 1024;
const MAX_WALK_META_LENGTH = 40;
const MAX_WALK_COMMENT_LENGTH = MAX_WALK_META_LENGTH;
const MAX_BREED_LENGTH = 20;
const WALK_PLACE_BUBBLE_ENABLED = false;
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
const hourOptions = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const minuteOptions = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"));
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

function apiWalkToCard(walk: ApiWalk): Walk {
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

function formatWalkDate(walk: ApiWalk) {
  if (walk.scheduleType === "always") return "Всегда";
  const [year = "", month = "", day = ""] = walk.walkDate.split("-");
  return `${day}.${month}.${year}`;
}

function formatResidentialComplex(value: string) {
  const complex = value.trim().replace(/^жилой комплекс\s+/iu, "");
  return /^дзен[\s-]+кварталы$/iu.test(complex) ? "Дзен-Кварталы" : complex;
}

function WalkSetupStepper({ step }: { step: 1 | 2 }) {
  return (
    <div className="walk-setup-stepper" role="status" aria-label={`Шаг ${step} из 2`}>
      <span className="walk-setup-progress" aria-hidden="true">
        <span className="complete" />
        <span className={step === 2 ? "complete walk-setup-progress-animated" : ""} />
      </span>
      <span className="walk-setup-step-label">Шаг {step} из 2</span>
    </div>
  );
}

function MenuMorphIcon() {
  return (
    <span className="menu-icon" aria-hidden="true">
      <svg className="menu-frame" viewBox="0 0 48 48" focusable="false">
        <rect className="menu-frame-stroke" x="0.75" y="0.75" width="46.5" height="46.5" rx="12.25" pathLength={1} />
      </svg>
      <span className="menu-glyph" />
    </span>
  );
}

function WalkPlace({ place }: { place: string }) {
  const textRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [truncated, setTruncated] = useState(false);
  const [measuredPlace, setMeasuredPlace] = useState(place);
  const displayedPlace = WALK_PLACE_BUBBLE_ENABLED
    ? measuredPlace
    : Array.from(place).slice(0, MAX_WALK_META_LENGTH).join("").trimEnd();
  const [bubbleState, setBubbleState] = useState<"closed" | "open" | "closing">("closed");
  const expanded = WALK_PLACE_BUBBLE_ENABLED && bubbleState !== "closed";

  const closeBubble = useCallback(() => {
    setBubbleState((current) => current === "open" ? "closing" : current);
  }, []);

  useEffect(() => {
    const text = textRef.current;
    if (!text) return;

    if (!WALK_PLACE_BUBBLE_ENABLED) {
      return;
    }

    const measure = () => {
      text.textContent = place;
      const isTruncated = text.scrollHeight > text.clientHeight + 1;

      if (isTruncated) {
        const characters = Array.from(place);
        let lowerBound = 0;
        let upperBound = characters.length;
        let fittedText = "…";

        while (lowerBound <= upperBound) {
          const middle = Math.floor((lowerBound + upperBound) / 2);
          const candidate = `${characters.slice(0, middle).join("").trimEnd()}…`;
          text.textContent = candidate;

          if (text.scrollHeight <= text.clientHeight + 1) {
            fittedText = candidate;
            lowerBound = middle + 1;
          } else {
            upperBound = middle - 1;
          }
        }

        text.textContent = fittedText;
        setMeasuredPlace((current) => current === fittedText ? current : fittedText);
      } else {
        text.textContent = place;
        setMeasuredPlace((current) => current === place ? current : place);
      }

      setTruncated(isTruncated);
      if (!isTruncated) setBubbleState("closed");
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(text);
    return () => observer.disconnect();
  }, [place]);

  useEffect(() => {
    if (!WALK_PLACE_BUBBLE_ENABLED || bubbleState !== "open") return;

    const timer = window.setTimeout(closeBubble, 5000);
    const closeOnScreenPress = (event: PointerEvent) => {
      if (event.target instanceof Node && triggerRef.current?.contains(event.target)) return;
      closeBubble();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeBubble();
    };

    document.addEventListener("pointerdown", closeOnScreenPress);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerdown", closeOnScreenPress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [bubbleState, closeBubble]);

  useEffect(() => {
    if (bubbleState !== "closing") return;
    const timer = window.setTimeout(() => setBubbleState("closed"), 220);
    return () => window.clearTimeout(timer);
  }, [bubbleState]);

  return (
    <div className={`walk-place-row walk-location-block ${expanded ? "is-expanded" : ""}`}>
      <span className="walk-card-icon walk-card-icon--pin" aria-hidden="true" />
      <button
        ref={triggerRef}
        className={`walk-place-trigger ${WALK_PLACE_BUBBLE_ENABLED && truncated ? "is-truncated" : ""}`}
        type="button"
        aria-label={WALK_PLACE_BUBBLE_ENABLED && truncated ? `Показать полное место прогулки: ${place}` : place}
        aria-expanded={WALK_PLACE_BUBBLE_ENABLED && truncated ? expanded : undefined}
        disabled={!WALK_PLACE_BUBBLE_ENABLED || !truncated}
        onClick={() => setBubbleState((current) => current === "open" ? "closing" : "open")}
      >
        <span className="walk-place-text" ref={textRef}>{displayedPlace}</span>
      </button>
      {expanded && (
        <span className={`walk-place-bubble ${bubbleState === "closing" ? "is-closing" : ""}`} role="status">
          {place}
        </span>
      )}
    </div>
  );
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

function DropdownSelect({
  id,
  name,
  value,
  options,
  placeholder = "Выберите значение",
  emptyText = "Нет доступных вариантов",
  ariaLabel,
  disabled = false,
  invalid = false,
  describedBy,
  onBlur,
  onChange
}: {
  id: string;
  name?: string;
  value: string;
  options: DropdownOption[];
  placeholder?: string;
  emptyText?: string;
  ariaLabel: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  onBlur?: () => void;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value);
  const listId = `${id}-options`;

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div
      className="custom-select"
      ref={rootRef}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setOpen(false);
        onBlur?.();
      }}
    >
      {name && <input type="hidden" name={name} value={value} />}
      <button
        id={id}
        className="custom-select-trigger"
        type="button"
        role="combobox"
        aria-controls={listId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !disabled) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className={selectedOption ? "" : "custom-select-placeholder"}>
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div className="place-options custom-select-options" id={listId} role="listbox">
          {options.length > 0 ? options.map((option) => (
            <button
              className="place-option"
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          )) : (
            <p className="place-options-status">{emptyText}</p>
          )}
        </div>
      )}
    </div>
  );
}

function TimeDropdown({ value, invalid = false, describedBy, onBlur, onChange }: {
  value: string;
  invalid?: boolean;
  describedBy?: string;
  onBlur?: () => void;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [opensUpward, setOpensUpward] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [selectedHour = "", selectedMinute = ""] = value.split(":");

  function openTimeMenu() {
    const root = rootRef.current;
    if (root) {
      const fieldBounds = root.getBoundingClientRect();
      const shellBounds = root.closest(".app-shell")?.getBoundingClientRect();
      const lowerBoundary = shellBounds?.bottom ?? window.innerHeight;
      const upperBoundary = shellBounds?.top ?? 0;
      const spaceBelow = lowerBoundary - fieldBounds.bottom;
      const spaceAbove = fieldBounds.top - upperBoundary;
      setOpensUpward(spaceBelow < 252 && spaceAbove > spaceBelow);
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div
      className="custom-select time-dropdown"
      ref={rootRef}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setOpen(false);
        onBlur?.();
      }}
    >
      <input type="hidden" name="walkTime" value={value} />
      <button
        className="custom-select-trigger"
        type="button"
        role="combobox"
        aria-label="Время прогулки"
        aria-invalid={invalid}
        aria-describedby={describedBy}
        aria-controls="walk-time-options"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          if (open) setOpen(false);
          else openTimeMenu();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            openTimeMenu();
          }
        }}
      >
        <span className={value ? "" : "custom-select-placeholder"}>{value || "--:--"}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <div className={`place-options time-options ${opensUpward ? "opens-upward" : ""}`} id="walk-time-options" role="dialog" aria-label="Выбор времени прогулки">
          <div className="time-option-column">
            <span className="time-options-label">Часы</span>
            <div className="time-option-list" role="listbox" aria-label="Часы">
              {hourOptions.map((hour) => (
                <button
                  className="place-option time-option"
                  key={hour}
                  type="button"
                  role="option"
                  aria-selected={hour === selectedHour}
                  onClick={() => onChange(`${hour}:${selectedMinute || "00"}`)}
                >
                  {hour}
                </button>
              ))}
            </div>
          </div>
          <div className="time-option-column">
            <span className="time-options-label">Минуты</span>
            <div className="time-option-list" role="listbox" aria-label="Минуты">
              {minuteOptions.map((minute) => (
                <button
                  className="place-option time-option"
                  key={minute}
                  type="button"
                  role="option"
                  aria-selected={minute === selectedMinute}
                  onClick={() => {
                    onChange(`${selectedHour || "00"}:${minute}`);
                    setOpen(false);
                  }}
                >
                  {minute}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Не удалось обработать фотографию."));
    }, type, quality);
  });
}

async function compressPetPhoto(file: File) {
  const sourceUrl = URL.createObjectURL(file);
  const image = new window.Image();
  image.decoding = "async";
  image.src = sourceUrl;

  try {
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error("Не удалось определить размер фотографии.");
    }

    if (
      file.type === "image/webp" &&
      file.size <= MAX_COMPRESSED_PHOTO_SIZE &&
      Math.max(image.naturalWidth, image.naturalHeight) <= MAX_PHOTO_DIMENSION
    ) {
      return file;
    }

    const initialScale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
    let width = Math.max(1, Math.round(image.naturalWidth * initialScale));
    let height = Math.max(1, Math.round(image.naturalHeight * initialScale));
    let smallestBlob: Blob | null = null;
    const canvas = document.createElement("canvas");

    for (let resizeAttempt = 0; resizeAttempt < 4; resizeAttempt += 1) {
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Браузер не смог обработать фотографию.");

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);

      for (const quality of [0.82, 0.74, 0.66, 0.58]) {
        let blob = await canvasToBlob(canvas, "image/webp", quality);
        if (blob.type !== "image/webp") {
          blob = await canvasToBlob(canvas, "image/jpeg", quality);
        }
        if (!smallestBlob || blob.size < smallestBlob.size) smallestBlob = blob;
        if (blob.size <= MAX_COMPRESSED_PHOTO_SIZE) {
          const extension = blob.type === "image/webp" ? "webp" : "jpg";
          return new File([blob], `pet-photo.${extension}`, { type: blob.type, lastModified: Date.now() });
        }
      }

      width = Math.max(1, Math.round(width * 0.8));
      height = Math.max(1, Math.round(height * 0.8));
    }

    if (!smallestBlob || smallestBlob.size > MAX_COMPRESSED_PHOTO_SIZE) {
      throw new Error("Не удалось достаточно сжать фотографию. Выберите другое изображение.");
    }

    const extension = smallestBlob.type === "image/webp" ? "webp" : "jpg";
    return new File([smallestBlob], `pet-photo.${extension}`, {
      type: smallestBlob.type,
      lastModified: Date.now()
    });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export default function Home() {
  const [screen, setScreen] = useState<Screen | null>(null);
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
  const [period, setPeriod] = useState<Period>("Все");
  const [displayedPeriod, setDisplayedPeriod] = useState<Period>("Все");
  const [filterMotion, setFilterMotion] = useState<FilterMotion>("idle");
  const [menuOpen, setMenuOpen] = useState(false);
  const [animateMenuOpen, setAnimateMenuOpen] = useState(true);
  const [menuClosing, setMenuClosing] = useState(false);
  const [menuButtonClosing, setMenuButtonClosing] = useState(false);
  const [collectionClosing, setCollectionClosing] = useState(false);
  const [locationOpenedFromMenu, setLocationOpenedFromMenu] = useState(false);
  const [locationCloseTarget, setLocationCloseTarget] = useState<LocationCloseTarget>(null);
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
  const [walkPendingDelete, setWalkPendingDelete] = useState<ApiWalk | null>(null);
  const [walkDeleting, setWalkDeleting] = useState(false);
  const [walkDeleteError, setWalkDeleteError] = useState("");
  const [petPendingDelete, setPetPendingDelete] = useState<Pet | null>(null);
  const [petDeleting, setPetDeleting] = useState(false);
  const [petDeleteError, setPetDeleteError] = useState("");
  const [scheduleType, setScheduleType] = useState<ScheduleType>("today");
  const [selectedPetId, setSelectedPetId] = useState("");
  const [walkTime, setWalkTime] = useState("");
  const [walkComment, setWalkComment] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
  const informationButtonRef = useRef<HTMLButtonElement>(null);
  const filterTimersRef = useRef<number[]>([]);

  const closeMenu = useCallback(() => {
    setMenuButtonClosing(true);
    setMenuClosing(true);
  }, []);

  function touchField(field: string) {
    setTouchedFields((current) => current[field] ? current : { ...current, [field]: true });
  }

  useEffect(() => {
    let active = true;

    bootstrapSession()
      .then((data) => {
        if (!active) return;

        const restoredLocation = data.hasLocation && data.location
          ? data.location
          : defaultLocation;
        setLocation(restoredLocation);
        setLocationDraft(restoredLocation);
        setHasLocation(Boolean(data.hasLocation && data.location));
        setScreen(data.hasLocation && data.location ? "walks" : "welcome");
        setSessionReady(true);
        clearLegacySessionData();
      })
      .catch((error) => {
        if (!active) return;
        setSessionError(error instanceof Error ? error.message : "Не удалось восстановить безопасную сессию.");
      });

    return () => { active = false; };
  }, [sessionAttempt]);

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
    if (!menuOpen && !walkPendingDelete && !petPendingDelete) return;
    if (walkPendingDelete || petPendingDelete) deleteCancelRef.current?.focus();
    else closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (walkPendingDelete) {
        if (!walkDeleting) setWalkPendingDelete(null);
      } else if (petPendingDelete) {
        if (!petDeleting) setPetPendingDelete(null);
      } else {
        closeMenu();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeMenu, menuOpen, petDeleting, petPendingDelete, walkDeleting, walkPendingDelete]);

  useEffect(() => {
    if (showPetRequiredPopup) informationButtonRef.current?.focus();
  }, [showPetRequiredPopup]);

  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  useEffect(() => {
    return () => filterTimersRef.current.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const visibleWalks = useMemo(
    () => displayedPeriod === "Все" ? savedWalks : savedWalks.filter((walk) => walk.period === displayedPeriod),
    [displayedPeriod, savedWalks]
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

  function selectPeriod(nextPeriod: Period) {
    if (nextPeriod === period) return;

    filterTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    const movesRight = periodOptions.indexOf(nextPeriod) > periodOptions.indexOf(period);
    setPeriod(nextPeriod);
    setFilterMotion(movesRight ? "exit-left" : "exit-right");

    const exitTimer = window.setTimeout(() => {
      setDisplayedPeriod(nextPeriod);
      setFilterMotion(movesRight ? "enter-right" : "enter-left");

      const enterTimer = window.setTimeout(() => setFilterMotion("idle"), 170);
      filterTimersRef.current = [enterTimer];
    }, 120);
    filterTimersRef.current = [exitTimer];
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
        return;
      }
      setLocationOpenedFromMenu(false);
      setScreen("walks");
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
      return;
    }

    setScreen(hasLocation ? "walks" : "welcome");
  }

  function openLocationEditor() {
    setLocationDraft(location);
    setTouchedFields({});
    setLocationCloseTarget(null);
    setLocationOpenedFromMenu(true);
    setMenuOpen(false);
    setScreen("location");
  }

  function completeLocationClose() {
    const target = locationCloseTarget;
    if (target === "menu") {
      setAnimateMenuOpen(false);
      setMenuClosing(false);
      setMenuButtonClosing(false);
      setMenuOpen(true);
      setScreen("walks");
    } else if (target === "walks") {
      setMenuOpen(false);
      setScreen("walks");
    }
    setLocationCloseTarget(null);
    setLocationOpenedFromMenu(false);
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
    setScreen(nextScreen);
  }

  function beginFormClose(target: Screen) {
    setFormCloseTarget(target);
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
      if (target === "my-walks") setWalkBeingEdited(null);
    }

    setFormClosing(false);
    setFormCloseTarget(null);
    setScreen(target);
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

  function startWalkAnnouncement() {
    if (savedPets.length === 0) {
      setShowPetRequiredPopup(true);
      return;
    }
    setWalkBeingEdited(null);
    setGuidedWalkFlow(false);
    setTouchedFields({});
    setSelectedPetId(savedPets.length === 1 ? savedPets[0].id : "");
    setPlaceInput("");
    setScheduleType("today");
    setWalkTime("");
    setWalkComment("");
    openFormScreen("announce");
  }

  function editWalk(walk: ApiWalk) {
    setWalkBeingEdited(walk);
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
    if (walkBeingEdited) {
      beginFormClose("my-walks");
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

  function openCollectionScreen(nextScreen: "my-walks" | "my-pets") {
    setScreen(nextScreen);
    setCollectionClosing(false);
    setMenuOpen(false);
  }

  function returnToMenu() {
    setCollectionClosing(true);
  }

  function completeCollectionClose() {
    setAnimateMenuOpen(false);
    setMenuClosing(false);
    setMenuButtonClosing(false);
    setMenuOpen(true);
    setScreen("walks");
    setCollectionClosing(false);
  }

  function openMenu() {
    setAnimateMenuOpen(true);
    setMenuButtonClosing(false);
    setMenuClosing(false);
    setMenuOpen(true);
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
          beginFormClose("announce");
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
        beginFormClose(editedWalk ? "my-walks" : "walks");
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
      const data = await response.json() as { deleted?: boolean; error?: string };
      if (!response.ok || !data.deleted) {
        throw new Error(data.error || "Не удалось удалить питомца.");
      }

      const deletedId = petPendingDelete.id;
      setSavedPets((current) => current.filter((pet) => pet.id !== deletedId));
      setMyWalks((current) => current.filter((walk) => walk.petId !== deletedId));
      setSavedWalks((current) => current.filter((walk) => walk.petId !== deletedId));
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

  return (
    <main className="page-shell">
      <section className={`app-shell screen-${screen}`} aria-label="Сервис совместных прогулок">
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
            <button className="primary-button" type="button" onClick={() => setScreen(hasLocation ? "walks" : "location")}>
              Найти компанию
            </button>
          </div>
        )}

        {screen === "location" && (
          <div
            className={`screen form-screen location-screen ${locationOpenedFromMenu ? `subpage-screen-motion ${locationCloseTarget ? "subpage-screen-motion--exit" : "subpage-screen-motion--enter"}` : "location-default"}`}
            onAnimationEnd={(event) => {
              if (
                event.target === event.currentTarget &&
                event.animationName === "subpage-screen-exit" &&
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
              <button className="primary-button form-submit" type="submit" disabled={!locationFormIsValid || locationSaving}>
                {locationSaving ? "Сохраняем…" : hasLocation ? "Сохранить" : "Далее"}
              </button>
            </form>
          </div>
        )}

        {screen === "walks" && (
          <div className="screen walks-screen">
            <header className="walks-header">
              <div className={`walks-heading-copy ${menuOpen ? menuClosing ? "walks-heading-copy--revealing" : animateMenuOpen ? "walks-heading-copy--covered" : "walks-heading-copy--instant" : ""}`}>
                <h1>Прогулки рядом</h1>
                <p>Сегодня · {location.complex}</p>
              </div>
              <button
                ref={closeButtonRef}
                className={`menu-button menu-morph-button ${menuOpen && !menuButtonClosing ? "menu-morph-button--open" : ""} ${menuButtonClosing ? "menu-morph-button--closing" : ""} ${menuOpen && !animateMenuOpen && !menuClosing && !menuButtonClosing ? "menu-morph-button--instant-open" : ""}`}
                type="button"
                aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
                aria-expanded={menuOpen}
                onClick={menuOpen ? closeMenu : openMenu}
                onAnimationEnd={(event) => {
                  if (event.animationName === "menu-frame-show") setMenuButtonClosing(false);
                }}
              >
                <MenuMorphIcon />
              </button>
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
                ) : visibleWalks.map((walk) => (
                  <article className="walk-card" key={walk.id}>
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
                ))}
              </div>
            </div>

            <button
              className="primary-button floating-walk-button"
              type="button"
              disabled={!petsLoaded}
              tabIndex={menuOpen ? -1 : 0}
              aria-hidden={menuOpen}
              onClick={startWalkAnnouncement}
            >
              <Plus aria-hidden="true" />
              Сообщить о прогулке
            </button>

            {menuOpen && (
              <div
                className={`menu-overlay ${menuClosing ? "menu-overlay--closing" : animateMenuOpen ? "" : "menu-overlay--instant"}`}
                role="presentation"
                onMouseDown={(event) => { if (event.target === event.currentTarget) closeMenu(); }}
                onAnimationEnd={(event) => {
                  if (event.target !== event.currentTarget || !menuClosing || event.animationName !== "menu-surface-out") return;
                  setMenuOpen(false);
                  setMenuClosing(false);
                }}
              >
                <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="menu-title">
                  <div className="drawer-header">
                    <h1 className="drawer-menu-content" id="menu-title">Меню</h1>
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
                    <button className="drawer-link" type="button" onClick={() => openCollectionScreen("my-pets")}>
                      <span className="drawer-link-icon"><span className="drawer-pets-icon" aria-hidden="true" /></span>
                      <span>Мои питомцы</span>
                      <ChevronRight />
                    </button>
                    <div className="drawer-footer">
                      <div className="drawer-illustration" aria-hidden="true">
                        <Image src="/menu-corgi.webp" alt="" width={1799} height={874} sizes="430px" />
                      </div>
                      <a className="developer-link" href="https://t.me/kuznetsoviv" target="_blank" rel="noopener noreferrer">
                        ТГ разработчика
                      </a>
                    </div>
                  </div>
                </aside>
              </div>
            )}
          </div>
        )}

        {screen === "my-walks" && (
          <div
            className={`screen collection-screen subpage-screen-motion ${collectionClosing ? "subpage-screen-motion--exit" : "subpage-screen-motion--enter"}`}
            onAnimationEnd={(event) => {
              if (
                event.target === event.currentTarget &&
                event.animationName === "subpage-screen-exit" &&
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
                      onClick={() => editWalk(walk)}
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
            <button className="primary-button floating-walk-button" type="button" disabled={!petsLoaded} onClick={startWalkAnnouncement}>
              <Plus aria-hidden="true" />
              Сообщить о прогулке
            </button>
          </div>
        )}

        {screen === "my-pets" && (
          <div
            className={`screen collection-screen subpage-screen-motion ${collectionClosing ? "subpage-screen-motion--exit" : "subpage-screen-motion--enter"}`}
            onAnimationEnd={(event) => {
              if (
                event.target === event.currentTarget &&
                event.animationName === "subpage-screen-exit" &&
                collectionClosing
              ) completeCollectionClose();
            }}
          >
            <button className="icon-button back-button" type="button" aria-label="Назад в меню" onClick={returnToMenu}>
              <ArrowLeft />
            </button>
            <div className="screen-heading">
              <h1>Мои питомцы</h1>
              <p>Добавленные вами питомцы</p>
            </div>
            <div className="collection-list collection-list-with-action" aria-live="polite">
              {savedPets.length > 0 ? savedPets.map((pet) => (
                <article className="collection-card collection-pet" key={pet.id}>
                  <Image src={pet.photoUrl} alt={`Питомец ${pet.name}`} width={62} height={62} unoptimized />
                  <span className="collection-card-info">
                    <strong>{pet.name}</strong>
                    <small><Dog aria-hidden="true" />{pet.breed}</small>
                    <small><UserRound aria-hidden="true" />{pet.ownerName}</small>
                  </span>
                  <span className="collection-card-actions">
                    <button
                      className="edit-pet-button"
                      type="button"
                      aria-label={`Редактировать питомца ${pet.name}`}
                      onClick={() => editPet(pet)}
                    >
                      <Pencil aria-hidden="true" />
                    </button>
                    <button
                      className="delete-pet-button"
                      type="button"
                      aria-label={`Удалить питомца ${pet.name}`}
                      onClick={() => { setPetDeleteError(""); setPetPendingDelete(pet); }}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </span>
                </article>
              )) : (
                <p className="collection-empty">У вас пока нет добавленных питомцев</p>
              )}
            </div>
            <button className="primary-button floating-pet-button" type="button" onClick={addPet}>
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
                          onClick={() => chooseSharedPlace(place)}
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
                    <button key={value} type="button" className={`filter-button schedule-button ${scheduleType === value ? "active" : ""}`} aria-pressed={scheduleType === value} onClick={() => setScheduleType(value)}>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="field">
                <span>Время прогулки</span>
                <TimeDropdown
                  value={walkTime}
                  invalid={Boolean(touchedFields["walk-time"] && !timeIsValid)}
                  describedBy={touchedFields["walk-time"] && !timeIsValid ? "walk-time-hint" : undefined}
                  onBlur={() => touchField("walk-time")}
                  onChange={(time) => { setWalkTime(time); setWalkSubmitError(""); }}
                />
                {touchedFields["walk-time"] && !timeIsValid && <p className="validation-hint" id="walk-time-hint">Выберите время прогулки</p>}
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
              <h2 id="delete-pet-title">Удалить питомца?</h2>
              <p id="delete-pet-description">Вместе с питомцем будут удалены добавленные для него прогулки</p>
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
