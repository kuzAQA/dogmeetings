# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui-transfer.spec.ts >> motion, interruption, keyboard focus and compact viewport
- Location: e2e/ui-transfer.spec.ts:358:1

# Error details

```
Error: expect(locator).toBeFocused() failed

Locator: getByRole('dialog').getByRole('button', { name: 'Весь день', exact: true })
Expected: focused
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeFocused" with timeout 5000ms
  - waiting for getByRole('dialog').getByRole('button', { name: 'Весь день', exact: true })

```

```yaml
- main:
  - region "Сервис совместных прогулок":
    - navigation "Основная навигация":
      - button "Рядом"
      - button "Мои планы"
      - button "Питомцы"
    - text: dogmeet
    - button "Москвичка"
    - button "Мой район и настройки"
    - heading "Кто сегодня на прогулку?" [level=1]:
      - text: Кто сегодня
      - emphasis: на прогулку?
    - strong: "18"
    - text: сентября пятница
    - paragraph:
      - text: Знакомьтесь во дворе.
      - strong: У каждого есть время для прогулки.
    - heading "Сегодня рядом" [level=2]
    - button "Весь день"
    - strong: 18:30
    - text: Сегодня
    - button "Собака Луна Луна Анна · Корги Сквер у фонтана Возьмём мячик Управлять":
      - img "Собака Луна"
      - strong: Луна
      - text: Анна · Корги Сквер у фонтана Возьмём мячик
      - button "Управлять"
- dialog "Время прогулки":
  - paragraph: В какое время вам удобнее встретиться?
  - button "Весь день Все прогулки сегодня" [pressed]:
    - strong: Весь день
    - text: Все прогулки сегодня
  - button "Утро До 12:00":
    - strong: Утро
    - text: До 12:00
  - button "День 12:00–17:59":
    - strong: День
    - text: 12:00–17:59
  - button "Вечер После 18:00":
    - strong: Вечер
    - text: После 18:00
  - button "Показать прогулки"
- button "Закрыть"
```

# Test source

```ts
  272 |   await page.addInitScript(() => Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => "Telegram Android WebView" }));
  273 |   await mockApp(page, { hasLocation: false, pets: [], nearby: [], mine: [] });
  274 |   await page.goto("/");
  275 |   await expect(page.getByRole("button", { name: "Найти компанию" })).toBeVisible();
  276 |   await capture(page, info, "welcome");
  277 |   await page.getByRole("button", { name: "Найти компанию" }).click();
  278 |   await capture(page, info, "guide-android");
  279 |   await page.getByRole("button", { name: "iPhone", exact: true }).click();
  280 |   await capture(page, info, "guide-iphone");
  281 | });
  282 | 
  283 | test("collections expose empty and error states with working retry", async ({ page }, info) => {
  284 |   await openNearby(page, { nearby: [], mine: [], pets: [] });
  285 |   await capture(page, info, "nearby-empty");
  286 |   await page.getByRole("button", { name: "Питомцы", exact: true }).click();
  287 |   await expect(page.getByRole("heading", { name: "Пока ни одного питомца" })).toBeVisible();
  288 |   await capture(page, info, "pets-empty");
  289 |   await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  290 |   await capture(page, info, "plans-empty");
  291 |   await page.route("**/api/walks?*", (route) => route.fulfill({ status: 503, json: { error: "Проверка недоступного расписания" } }));
  292 |   await page.reload();
  293 |   await expect(page.getByRole("alert")).toContainText("Проверка недоступного расписания");
  294 |   await capture(page, info, "walks-error");
  295 |   await page.unroute("**/api/walks?*");
  296 |   await mockApp(page);
  297 |   await page.getByRole("button", { name: "Повторить", exact: true }).click();
  298 |   await expect(page.getByRole("alert")).toHaveCount(0);
  299 | });
  300 | 
  301 | test("admin lists, search, edit and confirmation sheets", async ({ page }, info) => {
  302 |   await page.route("**/api/dogsfather/session", (route) => route.fulfill({ json: { authenticated: true } }));
  303 |   await page.route("**/api/dogsfather/location-requests", (route) => route.fulfill({ json: { requests: [{ id: "r1", city: "Москва", district: "Коммунарка", complex: "Скандинавия", createdAt: "2026-09-14T07:42:00Z" }] } }));
  304 |   await page.route("**/api/dogsfather/pets", (route) => route.fulfill({ json: { pets: [pet] } }));
  305 |   await page.goto("/dogsfather");
  306 |   await expect(page.getByRole("heading", { name: "Управление", exact: true })).toBeVisible();
  307 |   await capture(page, info, "admin");
  308 |   await page.getByRole("button", { name: "Заявки жителей", exact: false }).click();
  309 |   await expect(page.getByRole("heading", { name: "Скандинавия", exact: true })).toBeVisible();
  310 |   await capture(page, info, "requests");
  311 |   await page.getByRole("button", { name: "Добавить", exact: true }).click();
  312 |   await capture(page, info, "approve");
  313 |   await page.getByRole("button", { name: "Отмена", exact: true }).click();
  314 |   await page.getByRole("button", { name: "Отклонить", exact: true }).click();
  315 |   await capture(page, info, "reject");
  316 |   await page.getByRole("button", { name: "Отмена", exact: true }).click();
  317 |   await page.getByRole("button", { name: "Назад", exact: true }).click();
  318 |   await page.getByRole("button", { name: "Все питомцы", exact: false }).click();
  319 |   await expect(page.getByRole("button", { name: /Собака Луна/ })).toBeVisible();
  320 |   await capture(page, info, "admin-pets");
  321 |   await page.getByLabel("Найти питомца").fill("Нет такого");
  322 |   await expect(page.getByRole("status")).toContainText("Никого не нашли");
  323 |   await capture(page, info, "admin-pets-search-empty");
  324 |   await page.getByLabel("Найти питомца").fill("");
  325 |   await page.getByRole("button", { name: /Собака Луна/ }).click();
  326 |   await capture(page, info, "admin-edit");
  327 |   await page.getByRole("button", { name: "Удалить питомца", exact: true }).click();
  328 |   await capture(page, info, "admin-delete");
  329 |   await page.getByRole("button", { name: "Оставить" }).click();
  330 |   await page.getByRole("button", { name: "Назад", exact: true }).click();
  331 |   await page.getByRole("button", { name: "Назад", exact: true }).click();
  332 |   await page.getByRole("button", { name: "Уведомления", exact: false }).click();
  333 |   await capture(page, info, "notifications");
  334 |   await page.getByRole("button", { name: "Назад", exact: true }).click();
  335 |   await page.getByRole("button", { name: "Выйти", exact: true }).click();
  336 |   await capture(page, info, "admin-logout");
  337 | });
  338 | 
  339 | test("share invitation, already added, expired and accepted states", async ({ page }, info) => {
  340 |   await mockApp(page);
  341 |   await page.route("**/api/pet-shares/invitation", (route) => route.fulfill({ json: route.request().method() === "POST" ? { petId: pet.id } : { pet } }));
  342 |   await page.goto("/share/invitation");
  343 |   await expect(page.getByRole("heading", { name: "Приглашение" })).toBeVisible();
  344 |   await capture(page, info, "accept");
  345 |   await page.getByRole("button", { name: "Добавить к моим питомцам" }).click();
  346 |   await expect(page.getByRole("heading", { name: "Теперь вы гуляете вместе" })).toBeVisible();
  347 |   await capture(page, info, "accept-success");
  348 |   await page.route("**/api/pet-shares/invitation", (route) => route.fulfill({ json: { pet, alreadyAdded: true } }));
  349 |   await page.reload();
  350 |   await expect(page.getByRole("heading", { name: "Вы уже знакомы" })).toBeVisible();
  351 |   await capture(page, info, "already-added");
  352 |   await page.route("**/api/pet-shares/invitation", (route) => route.fulfill({ status: 410, json: { inactive: true } }));
  353 |   await page.reload();
  354 |   await expect(page.getByRole("heading", { name: "Ссылка уже использована" })).toBeVisible();
  355 |   await capture(page, info, "accept-used");
  356 | });
  357 | 
  358 | test("motion, interruption, keyboard focus and compact viewport", async ({ page }, info) => {
  359 |   const errors: string[] = [];
  360 |   page.on("pageerror", (error) => errors.push(error.message));
  361 |   await page.emulateMedia({ reducedMotion: "no-preference" });
  362 |   await openNearby(page);
  363 |   expect(await page.evaluate(() => {
  364 |     const style = getComputedStyle(document.documentElement);
  365 |     return ["--motion-screen", "--motion-sheet-in", "--motion-sheet-out", "--motion-shared"].map((token) => style.getPropertyValue(token).trim());
  366 |   })).toEqual(["180ms", "260ms", "200ms", "240ms"]);
  367 |   await expect(page.locator(".page-header")).toHaveCSS("view-transition-name", "dogmeet-header");
  368 |   await expect(page.locator("main")).toHaveCSS("view-transition-name", "dogmeet-production-page");
  369 |   expect(await page.evaluate(() => getComputedStyle(document.documentElement, "::view-transition-old(dogmeet-header)").opacity)).toBe("0");
  370 |   const filter = page.getByRole("button", { name: "Весь день", exact: true });
  371 |   await filter.click();
> 372 |   await expect(page.getByRole("dialog").getByRole("button", { name: "Весь день", exact: true })).toBeFocused();
      |                                                                                                  ^ Error: expect(locator).toBeFocused() failed
  373 |   await page.keyboard.press("Escape");
  374 |   await expect(filter).toBeFocused();
  375 |   await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  376 |   await page.getByRole("button", { name: "Питомцы", exact: true }).click();
  377 |   await page.getByRole("button", { name: "Рядом", exact: true }).click();
  378 |   await expect(page.getByRole("heading", { name: "Кто сегодня на прогулку?" })).toBeVisible();
  379 |   await page.emulateMedia({ reducedMotion: "reduce" });
  380 |   await page.setViewportSize({ width: page.viewportSize()!.width, height: 430 });
  381 |   await filter.click();
  382 |   await capture(page, info, "filters-compact");
  383 |   await page.getByRole("button", { name: "Показать прогулки" }).click();
  384 |   await expect(page.getByRole("dialog")).toHaveCount(0);
  385 |   expect(errors).toEqual([]);
  386 | });
  387 | 
  388 | test("admin mutations retain methods and request bodies", async ({ page }) => {
  389 |   await page.route("**/api/dogsfather/session", (route) => route.fulfill({ json: { authenticated: true } }));
  390 |   let requestAction: unknown;
  391 |   await page.route("**/api/dogsfather/location-requests", async (route) => {
  392 |     if (route.request().method() !== "GET") requestAction = { method: route.request().method(), body: route.request().postDataJSON() };
  393 |     await route.fulfill({ json: { requests: [{ id: "r1", ...location, createdAt: "2026-09-14T07:42:00Z" }] } });
  394 |   });
  395 |   await page.goto("/dogsfather");
  396 |   await page.getByRole("button", { name: "Заявки жителей", exact: false }).click();
  397 |   await page.getByRole("button", { name: "Добавить", exact: true }).click();
  398 |   await page.getByRole("button", { name: "Добавить локацию", exact: true }).click();
  399 |   await expect(page.getByRole("heading", { name: "Локация добавлена" })).toBeVisible();
  400 |   expect(requestAction).toEqual({ method: "PATCH", body: { id: "r1" } });
  401 |   await page.getByRole("button", { name: "Готово", exact: true }).click();
  402 |   await expect(page.getByRole("heading", { name: "Все заявки разобраны" })).toBeVisible();
  403 | });
  404 | 
```