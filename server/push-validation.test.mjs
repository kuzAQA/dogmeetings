import assert from "node:assert/strict";
import { createECDH } from "node:crypto";
import test from "node:test";
import { pushEndpoint, pushSubscription } from "./push-validation.mjs";

test("push endpoints accept only HTTPS push providers, never arbitrary HTTP targets", () => {
  for (const endpoint of ["http://fcm.googleapis.com/fcm/send/a", "https://127.0.0.1/a", "https://fcm.googleapis.com.evil.test/a", "https://user@fcm.googleapis.com/a", "https://fcm.googleapis.com:444/a", "https://fcm.googleapis.com/a#x"]) {
    assert.throws(() => pushEndpoint(endpoint));
  }
  for (const endpoint of ["https://fcm.googleapis.com/fcm/send/a", "https://updates.push.services.mozilla.com/wpush/v2/a", "https://web.push.apple.com/a", "https://wns2-par02p.notify.windows.com/w/?token=a"]) assert.equal(pushEndpoint(endpoint), endpoint);
});

test("push keys must be a valid P-256 point and a 16-byte auth secret", () => {
  const key = createECDH("prime256v1"); key.generateKeys();
  const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/a", keys: { p256dh: key.getPublicKey().toString("base64url"), auth: Buffer.alloc(16).toString("base64url") } };
  assert.deepEqual(pushSubscription(subscription), subscription);
  assert.throws(() => pushSubscription({ ...subscription, keys: { ...subscription.keys, p256dh: Buffer.alloc(65).toString("base64url") } }));
  assert.throws(() => pushSubscription({ ...subscription, keys: { ...subscription.keys, auth: "bad" } }));
  assert.throws(() => pushSubscription(null));
});
