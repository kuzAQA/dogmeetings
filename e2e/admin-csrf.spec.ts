import { expect, test } from "@playwright/test";

test("rejects a forwarded-host origin spoof", async ({ request }) => {
  const response = await request.post("/api/dogsfather/session", {
    headers: {
      Origin: "http://evil.localhost",
      "X-Forwarded-Host": "evil.localhost"
    },
    data: {}
  });

  expect(response.status()).toBe(403);
});
