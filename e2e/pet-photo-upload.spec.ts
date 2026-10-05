import { expect, test } from "@playwright/test";
import sharp from "sharp/lib/index.js";
import { encodePetPhotoFile } from "../server/pet-photo.mjs";
import { openNearby, pet } from "./fixtures";

const cases = [
  ...(["jpeg", "png", "webp"] as const).map((format) => ({ format, width: 3800, height: 3040, label: "large" })),
  { format: "png" as const, width: 800, height: 600, label: "small" },
  { format: "webp" as const, width: 2400, height: 3800, label: "portrait" }
];
for (const { format, width, height, label } of cases) {
test(`prepares ${label} ${format} photos in browser and compares AVIF sizes`, async ({ page }) => {
  test.setTimeout(60_000);
  const pipeline = sharp("public/walk-hero-screen.webp").resize(width, height, { fit: "fill" });
  const source = await (format === "jpeg" ? pipeline.jpeg({ quality: 100, chromaSubsampling: "4:4:4" }) : format === "png" ? pipeline.png() : pipeline.webp({ quality: 90 })).toBuffer();
  if (format === "png" && label === "large") expect(source.length).toBeGreaterThan(10 * 1024 * 1024);
  await openNearby(page);
  await page.getByRole("button", { name: "Питомцы", exact: true }).click();
  await page.getByRole("button", { name: "Добавить питомца", exact: true }).click();
  await page.getByRole("button", { name: "Выбрать фотографию", exact: false }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: `phone.${format}`, mimeType: `image/${format}`, buffer: source });
  await page.getByRole("button", { name: "Использовать фото" }).click();
  await page.getByLabel("Имя питомца").fill("Боня");
  await page.getByLabel("Имя хозяина").fill("Анна");
  await page.getByLabel("Порода", { exact: true }).fill("Корги");
  let uploaded: File | null = null;
  await page.route("**/api/pets", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const request = new Request(route.request().url(), { method: "POST", headers: route.request().headers(), body: new Uint8Array(route.request().postDataBuffer()!) });
    uploaded = (await request.formData()).get("photo") as File;
    await route.fulfill({ json: { pet } });
  });
  await page.getByRole("button", { name: "Добавить питомца", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Рады знакомству!" })).toBeVisible();
  expect(uploaded).not.toBeNull();
  const photo = uploaded! as File;
  if (label === "small") {
    expect(photo.type).toBe(`image/${format}`);
    expect(photo.name).toBe(`phone.${format}`);
    expect(Buffer.from(await photo.arrayBuffer()).equals(source)).toBe(true);
    return;
  }
  const scale = 1600 / Math.max(width, height);
  const expectedWidth = Math.round(width * scale);
  const expectedHeight = Math.round(height * scale);
  expect(photo.type).toBe("image/webp");
  expect(photo.name).toBe("phone.webp");
  expect(photo.size).toBeLessThan(source.length);
  const uploadedBytes = Buffer.from(await photo.arrayBuffer());
  const metadata = await sharp(uploadedBytes).metadata();
  expect(metadata.width).toBe(expectedWidth);
  expect(metadata.height).toBe(expectedHeight);
  const afterResize = await encodePetPhotoFile(photo);
  const direct = await encodePetPhotoFile(new File([Uint8Array.from(source)], `phone.${format}`, { type: `image/${format}` }));
  const finalMetadata = await sharp(afterResize).metadata();
  expect(finalMetadata.width).toBe(expectedWidth);
  expect(finalMetadata.height).toBe(expectedHeight);
  expect(finalMetadata.compression).toBe("av1");
  console.info("PHOTO_RESIZE_COMPARISON", JSON.stringify({
    format, width, height, beforeBytes: source.length, uploadBytes: photo.size,
    directAvifBytes: direct.length, resizedAvifBytes: afterResize.length,
    ratio: source.length / afterResize.length,
    savingsPercent: (1 - afterResize.length / source.length) * 100,
    smallerThanDirectPercent: (1 - afterResize.length / direct.length) * 100
  }));
});

}

for (const admin of [false, true]) {
  test(`resizes replacement photo when editing a pet${admin ? " in admin" : ""}`, async ({ page }) => {
    const source = await sharp("public/walk-hero-screen.webp").resize(2400, 1800, { fit: "fill" }).jpeg({ quality: 90 }).toBuffer();
    let uploaded: File | null = null;
    let submittedPetId = "";
    const apiPath = admin ? "**/api/dogsfather/pets" : "**/api/pets";
    if (admin) {
      await page.route("**/api/dogsfather/session", (route) => route.fulfill({ json: { authenticated: true } }));
      await page.route("**/api/dogsfather/location-requests", (route) => route.fulfill({ json: { requests: [] } }));
      await page.route(apiPath, (route) => route.fulfill({ json: { pets: [pet] } }));
      await page.goto("/dogsfather");
      await page.getByRole("button", { name: "Все питомцы", exact: false }).click();
      await page.getByRole("button", { name: /Собака Луна/ }).click();
    } else {
      await openNearby(page);
      await page.getByRole("button", { name: "Питомцы", exact: true }).click();
      await page.getByRole("button", { name: /Собака Луна/ }).click();
      await page.getByRole("button", { name: "Изменить данные", exact: false }).click();
    }
    await page.getByRole("button", { name: "Изменить фотографию", exact: false }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: "replacement.jpg", mimeType: "image/jpeg", buffer: source });
    await page.getByRole("button", { name: "Использовать фото" }).click();
    await page.route(apiPath, async (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      const request = new Request(route.request().url(), { method: "PATCH", headers: route.request().headers(), body: new Uint8Array(route.request().postDataBuffer()!) });
      const form = await request.formData();
      uploaded = form.get("photo") as File;
      submittedPetId = String(form.get("petId"));
      await route.fulfill({ json: { pet } });
    });
    await page.getByRole("button", { name: "Сохранить изменения", exact: true }).click();
    await expect(page.getByRole("heading", { name: admin ? "Изменения сохранены" : "Паспорт обновлён", exact: true })).toBeVisible();
    expect(submittedPetId).toBe(pet.id);
    expect(uploaded).not.toBeNull();
    const photo = uploaded! as File;
    expect(photo.type).toBe("image/webp");
    expect(photo.name).toBe("replacement.webp");
    const metadata = await sharp(Buffer.from(await photo.arrayBuffer())).metadata();
    expect(metadata.width).toBe(1600);
    expect(metadata.height).toBe(1200);
    const finalPhoto = await encodePetPhotoFile(photo);
    const finalMetadata = await sharp(finalPhoto).metadata();
    expect(finalMetadata.compression).toBe("av1");
    expect(finalMetadata.width).toBe(1600);
    expect(finalMetadata.height).toBe(1200);
  });
}
