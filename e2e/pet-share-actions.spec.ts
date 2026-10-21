import { expect, test, type Page } from "@playwright/test";
import { openNearby } from "./fixtures";

async function openInvitation(page: Page) {
  await openNearby(page);
  let rotations = 0;
  await page.route("**/api/pet-shares", route => {
    if (route.request().method() === "PATCH") rotations++;
    return route.fulfill({ json: { link: `https://dogmeet.ru/share/${"a".repeat(100)}-${rotations}` } });
  });
  await page.getByRole("button", { name: "Питомцы", exact: true }).click();
  await page.getByRole("button", { name: /Собака Луна/ }).click();
  await page.getByRole("button", { name: "Поделиться питомцем", exact: false }).click();
  const dialog = page.getByRole("dialog", { name: "Поделиться питомцем" });
  await expect(dialog.getByRole("img", { name: "Одноразовый QR-код" })).toBeVisible();
  return dialog;
}

async function mockDevice(page: Page, share: "success" | "cancel" | "error" | "missing", copyFails = false) {
  await page.addInitScript(({ share, copyFails }) => {
    const calls = { copied: [] as string[], shared: [] as ShareData[], activated: false };
    Object.assign(window, { invitationCalls: calls });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (url: string) => {
      if (copyFails) throw new Error("Clipboard denied");
      calls.copied.push(url);
    } } });
    Object.defineProperty(navigator, "share", { configurable: true, value: share === "missing" ? undefined : async (data: ShareData) => {
      calls.activated = navigator.userActivation.isActive;
      calls.shared.push(data);
      if (share === "cancel") throw new DOMException("Cancelled", "AbortError");
      if (share === "error") throw new DOMException("Denied", "NotAllowedError");
    } });
  }, { share, copyFails });
}

const calls = (page: Page) => page.evaluate(() => (window as unknown as { invitationCalls: { copied: string[]; shared: ShareData[]; activated: boolean } }).invitationCalls);

test("invitation copy, native share, rotation and mobile layout use the QR URL", async ({ page }, info) => {
  await mockDevice(page, "success");
  const dialog = await openInvitation(page);
  const qr = dialog.getByRole("img", { name: "Одноразовый QR-код" });
  const link = dialog.getByRole("link");
  const copy = dialog.getByRole("button", { name: "Скопировать ссылку", exact: true });
  const share = dialog.getByRole("button", { name: "Поделиться", exact: true });
  const url = (await qr.getAttribute("data-value"))!;
  await expect(link).toHaveText(url);
  await expect(link).toHaveAttribute("href", url);
  await page.keyboard.press("Tab");
  await copy.focus();
  await expect(copy).toBeFocused();
  await expect(copy).toHaveCSS("outline-style", "solid");
  await copy.click();
  await expect(dialog.getByRole("status")).toHaveText("Ссылка скопирована");
  expect((await calls(page)).copied).toEqual([url]);
  await page.keyboard.press("Tab");
  await expect(share).toBeFocused();
  await expect(share).toHaveCSS("outline-style", "solid");
  await share.click();
  expect((await calls(page)).shared).toEqual([{ url }]);
  expect((await calls(page)).activated).toBe(true);
  const bounds = (await dialog.boundingBox())!;
  for (const element of [link, copy, share]) {
    const box = (await element.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(bounds.x);
    expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
  }
  const qrBounds = (await qr.boundingBox())!;
  const contentBounds = (await dialog.locator(".sheet-content").boundingBox())!;
  expect(qrBounds.y).toBeGreaterThanOrEqual(contentBounds.y);
  expect(qrBounds.y + qrBounds.height).toBeLessThanOrEqual(contentBounds.y + contentBounds.height);
  await page.screenshot({ path: info.outputPath("invitation.png") });
  await dialog.getByRole("button", { name: "Получить новые QR-код и ссылку" }).click();
  await expect(qr).not.toHaveAttribute("data-value", url);
  const newUrl = (await qr.getAttribute("data-value"))!;
  await expect(link).toHaveAttribute("href", newUrl);
  await expect(link).toHaveText(newUrl);
  await expect(dialog.getByRole("status")).toHaveCount(0);
  await copy.click();
  await share.click();
  expect((await calls(page)).copied).toEqual([url, newUrl]);
  expect((await calls(page)).shared).toEqual([{ url }, { url: newUrl }]);
});

for (const mode of ["cancel", "error", "missing"] as const) {
  test(`invitation share handles ${mode}`, async ({ page }) => {
    await mockDevice(page, mode);
    const dialog = await openInvitation(page);
    await dialog.getByRole("button", { name: "Поделиться", exact: true }).click();
    if (mode === "missing") {
      await expect(dialog.getByRole("status")).toHaveText("Системное меню недоступно. Ссылка скопирована");
      expect((await calls(page)).copied).toEqual([await dialog.getByRole("link").getAttribute("href")]);
    } else if (mode === "error") {
      await expect(dialog.getByRole("alert")).toHaveText("Не удалось поделиться ссылкой. Попробуйте ещё раз.");
    } else {
      expect((await calls(page)).shared).toHaveLength(1);
      await expect(dialog.getByRole("alert")).toHaveCount(0);
      await expect(dialog.getByRole("status")).toHaveCount(0);
    }
  });
}

for (const mode of ["success", "missing"] as const) {
  test(`invitation clipboard failure has no success feedback (${mode})`, async ({ page }) => {
    await mockDevice(page, mode, true);
    const dialog = await openInvitation(page);
    await dialog.getByRole("button", { name: mode === "missing" ? "Поделиться" : "Скопировать ссылку", exact: true }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Не удалось скопировать ссылку. Попробуйте ещё раз.");
    await expect(dialog.getByRole("status")).toHaveCount(0);
    expect((await calls(page)).copied).toEqual([]);
  });
}


test("invitation copy confirms only after clipboard resolves", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => new Promise<void>(resolve => {
      Object.assign(window, { finishInvitationCopy: resolve });
    }) } });
  });
  const dialog = await openInvitation(page);
  await dialog.getByRole("button", { name: "Скопировать ссылку", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { finishInvitationCopy: () => void }).finishInvitationCopy());
  await expect(dialog.getByRole("status")).toHaveText("Ссылка скопирована");
});
