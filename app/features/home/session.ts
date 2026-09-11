import { ApiRequestError, requestJson } from "../api/client";
import {
  CLIENT_ID_KEY,
  HAS_LOCATION_KEY,
  STORAGE_KEY,
  type LegacySessionData,
  type Location,
  type SessionBootstrapData,
  uuidPattern
} from "./model";

function isLocation(value: unknown): value is Location {
  if (!value || typeof value !== "object") return false;
  return "city" in value && typeof value.city === "string"
    && "district" in value && typeof value.district === "string"
    && "complex" in value && typeof value.complex === "string";
}

function readLegacySessionData(): LegacySessionData {
  try {
    const legacyClientId = window.localStorage.getItem(CLIENT_ID_KEY) ?? "";
    const storedLocation = window.localStorage.getItem(STORAGE_KEY);
    const parsedLocation: unknown = storedLocation ? JSON.parse(storedLocation) : null;
    const legacyLocation = isLocation(parsedLocation) ? {
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

export function clearLegacySessionData() {
  try {
    window.localStorage.removeItem(CLIENT_ID_KEY);
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(HAS_LOCATION_KEY);
  } catch {
    // Работа с сайтом уже продолжается через HttpOnly cookie.
  }
}

function normalizeSessionResponse(data: Partial<SessionBootstrapData>) {
  return {
    hasLocation: Boolean(data.hasLocation),
    location: data.location ?? null
  };
}

async function postSessionBootstrap(body: LegacySessionData) {
  const data = await requestJson<Partial<SessionBootstrapData>>("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return normalizeSessionResponse(data);
}

async function getSessionBootstrap() {
  const data = await requestJson<Partial<SessionBootstrapData>>("/api/session", { cache: "no-store" });
  return normalizeSessionResponse(data);
}

let sessionBootstrapPromise: Promise<SessionBootstrapData> | null = null;

export function resetSessionBootstrap() {
  sessionBootstrapPromise = null;
}

export function bootstrapSession() {
  if (!sessionBootstrapPromise) {
    sessionBootstrapPromise = getSessionBootstrap()
      .catch(async (error: ApiRequestError) => {
        if (error.status !== 401) throw error;

        try {
          await postSessionBootstrap(readLegacySessionData());
        } catch (migrationError) {
          if (!(migrationError instanceof ApiRequestError) || migrationError.status !== 409) throw migrationError;
          await new Promise((resolve) => window.setTimeout(resolve, 100));
        }

        try {
          return await getSessionBootstrap();
        } catch (verificationError) {
          if (verificationError instanceof ApiRequestError && verificationError.status === 401) {
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
