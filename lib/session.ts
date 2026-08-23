import { and, eq, gt } from "drizzle-orm";
import { withDb } from "../db";
import { clientSessions } from "../db/schema";

export const SESSION_COOKIE_NAME = "dogmeet_session";
export const SESSION_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

export type SessionLocation = {
  city: string;
  district: string;
  complex: string;
};

export type ClientSession = {
  token: string;
  tokenHash: string;
  clientId: string;
  location: SessionLocation | null;
  hasLocation: boolean;
  expiresAt: Date;
};

function readCookie(request: Request, name: string) {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return "";
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return bytesToHex(new Uint8Array(digest));
}

function nextExpiry() {
  return new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
}

function mapSession(
  token: string,
  row: typeof clientSessions.$inferSelect
): ClientSession {
  const hasCompleteLocation = Boolean(
    row.hasLocation && row.city && row.district && row.residentialComplex
  );

  return {
    token,
    tokenHash: row.tokenHash,
    clientId: row.clientId,
    location: hasCompleteLocation
      ? {
          city: row.city!,
          district: row.district!,
          complex: row.residentialComplex!
        }
      : null,
    hasLocation: hasCompleteLocation,
    expiresAt: row.expiresAt
  };
}

export async function getClientSession(request: Request) {
  const token = readCookie(request, SESSION_COOKIE_NAME);
  if (!/^[0-9a-f]{64}$/i.test(token)) return null;

  const tokenHash = await hashToken(token);
  const [row] = await withDb((db) => db
    .select()
    .from(clientSessions)
    .where(and(
      eq(clientSessions.tokenHash, tokenHash),
      gt(clientSessions.expiresAt, new Date())
    ))
    .limit(1));

  return row ? mapSession(token, row) : null;
}

export async function createClientSession(input: {
  clientId: string;
  location?: SessionLocation | null;
  hasLocation?: boolean;
  replaceExisting?: boolean;
}) {
  const token = randomToken();
  const tokenHash = await hashToken(token);
  const now = new Date();
  const expiresAt = nextExpiry();
  const hasLocation = Boolean(
    input.hasLocation && input.location?.city && input.location.district && input.location.complex
  );

  if (input.replaceExisting) {
    const [existing] = await withDb((db) => db
      .select()
      .from(clientSessions)
      .where(eq(clientSessions.clientId, input.clientId))
      .limit(1));

    if (existing) {
      const [row] = await withDb((db) => db
        .update(clientSessions)
        .set({
          tokenHash,
          ...(hasLocation ? {
            city: input.location!.city,
            district: input.location!.district,
            residentialComplex: input.location!.complex,
            hasLocation: true
          } : {}),
          expiresAt,
          lastSeenAt: now,
          updatedAt: now
        })
        .where(eq(clientSessions.clientId, input.clientId))
        .returning());

      return mapSession(token, row);
    }
  }

  const [row] = await withDb((db) => db
    .insert(clientSessions)
    .values({
      tokenHash,
      clientId: input.clientId,
      city: hasLocation ? input.location!.city : null,
      district: hasLocation ? input.location!.district : null,
      residentialComplex: hasLocation ? input.location!.complex : null,
      hasLocation,
      expiresAt,
      lastSeenAt: now,
      updatedAt: now
    })
    .returning());

  return mapSession(token, row);
}

export async function refreshClientSession(session: ClientSession) {
  const now = new Date();
  const expiresAt = nextExpiry();
  await withDb((db) => db
    .update(clientSessions)
    .set({ expiresAt, lastSeenAt: now, updatedAt: now })
    .where(eq(clientSessions.tokenHash, session.tokenHash)));

  return { ...session, expiresAt };
}

export async function updateSessionLocation(
  session: ClientSession,
  location: SessionLocation
) {
  const now = new Date();
  const expiresAt = nextExpiry();
  const [row] = await withDb((db) => db
    .update(clientSessions)
    .set({
      city: location.city,
      district: location.district,
      residentialComplex: location.complex,
      hasLocation: true,
      expiresAt,
      lastSeenAt: now,
      updatedAt: now
    })
    .where(eq(clientSessions.tokenHash, session.tokenHash))
    .returning());

  return mapSession(session.token, row);
}

function isSecureRequest(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return process.env.NODE_ENV === "production"
    || forwardedProto === "https"
    || new URL(request.url).protocol === "https:";
}

export function sessionCookie(request: Request, session: ClientSession) {
  const parts = [
    `${SESSION_COOKIE_NAME}=${session.token}`,
    "Path=/",
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    `Expires=${session.expiresAt.toUTCString()}`,
    "HttpOnly",
    "SameSite=Strict"
  ];
  if (isSecureRequest(request)) parts.push("Secure");
  return parts.join("; ");
}

export function privateJson(
  body: unknown,
  init: ResponseInit = {},
  cookie?: string | string[]
) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, private");
  if (cookie) {
    for (const value of Array.isArray(cookie) ? cookie : [cookie]) {
      headers.append("Set-Cookie", value);
    }
  }
  return Response.json(body, { ...init, headers });
}

export function isSameOriginRequest(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = forwardedHost || request.headers.get("host") || new URL(request.url).host;
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function sessionPayload(session: ClientSession) {
  return {
    hasLocation: session.hasLocation,
    location: session.location
  };
}
