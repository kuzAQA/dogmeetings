# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ui-transfer.spec.ts >> admin lists, search, edit and confirmation sheets
- Location: e2e/ui-transfer.spec.ts:211:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Управление', exact: true })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('heading', { name: 'Управление', exact: true })

```

```yaml
- img
- heading "This page couldn’t load" [level=1]
- paragraph: Reload to try again, or go back.
- button "Reload"
- button "Back"
- dialog "Runtime Error":
  - banner:
    - text: Runtime Error
    - button "Copy Error Info"
    - button "Dismiss": ×
  - 'heading "Failed to fetch dynamically imported module: http://localhost:3000/app/dogsfather/page.tsx" [level=2]'
  - paragraph: Call Stack 1
  - list:
    - listitem: "TypeError: Failed to fetch dynamically imported module: http://localhost:3000/app/dogsfather/page.tsx"
  - group: Component stack
```

# Test source

```ts
  116 |   await expect(page.getByRole("heading", { name: "Изменить прогулку" })).toBeVisible();
  117 |   await capture(page, info, "edit-walk");
  118 |   await page.getByRole("button", { name: "Сохранить изменения" }).click();
  119 |   await expect(page.getByRole("heading", { name: "Планы обновлены" })).toBeVisible();
  120 |   expect(payload).toMatchObject({ walkId: walk.id });
  121 |   await page.getByRole("button", { name: "Посмотреть мои планы" }).click();
  122 |   await page.getByRole("button", { name: "Управлять", exact: false }).click();
  123 |   await page.getByRole("button", { name: "Удалить прогулку", exact: false }).click();
  124 |   await capture(page, info, "delete-walk");
  125 |   await page.getByRole("alertdialog").getByRole("button", { name: "Удалить прогулку", exact: true }).click();
  126 |   await expect(page.getByRole("heading", { name: "Прогулка удалена" })).toBeVisible();
  127 |   expect(payload).toEqual({ walkId: walk.id });
  128 | });
  129 | 
  130 | test("passport, edit, share, rotate confirmation and delete preserve permissions", async ({ page }, info) => {
  131 |   await openNearby(page);
  132 |   let rotations = 0;
  133 |   await page.route("**/api/pet-shares", async (route) => { if (route.request().method() === "PATCH") rotations++; await route.fulfill({ json: { link: `http://localhost:3000/share/test-${rotations}` } }); });
  134 |   await page.getByRole("button", { name: "Питомцы", exact: true }).click();
  135 |   await capture(page, info, "pets");
  136 |   await page.getByRole("button", { name: /Собака Луна/ }).click();
  137 |   await capture(page, info, "pet");
  138 |   await page.getByRole("button", { name: "Изменить данные", exact: false }).click();
  139 |   await expect(page.getByLabel("Имя питомца")).toHaveValue(pet.name);
  140 |   await capture(page, info, "edit-pet");
  141 |   await page.getByRole("button", { name: "Назад", exact: true }).click();
  142 |   await page.getByRole("button", { name: /Собака Луна/ }).click();
  143 |   await page.getByRole("button", { name: "Поделиться питомцем", exact: false }).click();
  144 |   await expect(page.getByLabel("Одноразовая ссылка")).toHaveValue(/share\/test-0/);
  145 |   await capture(page, info, "share");
  146 |   await page.getByRole("button", { name: "Получить новую ссылку", exact: false }).click();
  147 |   await expect(page.getByRole("heading", { name: "Заменить ссылку?" })).toBeVisible();
  148 |   expect(rotations).toBe(0);
  149 |   await capture(page, info, "rotate-link");
  150 |   await page.getByRole("button", { name: "Получить новую ссылку", exact: true }).click();
  151 |   await expect(page.getByLabel("Одноразовая ссылка")).toHaveValue(/share\/test-1/);
  152 |   await page.getByRole("button", { name: "Закрыть панель", exact: true }).click();
  153 |   await page.getByRole("button", { name: "Удалить питомца", exact: false }).click();
  154 |   await capture(page, info, "delete-pet");
  155 |   await page.getByRole("button", { name: "Оставить", exact: true }).click();
  156 |   await expect(page.getByRole("heading", { name: "Паспорт питомца" })).toBeVisible();
  157 | });
  158 | 
  159 | test("profile, contact, walk detail and browser history", async ({ page }, info) => {
  160 |   await openNearby(page);
  161 |   await capture(page, info, "nearby");
  162 |   await page.getByRole("button", { name: /Собака Луна/ }).click();
  163 |   await expect(page.getByRole("heading", { name: "Встреча на прогулке" })).toBeVisible();
  164 |   await expect(page.getByRole("navigation", { name: "Основная навигация" })).toHaveCount(0);
  165 |   await capture(page, info, "walk");
  166 |   await page.getByRole("button", { name: "Изменить мою прогулку" }).click();
  167 |   await expect(page.getByRole("heading", { name: "Изменить прогулку", exact: true })).toBeVisible();
  168 |   await page.goBack();
  169 |   await expect(page.getByRole("heading", { name: "Встреча на прогулке" })).toBeVisible();
  170 |   await page.goBack();
  171 |   await expect(page.getByRole("heading", { name: "Кто сегодня на прогулку?" })).toBeVisible();
  172 |   await page.getByRole("button", { name: "Мой район и настройки" }).click();
  173 |   await capture(page, info, "profile");
  174 |   await page.getByRole("button", { name: "Связь с разработчиком", exact: false }).click();
  175 |   await expect(page.getByRole("heading", { name: "Есть идея или вопрос?" })).toBeVisible();
  176 |   await capture(page, info, "contact");
  177 |   await page.goBack();
  178 |   await expect(page.getByRole("heading", { name: "Мой район и настройки" })).toBeVisible();
  179 | });
  180 | 
  181 | test("welcome and both browser guides", async ({ page }, info) => {
  182 |   await page.addInitScript(() => Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => "Telegram Android WebView" }));
  183 |   await mockApp(page, { hasLocation: false, pets: [], nearby: [], mine: [] });
  184 |   await page.goto("/");
  185 |   await expect(page.getByRole("button", { name: "Найти компанию" })).toBeVisible();
  186 |   await capture(page, info, "welcome");
  187 |   await page.getByRole("button", { name: "Найти компанию" }).click();
  188 |   await capture(page, info, "guide-android");
  189 |   await page.getByRole("button", { name: "iPhone", exact: true }).click();
  190 |   await capture(page, info, "guide-iphone");
  191 | });
  192 | 
  193 | test("collections expose empty and error states with working retry", async ({ page }, info) => {
  194 |   await openNearby(page, { nearby: [], mine: [], pets: [] });
  195 |   await capture(page, info, "nearby-empty");
  196 |   await page.getByRole("button", { name: "Питомцы", exact: true }).click();
  197 |   await expect(page.getByRole("heading", { name: "Пока ни одного питомца" })).toBeVisible();
  198 |   await capture(page, info, "pets-empty");
  199 |   await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  200 |   await capture(page, info, "plans-empty");
  201 |   await page.route("**/api/walks?*", (route) => route.fulfill({ status: 503, json: { error: "Проверка недоступного расписания" } }));
  202 |   await page.reload();
  203 |   await expect(page.getByRole("alert")).toContainText("Проверка недоступного расписания");
  204 |   await capture(page, info, "walks-error");
  205 |   await page.unroute("**/api/walks?*");
  206 |   await mockApp(page);
  207 |   await page.getByRole("button", { name: "Повторить", exact: true }).click();
  208 |   await expect(page.getByRole("alert")).toHaveCount(0);
  209 | });
  210 | 
  211 | test("admin lists, search, edit and confirmation sheets", async ({ page }, info) => {
  212 |   await page.route("**/api/dogsfather/session", (route) => route.fulfill({ json: { authenticated: true } }));
  213 |   await page.route("**/api/dogsfather/location-requests", (route) => route.fulfill({ json: { requests: [{ id: "r1", city: "Москва", district: "Коммунарка", complex: "Скандинавия", createdAt: "2026-09-14T07:42:00Z" }] } }));
  214 |   await page.route("**/api/dogsfather/pets", (route) => route.fulfill({ json: { pets: [pet] } }));
  215 |   await page.goto("/dogsfather");
> 216 |   await expect(page.getByRole("heading", { name: "Управление", exact: true })).toBeVisible();
      |                                                                                ^ Error: expect(locator).toBeVisible() failed
  217 |   await capture(page, info, "admin");
  218 |   await page.getByRole("button", { name: "Заявки жителей", exact: false }).click();
  219 |   await expect(page.getByRole("heading", { name: "Скандинавия", exact: true })).toBeVisible();
  220 |   await capture(page, info, "requests");
  221 |   await page.getByRole("button", { name: "Добавить", exact: true }).click();
  222 |   await capture(page, info, "approve");
  223 |   await page.getByRole("button", { name: "Отмена", exact: true }).click();
  224 |   await page.getByRole("button", { name: "Отклонить", exact: true }).click();
  225 |   await capture(page, info, "reject");
  226 |   await page.getByRole("button", { name: "Отмена", exact: true }).click();
  227 |   await page.getByRole("button", { name: "Назад", exact: true }).click();
  228 |   await page.getByRole("button", { name: "Все питомцы", exact: false }).click();
  229 |   await expect(page.getByRole("button", { name: /Собака Луна/ })).toBeVisible();
  230 |   await capture(page, info, "admin-pets");
  231 |   await page.getByLabel("Найти питомца").fill("Нет такого");
  232 |   await expect(page.getByRole("status")).toContainText("Никого не нашли");
  233 |   await capture(page, info, "admin-pets-search-empty");
  234 |   await page.getByLabel("Найти питомца").fill("");
  235 |   await page.getByRole("button", { name: /Собака Луна/ }).click();
  236 |   await capture(page, info, "admin-edit");
  237 |   await page.getByRole("button", { name: "Удалить питомца", exact: true }).click();
  238 |   await capture(page, info, "admin-delete");
  239 |   await page.getByRole("button", { name: "Оставить" }).click();
  240 |   await page.getByRole("button", { name: "Назад", exact: true }).click();
  241 |   await page.getByRole("button", { name: "Назад", exact: true }).click();
  242 |   await page.getByRole("button", { name: "Уведомления", exact: false }).click();
  243 |   await capture(page, info, "notifications");
  244 |   await page.getByRole("button", { name: "Назад", exact: true }).click();
  245 |   await page.getByRole("button", { name: "Выйти", exact: true }).click();
  246 |   await capture(page, info, "admin-logout");
  247 | });
  248 | 
  249 | test("share invitation, already added, expired and accepted states", async ({ page }, info) => {
  250 |   await mockApp(page);
  251 |   await page.route("**/api/pet-shares/invitation", (route) => route.fulfill({ json: route.request().method() === "POST" ? { petId: pet.id } : { pet } }));
  252 |   await page.goto("/share/invitation");
  253 |   await expect(page.getByRole("heading", { name: "Приглашение" })).toBeVisible();
  254 |   await capture(page, info, "accept");
  255 |   await page.getByRole("button", { name: "Добавить к моим питомцам" }).click();
  256 |   await expect(page.getByRole("heading", { name: "Теперь вы гуляете вместе" })).toBeVisible();
  257 |   await capture(page, info, "accept-success");
  258 |   await page.route("**/api/pet-shares/invitation", (route) => route.fulfill({ json: { pet, alreadyAdded: true } }));
  259 |   await page.reload();
  260 |   await expect(page.getByRole("heading", { name: "Вы уже знакомы" })).toBeVisible();
  261 |   await capture(page, info, "already-added");
  262 |   await page.route("**/api/pet-shares/invitation", (route) => route.fulfill({ status: 410, json: { inactive: true } }));
  263 |   await page.reload();
  264 |   await expect(page.getByRole("heading", { name: "Ссылка уже использована" })).toBeVisible();
  265 |   await capture(page, info, "accept-used");
  266 | });
  267 | 
  268 | test("motion, interruption, keyboard focus and compact viewport", async ({ page }, info) => {
  269 |   const errors: string[] = [];
  270 |   page.on("pageerror", (error) => errors.push(error.message));
  271 |   await page.emulateMedia({ reducedMotion: "no-preference" });
  272 |   await openNearby(page);
  273 |   expect(await page.evaluate(() => {
  274 |     const style = getComputedStyle(document.documentElement);
  275 |     return ["--motion-screen", "--motion-sheet-in", "--motion-sheet-out", "--motion-shared"].map((token) => style.getPropertyValue(token).trim());
  276 |   })).toEqual(["180ms", "260ms", "200ms", "240ms"]);
  277 |   await expect(page.locator(".page-header")).toHaveCSS("view-transition-name", "dogmeet-header");
  278 |   await expect(page.locator("main")).toHaveCSS("view-transition-name", "dogmeet-production-page");
  279 |   expect(await page.evaluate(() => getComputedStyle(document.documentElement, "::view-transition-old(dogmeet-header)").opacity)).toBe("0");
  280 |   const filter = page.getByRole("button", { name: "Весь день", exact: true });
  281 |   await filter.click();
  282 |   await expect(page.getByRole("button", { name: "Закрыть панель" })).toBeFocused();
  283 |   await page.keyboard.press("Escape");
  284 |   await expect(filter).toBeFocused();
  285 |   await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  286 |   await page.getByRole("button", { name: "Питомцы", exact: true }).click();
  287 |   await page.getByRole("button", { name: "Рядом", exact: true }).click();
  288 |   await expect(page.getByRole("heading", { name: "Кто сегодня на прогулку?" })).toBeVisible();
  289 |   await page.emulateMedia({ reducedMotion: "reduce" });
  290 |   await page.setViewportSize({ width: page.viewportSize()!.width, height: 430 });
  291 |   await filter.click();
  292 |   await capture(page, info, "filters-compact");
  293 |   await page.getByRole("button", { name: "Показать прогулки" }).click();
  294 |   await expect(page.getByRole("dialog")).toHaveCount(0);
  295 |   expect(errors).toEqual([]);
  296 | });
  297 | 
  298 | test("admin mutations retain methods and request bodies", async ({ page }) => {
  299 |   await page.route("**/api/dogsfather/session", (route) => route.fulfill({ json: { authenticated: true } }));
  300 |   let requestAction: unknown;
  301 |   await page.route("**/api/dogsfather/location-requests", async (route) => {
  302 |     if (route.request().method() !== "GET") requestAction = { method: route.request().method(), body: route.request().postDataJSON() };
  303 |     await route.fulfill({ json: { requests: [{ id: "r1", ...location, createdAt: "2026-09-14T07:42:00Z" }] } });
  304 |   });
  305 |   await page.goto("/dogsfather");
  306 |   await page.getByRole("button", { name: "Заявки жителей", exact: false }).click();
  307 |   await page.getByRole("button", { name: "Добавить", exact: true }).click();
  308 |   await page.getByRole("button", { name: "Добавить локацию", exact: true }).click();
  309 |   await expect(page.getByRole("heading", { name: "Локация добавлена" })).toBeVisible();
  310 |   expect(requestAction).toEqual({ method: "PATCH", body: { id: "r1" } });
  311 |   await page.getByRole("button", { name: "Готово", exact: true }).click();
  312 |   await expect(page.getByRole("heading", { name: "Все заявки разобраны" })).toBeVisible();
  313 | });
  314 | 
```