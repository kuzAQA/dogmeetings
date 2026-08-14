import { eq } from "drizzle-orm";
import webPush from "web-push";
import { withDb } from "../db";
import { adminPushSubscriptions } from "../db/schema";

type StoredPushSubscription = {
  endpointHash: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function vapidConfiguration() {
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT;
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) return null;
  if (!subject.startsWith("mailto:") && !subject.startsWith("https://")) return null;
  return { subject, publicKey, privateKey };
}

export function adminPushPublicKey() {
  return vapidConfiguration()?.publicKey ?? "";
}

function isExpiredSubscription(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const statusCode = "statusCode" in error ? Number(error.statusCode) : 0;
  return statusCode === 404 || statusCode === 410;
}

async function sendToSubscription(subscription: StoredPushSubscription, payload: string) {
  try {
    await webPush.sendNotification({
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth
      }
    }, payload, {
      TTL: 60 * 60,
      urgency: "high"
    });
  } catch (error) {
    if (isExpiredSubscription(error)) {
      await withDb((db) => db
        .delete(adminPushSubscriptions)
        .where(eq(adminPushSubscriptions.endpointHash, subscription.endpointHash)));
    }
  }
}

export async function sendAdminLocationRequestNotification() {
  const configuration = vapidConfiguration();
  if (!configuration) return;

  webPush.setVapidDetails(
    configuration.subject,
    configuration.publicKey,
    configuration.privateKey
  );

  const subscriptions = await withDb((db) => db
    .select({
      endpointHash: adminPushSubscriptions.endpointHash,
      endpoint: adminPushSubscriptions.endpoint,
      p256dh: adminPushSubscriptions.p256dh,
      auth: adminPushSubscriptions.auth
    })
    .from(adminPushSubscriptions));

  const payload = JSON.stringify({
    title: "Новая заявка",
    body: "Пришла новая заявка на добавление локации",
    url: "/dogsfather",
    tag: "dogmeet-location-request"
  });

  await Promise.allSettled(
    subscriptions.map((subscription) => sendToSubscription(subscription, payload))
  );
}
