import { expect, test } from "@playwright/test";
import { location, mockApp, openNearby, pet } from "./fixtures";

const token = "0123456789abcdef0123";
test("clean invitation creates session with token, skips onboarding and resumes after reload", async ({ page, context }) => {
  await mockApp(page);
  expect(await context.cookies()).toEqual([]);
  let created = false;
  const sessionRequests: unknown[] = [];
  await page.route("**/api/session", async (route) => {
    sessionRequests.push(route.request().postDataJSON());
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({ shareToken: token });
    created = true;
    await route.fulfill({ json: { clientId: "new-client", hasLocation: true, location } });
  });
  let accepts = 0;
  await page.route(`**/api/pet-shares/${token}`, async route => {
    expect(created).toBe(true);
    if (route.request().method() === "POST") accepts++;
    await route.fulfill({ json: route.request().method() === "POST" ? { petId: pet.id, added: true } : { pet } });
  });
  await page.goto(`/share/${token}`);
  await expect(page.getByRole("heading", { name: "Приглашение", exact: true })).toBeVisible();
  await expect(page.locator(".welcome-screen, .location-screen")).toHaveCount(0);
  expect(accepts).toBe(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Добавить к моим питомцам" })).toBeVisible();
  expect(sessionRequests).toHaveLength(2);
  expect(accepts).toBe(0);
  await page.getByRole("button", { name: "Добавить к моим питомцам" }).click();
  await expect(page.getByRole("heading", { name: "Теперь вы гуляете вместе" })).toBeVisible();
  expect(accepts).toBe(1);
  await page.route("**/api/session", route => route.fulfill({ json: { hasLocation: true, location } }));
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Мои питомцы", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Собака Луна/ })).toBeVisible();
  await expect(page.locator(".dock-item--pets")).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".pets-screen")).toHaveClass(/collection-screen--dock/);
});

test("QR uses invitation URL, retries errors and changes on rotation on mobile", async ({ page }, info) => {
  await openNearby(page);
  let attempts = 0;
  let rotations = 0;
  let finishRotation = () => {};
  const rotationPending = new Promise<void>((resolve) => { finishRotation = resolve; });
  await page.route("**/api/pet-shares", async route => {
    attempts++;
    if (attempts === 1) return route.fulfill({ status: 500, json: { error: "Не удалось создать QR-код." } });
    if (route.request().method() === "PATCH") { rotations++; await rotationPending; }
    await route.fulfill({ json: { link: `https://dogmeet.ru/share/${rotations ? "1123456789abcdef0123" : token}` } });
  });
  await page.getByRole("button", { name: "Питомцы", exact: true }).click();
  await page.getByRole("button", { name: /Собака Луна/ }).click();
  await page.getByRole("button", { name: "Поделиться питомцем", exact: false }).click();
  const dialog = page.getByRole("dialog", { name: "Поделиться питомцем" });
  await expect(dialog.getByRole("alert")).toHaveText("Не удалось создать QR-код.");
  await dialog.getByRole("button", { name: "Попробовать снова" }).click();
  const qr = dialog.getByRole("img", { name: "Одноразовый QR-код" });
  await expect(qr).toHaveAttribute("data-value", `https://dogmeet.ru/share/${token}`);
  await expect(dialog.getByRole("textbox")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Скопировать ссылку" })).toBeVisible();
  await expect(qr.locator("rect")).toHaveCount(0);
  await expect(qr).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(dialog.getByText("Одноразовый QR-код", { exact: true })).toHaveCount(0);
  await expect(dialog.getByText("QR-код и ссылка действуют для одного добавления питомца")).toHaveCSS("text-align", "center");
  const firstPath = await qr.locator("path").getAttribute("d");
  await expect.poll(async () => {
    const bounds = (await qr.boundingBox())!;
    return bounds.y >= 0 && bounds.y + bounds.height <= page.viewportSize()!.height;
  }).toBe(true);
  await page.screenshot({ path: info.outputPath("pet-share-mobile.png") });
  const initialHeight = (await dialog.boundingBox())!.height;
  await dialog.getByRole("button", { name: "Получить новые QR-код и ссылку" }).click();
  try {
    await expect(dialog.getByRole("status", { name: "Обновляем QR-код" })).toBeVisible();
    await expect(qr).toHaveAttribute("data-value", `https://dogmeet.ru/share/${token}`);
    await expect(qr).toHaveCSS("filter", "blur(4px)");
    await expect(dialog.getByRole("button", { name: "Скопировать ссылку", exact: true })).toBeDisabled();
    await expect(dialog.getByRole("button", { name: "Поделиться", exact: true })).toBeDisabled();
    await expect(dialog.locator(".pet-share-qr-loading .loader")).toHaveCSS("animation-name", "spin");
    expect(Math.abs((await dialog.boundingBox())!.height - initialHeight)).toBeLessThan(1);
    await expect(dialog.getByRole("button", { name: "Обновляем…" })).toBeDisabled();
    await page.screenshot({ path: info.outputPath("pet-share-refreshing.png") });
  } finally { finishRotation(); }

  await expect(dialog.getByRole("heading", { name: "Заменить QR-код?" })).toHaveCount(0);
  await expect(qr).toHaveAttribute("data-value", "https://dogmeet.ru/share/1123456789abcdef0123");
  expect(await qr.locator("path").getAttribute("d")).not.toBe(firstPath);
  expect(rotations).toBe(1);
  await expect(qr).toHaveCSS("filter", "none");
  await expect(dialog.getByRole("status", { name: "Обновляем QR-код" })).toHaveCount(0);
});
