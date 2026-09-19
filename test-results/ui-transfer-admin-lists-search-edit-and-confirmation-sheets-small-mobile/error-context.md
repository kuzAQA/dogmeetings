# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui-transfer.spec.ts >> admin lists, search, edit and confirmation sheets
- Location: e2e/ui-transfer.spec.ts:301:1

# Error details

```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 721
Received:    1428
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - main [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - button "Назад" [ref=e7] [cursor=pointer]
        - generic [ref=e10]: Управление Dogmeet
      - heading "Заявки жителей" [level=1] [ref=e11]
      - paragraph [ref=e12]: Жители предлагают новые места для совместных прогулок.
      - article [ref=e13]:
        - generic [ref=e14]:
          - generic [ref=e15]: Новая заявка
          - generic [ref=e16]: 14.09.2026, 10:42
        - heading "Скандинавия" [level=2] [ref=e17]
        - paragraph [ref=e18]: Москва · Коммунарка
        - generic [ref=e19]:
          - button "Добавить" [active] [ref=e20] [cursor=pointer]
          - button "Отклонить" [ref=e23] [cursor=pointer]
  - generic:
    - alertdialog "Добавить локацию" [ref=e24]:
      - generic [ref=e27]:
        - heading "Ещё один район для встреч" [level=2] [ref=e31]: Ещё один райондля встреч
        - generic [ref=e32]:
          - strong [ref=e33]: Скандинавия
          - generic [ref=e34]: Москва · Коммунарка
        - paragraph [ref=e35]: Локация появится в списке. Жители смогут выбрать её для прогулок.
      - generic [ref=e36]:
        - button "Добавить локацию" [ref=e37] [cursor=pointer]
        - button "Отмена" [ref=e38] [cursor=pointer]
    - button "Закрыть" [ref=e39] [cursor=pointer]
```

# Test source

```ts
  1   | import { expect, test, type Page, type TestInfo } from "@playwright/test";
  2   | import { location, mockApp, openNearby, pet, walk } from "./fixtures";
  3   | 
  4   | async function capture(page: Page, info: TestInfo, name: string) {
  5   |   await page.evaluate(() => document.fonts.ready);
  6   |   expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  7   |   const dialog = page.locator("[data-app-bottom-sheet]");
  8   |   if (await dialog.count()) {
  9   |     const bounds = await dialog.boundingBox();
  10  |     expect(bounds!.x).toBeGreaterThanOrEqual(0);
  11  |     expect(bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  12  |     expect(bounds!.y).toBeGreaterThanOrEqual(0);
> 13  |     expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
      |                                        ^ Error: expect(received).toBeLessThanOrEqual(expected)
  14  |   }
  15  |   await page.screenshot({ path: `.impeccable/review/transfer/${info.project.name}-${name}.png`, fullPage: !(await dialog.count()), animations: "disabled" });
  16  | }
  17  | 
  18  | test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: "reduce" }); });
  19  | 
  20  | test("place picker confirms only its selected shared place", async ({ page }) => {
  21  |   await mockApp(page);
  22  |   await page.unroute("**/api/places?*");
  23  |   await page.route("**/api/places?*", (route) => route.fulfill({ json: { places: [{ id: walk.placeId, name: walk.point }, { id: "place-2", name: "У детской площадки" }] } }));
  24  |   await page.goto("/");
  25  |   await expect(page.getByRole("heading", { name: "Кто сегодня на прогулку?", exact: true })).toBeVisible();
  26  |   await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  27  |   await page.getByRole("button", { name: "Создать прогулку", exact: true }).click();
  28  |   await page.getByRole("button", { name: /^Место встречи/ }).click();
  29  | 
  30  |   const dialog = page.getByRole("dialog", { name: "Место встречи" });
  31  |   const confirm = dialog.getByRole("button", { name: "Выбрать место" });
  32  |   const firstPlace = dialog.getByRole("button", { name: walk.point, exact: true });
  33  |   const secondPlace = dialog.getByRole("button", { name: "У детской площадки", exact: true });
  34  |   await expect(confirm).toBeDisabled();
  35  |   await firstPlace.click();
  36  |   await expect(dialog).toBeVisible();
  37  |   await expect(firstPlace).toHaveAttribute("aria-pressed", "true");
  38  |   await expect(firstPlace.locator("svg")).toHaveCount(1);
  39  |   await secondPlace.click();
  40  |   await expect(firstPlace).toHaveAttribute("aria-pressed", "false");
  41  |   await expect(secondPlace).toHaveAttribute("aria-pressed", "true");
  42  |   await expect(confirm).toBeEnabled();
  43  |   await confirm.click();
  44  |   await expect(dialog).toHaveCount(0);
  45  |   await expect(page.getByRole("button", { name: /^Место встречи/ })).toContainText("У детской площадки");
  46  | });
  47  | 
  48  | test("location uses reference fields and preserves dependent options and submission", async ({ page }, info) => {
  49  |   await openNearby(page);
  50  |   await page.getByRole("button", { name: location.complex, exact: true }).click();
  51  |   const city = page.getByRole("combobox", { name: "Город", exact: true });
  52  |   await expect(city).toBeVisible();
  53  |   expect(await city.evaluate((element) => {
  54  |     const style = getComputedStyle(element);
  55  |     return { height: element.getBoundingClientRect().height, radius: style.borderRadius, background: style.backgroundColor, font: style.fontFamily };
  56  |   })).toEqual({ height: 54, radius: "10px", background: "rgb(255, 253, 248)", font: "Manrope, Arial, sans-serif" });
  57  |   await capture(page, info, "location");
  58  |   const request = page.waitForRequest((request) => request.url().endsWith("/api/session") && request.method() === "PATCH");
  59  |   await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  60  |   expect((await request).postDataJSON()).toEqual({ location });
  61  |   await expect(page.getByRole("heading", { name: "Район выбран" })).toBeVisible();
  62  |   await capture(page, info, "location-success");
  63  | });
  64  | 
  65  | test("location request fields, loading, error, retry and success", async ({ page }, info) => {
  66  |   await openNearby(page);
  67  |   await page.getByRole("button", { name: location.complex, exact: true }).click();
  68  |   await page.getByRole("button", { name: "Предложить новую локацию" }).click();
  69  |   await page.getByLabel("Город", { exact: true }).fill("Москва");
  70  |   await page.getByLabel("Район", { exact: true }).fill("Коммунарка");
  71  |   await page.getByLabel("Жилой комплекс", { exact: true }).fill("Скандинавия");
  72  |   await capture(page, info, "request");
  73  |   await page.route("**/api/location-requests", (route) => route.fulfill({ status: 503, json: { error: "Проверка ошибки заявки" } }));
  74  |   await page.getByRole("button", { name: "Отправить заявку" }).click();
  75  |   await expect(page.getByRole("alert")).toContainText("Проверка ошибки заявки");
  76  |   await expect(page.getByLabel("Жилой комплекс", { exact: true })).toHaveValue("Скандинавия");
  77  |   await capture(page, info, "request-error");
  78  |   await page.route("**/api/location-requests", (route) => route.fulfill({ json: { request: { id: "request-1" } } }));
  79  |   await page.getByRole("button", { name: "Отправить заявку" }).click();
  80  |   await expect(page.getByRole("heading", { name: "Заявка отправлена" })).toBeVisible();
  81  |   await capture(page, info, "request-success");
  82  | });
  83  | 
  84  | test("pet form retains upload, validation, multipart data and success", async ({ page }, info) => {
  85  |   await openNearby(page);
  86  |   await page.getByRole("button", { name: "Питомцы", exact: true }).click();
  87  |   await page.getByRole("button", { name: "Добавить питомца", exact: true }).click();
  88  |   await capture(page, info, "new-pet");
  89  |   await page.getByLabel("Имя питомца").focus();
  90  |   await page.getByLabel("Имя хозяина").focus();
  91  |   await expect(page.getByLabel("Имя питомца")).toHaveAttribute("aria-invalid", "true");
  92  |   expect(await page.getByLabel("Имя питомца").evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe("2px");
  93  |   await capture(page, info, "new-pet-validation");
  94  |   await page.getByRole("button", { name: "Выбрать фотографию", exact: false }).click();
  95  |   await expect(page.getByRole("heading", { name: "Фотография" })).toBeVisible();
  96  |   await page.locator('input[type="file"]').setInputFiles("public/dog-bonya.webp");
  97  |   await capture(page, info, "photo");
  98  |   await page.getByRole("button", { name: "Использовать фото" }).click();
  99  |   await page.getByLabel("Имя питомца").fill("Боня");
  100 |   await page.getByLabel("Имя хозяина").fill("Анна");
  101 |   await page.getByLabel("Порода", { exact: true }).fill("Мальтипу");
  102 |   let multipart = "";
  103 |   await page.route("**/api/pets", async (route) => {
  104 |     if (route.request().method() === "POST") { multipart = route.request().postDataBuffer()!.toString("latin1"); await route.fulfill({ json: { pet: { ...pet, name: "Боня" } } }); }
  105 |     else await route.fallback();
  106 |   });
  107 |   await page.getByRole("button", { name: "Добавить питомца", exact: true }).click();
  108 |   await expect(page.getByRole("heading", { name: "Рады знакомству!" })).toBeVisible();
  109 |   for (const name of ["petName", "ownerName", "breed", "photo"]) expect(multipart).toContain(`name="${name}"`);
  110 |   await capture(page, info, "new-pet-success");
  111 | });
  112 | 
  113 | test("walk deletion refreshes once after the success sheet closes", async ({ page }) => {
```