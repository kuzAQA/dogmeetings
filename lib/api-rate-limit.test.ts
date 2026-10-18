import assert from "node:assert/strict";
import test from "node:test";
import { consumeApiLimit, limitApiRequest } from "./api-rate-limit.ts";

const trust = process.env.API_TRUST_PROXY;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
test.afterEach(() => {
  if (trust === undefined) delete process.env.API_TRUST_PROXY; else process.env.API_TRUST_PROXY = trust;
  if (secret === undefined) delete process.env.TELEGRAM_WEBHOOK_SECRET; else process.env.TELEGRAM_WEBHOOK_SECRET = secret;
});

test("token bucket permits the burst, rejects excess and refills at its configured rate", () => {
  const now = Date.now();
  for (let i = 0; i < 3; i++) assert.equal(consumeApiLimit("test-refill", 3, 60, now), 0);
  assert.equal(consumeApiLimit("test-refill", 3, 60, now), 1);
  assert.equal(consumeApiLimit("test-refill", 3, 60, now + 999), 1);
  assert.equal(consumeApiLimit("test-refill", 3, 60, now + 1000), 0);
});

test("IP limits cover reads and return 429 with Retry-After without database access", async () => {
  process.env.API_TRUST_PROXY = "1";
  const request = new Request("https://dogmeet.ru/api/walks", { headers: { "x-dogmeet-client-ip": "192.0.2.1" } });
  for (let i = 0; i < 30; i++) assert.equal(await limitApiRequest(request), undefined);
  const response = await limitApiRequest(request);
  assert.equal(response?.status, 429);
  assert.ok(Number(response?.headers.get("Retry-After")) >= 1);
  assert.equal(response?.headers.get("Cache-Control"), "no-store");
  assert.equal((await limitApiRequest(new Request("https://dogmeet.ru/api/health", { headers: { "x-dogmeet-client-ip": "192.0.2.1" } })))?.status, 429);
  assert.equal(await limitApiRequest(new Request("http://127.0.0.1/api/health")), undefined);
});

test("session writes are limited across IPs; another session remains usable", async () => {
  process.env.API_TRUST_PROXY = "1";
  for (let i = 0; i <= 10; i++) {
    const response = await limitApiRequest(new Request("https://dogmeet.ru/api/walks", { method: "PATCH",
      headers: { "x-dogmeet-client-ip": `192.0.2.${i + 20}`, cookie: `dogmeet_session=${"a".repeat(64)}` } }));
    assert.equal(response?.status, i === 10 ? 429 : undefined);
  }
  assert.equal(await limitApiRequest(new Request("https://dogmeet.ru/api/pets", { method: "POST",
    headers: { "x-dogmeet-client-ip": "192.0.2.20", cookie: `dogmeet_session=${"b".repeat(64)}` } })), undefined);
});

test("session creation has its own IP limit", async () => {
  process.env.API_TRUST_PROXY = "1";
  const request = new Request("https://dogmeet.ru/api/session", { method: "POST", headers: { "x-dogmeet-client-ip": "192.0.2.100" } });
  for (let i = 0; i < 5; i++) assert.equal(await limitApiRequest(request), undefined);
  assert.equal((await limitApiRequest(request))?.status, 429);
});

test("untrusted forwarded IP headers cannot bypass the limiter", async () => {
  delete process.env.API_TRUST_PROXY;
  for (let i = 0; i <= 30; i++) {
    const response = await limitApiRequest(new Request("https://dogmeet.ru/api/locations", {
      headers: { "x-dogmeet-client-ip": `192.0.2.${i}`, "x-forwarded-for": `198.51.100.${i}` } }));
    assert.equal(response?.status, i === 30 ? 429 : undefined);
  }
});

test("health and authenticated bot callbacks remain available; an invalid secret is not exempt", async () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = "s".repeat(64);
  assert.equal(await limitApiRequest(new Request("https://dogmeet.ru/api/health")), undefined);
  assert.equal(await limitApiRequest(new Request("https://dogmeet.ru/api/telegram/webhook", { method: "POST",
    headers: { "x-telegram-bot-api-secret-token": process.env.TELEGRAM_WEBHOOK_SECRET } })), undefined);
  assert.equal((await limitApiRequest(new Request("https://dogmeet.ru/api/telegram/webhook", { method: "POST" })))?.status, 429);
});

test("attacker-controlled keys cannot grow memory without a bound; expired buckets recover", () => {
  const now = Date.now() + 10_000_000;
  for (let i = 0; i < 10_000; i++) assert.equal(consumeApiLimit(`capacity-${i}`, 1, 1, now), 0);
  assert.equal(consumeApiLimit("capacity-overflow", 1, 1, now), 30);
  assert.equal(consumeApiLimit("capacity-overflow", 1, 1, now + 120_000), 0);
});
