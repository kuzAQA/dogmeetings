import { eq } from "drizzle-orm";
import { withDb } from "../../../../db";
import { adminPushSubscriptions } from "../../../../db/schema";
import { hasValidAdminSession } from "../../../../lib/admin-auth";
import { adminPushPublicKey } from "../../../../lib/admin-push";
import { isSameOriginRequest, privateJson } from "../../../../lib/session";

const ALLOWED_PUSH_HOSTS = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.services.mozilla.com",
  "web.push.apple.com",
  "notify.windows.com",
  "wns.windows.com"
];

type SubscriptionPayload = {
  endpoint?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  } | null;
};

async function endpointHash(endpoint: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validEndpoint(value: unknown) {
  const endpoint = String(value ?? "").trim();
  if (!endpoint || endpoint.length > 2048) return "";
  try {
    const url = new URL(endpoint);
    const hostIsAllowed = ALLOWED_PUSH_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
    return url.protocol === "https:" && hostIsAllowed ? endpoint : "";
  } catch {
    return "";
  }
}

async function authorize(request: Request, mutation = false) {
  if (mutation && !isSameOriginRequest(request)) return false;
  return hasValidAdminSession(request);
}

export async function GET(request: Request) {
  try {
    if (!await authorize(request)) return privateJson({ error: "Требуется вход." }, { status: 401 });
    const publicKey = adminPushPublicKey();
    if (!publicKey) {
      return privateJson({ error: "Уведомления ещё не настроены на сервере." }, { status: 503 });
    }
    return privateJson({ publicKey });
  } catch {
    return privateJson({ error: "Не удалось проверить настройки уведомлений." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!await authorize(request, true)) return privateJson({ error: "Требуется вход." }, { status: 401 });
    const payload = await request.json().catch(() => null) as SubscriptionPayload | null;
    const endpoint = validEndpoint(payload?.endpoint);
    const p256dh = String(payload?.keys?.p256dh ?? "");
    const auth = String(payload?.keys?.auth ?? "");
    if (
      !endpoint
      || !/^[A-Za-z0-9_-]{40,180}$/.test(p256dh)
      || !/^[A-Za-z0-9_-]{16,64}$/.test(auth)
    ) {
      return privateJson({ error: "Некорректная push-подписка." }, { status: 400 });
    }

    const hash = await endpointHash(endpoint);
    const now = new Date();
    await withDb((db) => db
      .insert(adminPushSubscriptions)
      .values({
        endpointHash: hash,
        endpoint,
        p256dh,
        auth,
        userAgent: request.headers.get("user-agent")?.slice(0, 300) || null,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: adminPushSubscriptions.endpointHash,
        set: { endpoint, p256dh, auth, userAgent: request.headers.get("user-agent")?.slice(0, 300) || null, updatedAt: now }
      }));
    return privateJson({ subscribed: true });
  } catch {
    return privateJson({ error: "Не удалось включить уведомления." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    if (!await authorize(request, true)) return privateJson({ error: "Требуется вход." }, { status: 401 });
    const payload = await request.json().catch(() => null) as { endpoint?: unknown } | null;
    const endpoint = validEndpoint(payload?.endpoint);
    if (!endpoint) return privateJson({ error: "Некорректная push-подписка." }, { status: 400 });
    const hash = await endpointHash(endpoint);
    await withDb((db) => db
      .delete(adminPushSubscriptions)
      .where(eq(adminPushSubscriptions.endpointHash, hash)));
    return privateJson({ subscribed: false });
  } catch {
    return privateJson({ error: "Не удалось отключить уведомления." }, { status: 500 });
  }
}
