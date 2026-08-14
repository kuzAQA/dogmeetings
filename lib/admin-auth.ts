const encoder = new TextEncoder();

const ADMIN_SESSION_LIFETIME_SECONDS = 8 * 60 * 60;
const ADMIN_CHALLENGE_LIFETIME_SECONDS = 2 * 60;
const PRODUCTION_COOKIE_NAME = "__Host-dogmeet_admin";
const DEVELOPMENT_COOKIE_NAME = "dogmeet_admin_dev";
const PRODUCTION_CHALLENGE_COOKIE_NAME = "__Host-dogmeet_login_challenge";
const DEVELOPMENT_CHALLENGE_COOKIE_NAME = "dogmeet_login_challenge_dev";

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array) {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
}

async function hmac(value: string) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("ADMIN_CONFIGURATION_MISSING");

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

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

function isSecureRequest(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return process.env.NODE_ENV === "production"
    || forwardedProto === "https"
    || new URL(request.url).protocol === "https:";
}

function cookieName(request: Request) {
  return isSecureRequest(request) ? PRODUCTION_COOKIE_NAME : DEVELOPMENT_COOKIE_NAME;
}

function challengeCookieName(request: Request) {
  return isSecureRequest(request) ? PRODUCTION_CHALLENGE_COOKIE_NAME : DEVELOPMENT_CHALLENGE_COOKIE_NAME;
}

function passwordVerifier() {
  const usernameHash = process.env.ADMIN_USERNAME_HASH;
  const passwordHash = process.env.ADMIN_PASSWORD_HASH;
  if (!usernameHash || !passwordHash) throw new Error("ADMIN_CONFIGURATION_MISSING");

  const [algorithm, iterationsText, saltText, expectedText] = passwordHash.split(":");
  const iterations = Number(iterationsText);
  if (
    algorithm !== "pbkdf2_sha256"
    || !Number.isSafeInteger(iterations)
    || iterations < 600_000
    || !saltText
    || !expectedText
  ) {
    throw new Error("ADMIN_CONFIGURATION_INVALID");
  }

  return {
    usernameHash,
    iterations,
    salt: saltText,
    verifier: fromBase64Url(expectedText)
  };
}

async function proofForChallenge(verifier: Uint8Array, challenge: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    verifier,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const proof = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`dogmeet-login:v1:${challenge}`)
  );
  return new Uint8Array(proof);
}

export async function createAdminLoginChallenge(request: Request) {
  const { iterations, salt } = passwordVerifier();
  const challenge = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = Math.floor(Date.now() / 1000) + ADMIN_CHALLENGE_LIFETIME_SECONDS;
  const payload = `v1.${expiresAt}.${challenge}`;
  const signature = toBase64Url(await hmac(payload));
  const parts = [
    `${challengeCookieName(request)}=${payload}.${signature}`,
    "Path=/",
    `Max-Age=${ADMIN_CHALLENGE_LIFETIME_SECONDS}`,
    "HttpOnly",
    "SameSite=Strict"
  ];
  if (isSecureRequest(request)) parts.push("Secure");

  return {
    challenge,
    iterations,
    salt,
    cookie: parts.join("; ")
  };
}

export function clearAdminLoginChallengeCookie(request: Request) {
  const parts = [
    `${challengeCookieName(request)}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Strict"
  ];
  if (isSecureRequest(request)) parts.push("Secure");
  return parts.join("; ");
}

async function validChallenge(request: Request) {
  const value = readCookie(request, challengeCookieName(request));
  const [version, expiresAtText, challenge, signatureText, ...extra] = value.split(".");
  if (
    extra.length
    || version !== "v1"
    || !/^\d+$/.test(expiresAtText ?? "")
    || !/^[A-Za-z0-9_-]{43}$/.test(challenge ?? "")
    || !/^[A-Za-z0-9_-]{43}$/.test(signatureText ?? "")
  ) {
    return "";
  }
  const expiresAt = Number(expiresAtText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return "";
  const payload = `${version}.${expiresAtText}.${challenge}`;
  return timingSafeEqual(await hmac(payload), fromBase64Url(signatureText)) ? challenge : "";
}

export async function verifyAdminLoginProof(request: Request, accountHash: string, proof: string) {
  const challenge = await validChallenge(request);
  const { usernameHash, verifier } = passwordVerifier();
  if (!challenge || !accountHash || !proof) return false;

  const accountMatches = timingSafeEqual(fromBase64Url(accountHash), fromBase64Url(usernameHash));
  const expectedProof = await proofForChallenge(verifier, challenge);
  return accountMatches && timingSafeEqual(expectedProof, fromBase64Url(proof));
}

export async function createAdminSessionCookie(request: Request) {
  const expiresAt = Math.floor(Date.now() / 1000) + ADMIN_SESSION_LIFETIME_SECONDS;
  const nonce = toBase64Url(crypto.getRandomValues(new Uint8Array(18)));
  const payload = `v1.${expiresAt}.${nonce}`;
  const signature = toBase64Url(await hmac(payload));
  const parts = [
    `${cookieName(request)}=${payload}.${signature}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict"
  ];
  if (isSecureRequest(request)) parts.push("Secure");
  return parts.join("; ");
}

export function clearAdminSessionCookie(request: Request) {
  const parts = [
    `${cookieName(request)}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Strict"
  ];
  if (isSecureRequest(request)) parts.push("Secure");
  return parts.join("; ");
}

export async function hasValidAdminSession(request: Request) {
  const value = readCookie(request, cookieName(request));
  const [version, expiresAtText, nonce, signatureText, ...extra] = value.split(".");
  if (
    extra.length
    || version !== "v1"
    || !/^\d+$/.test(expiresAtText ?? "")
    || !/^[A-Za-z0-9_-]{24}$/.test(nonce ?? "")
    || !/^[A-Za-z0-9_-]{43}$/.test(signatureText ?? "")
  ) {
    return false;
  }
  const expiresAt = Number(expiresAtText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;

  const payload = `${version}.${expiresAtText}.${nonce}`;
  return timingSafeEqual(await hmac(payload), fromBase64Url(signatureText));
}

export async function adminRateLimitKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("cf-connecting-ip") || "unknown";
  return toBase64Url(await hmac(`admin-login:${address}`));
}
