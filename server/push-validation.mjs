import { ECDH } from "node:crypto";

export function pushEndpoint(value) {
  if (typeof value !== "string" || value.length > 2048) throw new Error("Некорректная push-подписка.");
  const url = new URL(value);
  const allowed = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"].includes(url.hostname)
    || /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname);
  if (url.protocol !== "https:" || !allowed || url.port || url.username || url.password || url.hash) {
    throw new Error("Неподдерживаемый адрес push-сервиса.");
  }
  return url.href;
}

function keyBytes(value, length) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+={0,2}$/.test(value)) throw new Error("Некорректные ключи push-подписки.");
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length !== length) throw new Error("Некорректные ключи push-подписки.");
  return bytes;
}

export function pushSubscription(value) {
  const endpoint = pushEndpoint(value?.endpoint);
  const p256dh = keyBytes(value?.keys?.p256dh, 65);
  if (p256dh[0] !== 4) throw new Error("Некорректный ключ P-256.");
  ECDH.convertKey(p256dh, "prime256v1");
  const auth = keyBytes(value?.keys?.auth, 16);
  return { endpoint, keys: { p256dh: p256dh.toString("base64url"), auth: auth.toString("base64url") } };
}
