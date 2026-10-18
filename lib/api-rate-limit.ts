import { isIP } from "node:net";
import { timingSafeEqual } from "node:crypto";

// ponytail: one app process; use shared storage if the app gains replicas.
const buckets = new Map<string, { tokens: number; updatedAt: number }>();
let nextSweepAt = 0;

export function consumeApiLimit(key: string, capacity: number, perMinute: number, now = Date.now()) {
  if (now >= nextSweepAt) {
    for (const [key, bucket] of buckets) {
      if (now - bucket.updatedAt >= 120_000) buckets.delete(key);
    }
    nextSweepAt = now + 30_000;
  }
  const previous = buckets.get(key);
  if (!previous && buckets.size >= 10_000) return 30;
  const tokens = Math.min(capacity, (previous?.tokens ?? capacity) +
    Math.max(0, now - (previous?.updatedAt ?? now)) * perMinute / 60_000);
  if (tokens < 1) return Math.max(1, Math.ceil((1 - tokens) * 60 / perMinute));
  buckets.set(key, { tokens: tokens - 1, updatedAt: now });
  return 0;
}

export async function limitApiRequest(request: Request) {
  const path = new URL(request.url).pathname;
  if (!path.startsWith("/api/")) return;
  if (path === "/api/health" && (process.env.API_TRUST_PROXY !== "1" || !request.headers.get("x-dogmeet-client-ip"))) return;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const candidate = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (path === "/api/telegram/webhook" && secret &&
      Buffer.byteLength(candidate) === Buffer.byteLength(secret) &&
      timingSafeEqual(Buffer.from(candidate), Buffer.from(secret))) return;
  const forwarded = process.env.API_TRUST_PROXY === "1" ? request.headers.get("x-dogmeet-client-ip") : null;
  const ip = forwarded && isIP(forwarded) ? forwarded : "direct";
  let retryAfter = consumeApiLimit(`ip:${ip}`, 30, 120);
  if (!retryAfter && path === "/api/session" && request.method === "POST") {
    retryAfter = consumeApiLimit(`session-create:${ip}`, 5, 10);
  }
  if (!retryAfter && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const token = request.headers.get("cookie")?.match(/(?:^|;\s*)dogmeet_session=([0-9a-f]{64})(?:;|$)/i)?.[1];
    if (token) {
      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
      const key = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
      retryAfter = consumeApiLimit(`write:${key}`, 10, 20);
    }
  }
  if (retryAfter) return Response.json({ error: "Слишком много запросов. Попробуйте позже." }, {
    status: 429, headers: { "Retry-After": String(retryAfter), "Cache-Control": "no-store" }
  });
}
