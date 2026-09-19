import type { LoginChallenge, LoginProof } from "./model";

const loginEncoder = new TextEncoder();

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function base64UrlBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function createPasswordProof(
  password: string,
  challenge: Required<Pick<LoginChallenge, "challenge" | "iterations" | "salt">>
): Promise<string> {
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    loginEncoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const verifier = new Uint8Array(await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: base64UrlBytes(challenge.salt),
      iterations: challenge.iterations
    },
    passwordKey,
    256
  ));
  const proofKey = await crypto.subtle.importKey(
    "raw",
    verifier,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const proof = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    proofKey,
    loginEncoder.encode(`dogmeet-login:v1:${challenge.challenge}`)
  ));

  verifier.fill(0);
  return base64Url(proof);
}

export async function createLoginProof(
  username: string,
  password: string,
  challenge: Required<Pick<LoginChallenge, "challenge" | "iterations" | "salt">>
): Promise<LoginProof> {
  const accountHash = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    loginEncoder.encode(username.normalize("NFKC").trim())
  ));
  const proof = await createPasswordProof(password, challenge);
  return { accountHash: base64Url(accountHash), proof };
}
