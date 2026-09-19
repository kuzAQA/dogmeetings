# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: site.spec.ts >> opens the walk form with native time and preserved fields
- Location: e2e/site.spec.ts:252:1

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator: locator('input[type="time"]')
Expected: "time"
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toHaveAttribute" with timeout 5000ms
  - waiting for locator('input[type="time"]')

```

```yaml
- main:
  - region "Сервис совместных прогулок":
    - button "Назад"
    - text: dogmeet
    - heading "Сообщить о прогулке" [level=1]
    - paragraph: Расскажите соседям, где вас найти.
    - button "Питомец":
      - img "Луна"
      - text: Иду гулять с
      - strong: Луна
    - text: Когда
    - group "Когда":
      - button "Сегодня" [pressed]
      - button "Завтра"
      - button "Ежедневно"
    - button "Время Выберите время":
      - strong: Время
      - text: Выберите время
    - button "Место встречи Выберите место":
      - strong: Место встречи
      - text: Выберите место
    - text: Комментарий необязательно
    - textbox "Комментарий необязательно 0/40":
      - /placeholder: Например, возьмём мячик
    - text: 0/40 Прогулка появится в районе Москвичка.
    - button "Сообщить о прогулке"
- dialog "Встречаемся сегодня":
  - text: Время прогулки
  - group "Время прогулки":
    - text: Часы
    - list:
      - listitem: "21"
      - listitem: "22"
      - listitem: "23"
    - list:
      - listitem: "00"
      - listitem: "01"
      - listitem: "02"
      - listitem: "03"
      - listitem: "04"
      - listitem: "05"
      - listitem: "06"
      - listitem: "07"
      - listitem: "08"
      - listitem: "09"
      - listitem: "10"
      - listitem: "11"
      - listitem: "12"
      - listitem: "13"
      - listitem: "14"
      - listitem: "15"
      - listitem: "16"
      - listitem: "17"
      - listitem: "18"
      - listitem: "19"
      - listitem: "20"
      - listitem: "21"
      - listitem: "22"
      - listitem: "23"
    - text: Минуты
    - list:
      - listitem: "45"
      - listitem: "50"
      - listitem: "55"
    - list:
      - listitem: "00"
      - listitem: "05"
      - listitem: "10"
      - listitem: "15"
      - listitem: "20"
      - listitem: "25"
      - listitem: "30"
      - listitem: "35"
      - listitem: "40"
      - listitem: "45"
      - listitem: "50"
      - listitem: "55"
  - button "Готово"
- button "Закрыть"
```

# Test source

```ts
  159 |   const dock = page.getByRole("navigation", { name: "Основная навигация" });
  160 |   await dock.getByRole("button", { name: "Рядом", exact: true }).click();
  161 |   await expect.poll(() => page.evaluate(() => (window as Window & { transitionStarts?: number }).transitionStarts)).toBe(0);
  162 | 
  163 |   await dock.getByRole("button", { name: "Мои планы", exact: true }).click();
  164 |   await expect(page.getByRole("heading", { name: "Мои планы", exact: true })).toBeVisible();
  165 |   await expect.poll(() => page.evaluate(() => (window as Window & { transitionStarts?: number }).transitionStarts)).toBe(0);
  166 |   expect(await page.locator(".dock-add").evaluate((element) => element.getAnimations().length)).toBe(0);
  167 |   const transitions = await page.evaluate(() => (window as Window & { transitionStarts?: number }).transitionStarts);
  168 |   await dock.getByRole("button", { name: "Питомцы", exact: true }).click();
  169 |   await expect(page.getByRole("heading", { name: "Мои питомцы", exact: true })).toBeVisible();
  170 |   await expect.poll(() => page.evaluate(() => (window as Window & { transitionStarts?: number }).transitionStarts)).toBe(transitions);
  171 |   await dock.getByRole("button", { name: "Мои планы", exact: true }).click();
  172 |   await expect.poll(() => page.evaluate(() => (window as Window & { transitionStarts?: number }).transitionStarts)).toBe(transitions);
  173 |   await dock.getByRole("button", { name: "Рядом", exact: true }).click();
  174 |   await expect(page.getByRole("heading", { name: "Кто сегодня на прогулку?", exact: true })).toBeVisible();
  175 | });
  176 | 
  177 | test("returns to nearby without a page snapshot", async ({ page }) => {
  178 |   await openNearby(page);
  179 |   await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  180 |   await expect(page.getByRole("heading", { name: "Мои планы", exact: true })).toBeVisible();
  181 |   await page.evaluate(() => {
  182 |     const state = window as Window & { transitionStarts?: number };
  183 |     state.transitionStarts = 0;
  184 |     const start = document.startViewTransition?.bind(document);
  185 |     if (start) document.startViewTransition = (callback) => { state.transitionStarts = (state.transitionStarts ?? 0) + 1; return start(callback); };
  186 |   });
  187 |   await page.getByRole("button", { name: "Рядом", exact: true }).click();
  188 |   await expect(page.getByRole("heading", { name: "Кто сегодня на прогулку?", exact: true })).toBeVisible();
  189 |   await expect.poll(() => page.evaluate(() => (window as Window & { transitionStarts?: number }).transitionStarts)).toBe(0);
  190 | });
  191 | 
  192 | test("filters the timeline through the mockup bottom sheet", async ({ page }) => {
  193 |   await openNearby(page);
  194 |   await page.getByRole("button", { name: "Весь день" }).click();
  195 |   const dialog = page.getByRole("dialog", { name: "Время прогулки" });
  196 |   await expect(dialog).toBeVisible();
  197 |   await expect(dialog.getByRole("button", { name: "Весь день" }).locator("svg.lucide-check")).toBeVisible();
  198 |   await dialog.getByRole("button", { name: /Вечер/ }).click();
  199 |   await expect(dialog.getByRole("button", { name: /Вечер/ }).locator("svg.lucide-check")).toBeVisible();
  200 |   await dialog.getByRole("button", { name: "Показать прогулки" }).click();
  201 |   await expect(page.getByRole("button", { name: "Вечер", exact: true })).toBeVisible();
  202 | });
  203 | 
  204 | test("keeps the filter visible when it finds no walks", async ({ page }) => {
  205 |   await openNearby(page);
  206 |   await page.getByRole("button", { name: "Весь день" }).click();
  207 |   const dialog = page.getByRole("dialog", { name: "Время прогулки" });
  208 |   await dialog.getByRole("button", { name: /^Утро/ }).click();
  209 |   await dialog.getByRole("button", { name: "Показать прогулки" }).click();
  210 | 
  211 |   await expect(page.getByRole("heading", { name: "Сегодня рядом", exact: true })).toBeVisible();
  212 |   const filter = page.getByRole("button", { name: "Утро", exact: true });
  213 |   await expect(filter).toBeVisible();
  214 |   expect(await filter.evaluate((element) => element.closest(".section-line")!.getBoundingClientRect().right - element.getBoundingClientRect().right)).toBe(0);
  215 |   await expect(filter).toHaveCSS("padding-left", "0px");
  216 |   await expect(filter).toHaveCSS("padding-right", "0px");
  217 |   await expect(page.locator(".daily-summary")).toHaveCount(0);
  218 |   await expect(page.getByRole("button", { name: "Показать весь день", exact: true })).toHaveCount(0);
  219 |   await expect(page.locator(".section-line")).toHaveClass(/section-line--empty/);
  220 |   await expect(page.locator(".section-line")).toHaveCSS("border-top-style", "solid");
  221 |   await expect(page.locator(".section-line--empty + .state-block")).toHaveCSS("padding-top", "0px");
  222 | 
  223 |   const morningBox = await filter.boundingBox();
  224 |   await filter.click();
  225 |   await dialog.getByRole("button", { name: /^Вечер/ }).click();
  226 |   await dialog.getByRole("button", { name: "Показать прогулки" }).click();
  227 |   const eveningBox = await page.getByRole("button", { name: "Вечер", exact: true }).boundingBox();
  228 |   expect({ x: eveningBox?.x, width: eveningBox?.width }).toEqual({ x: morningBox?.x, width: morningBox?.width });
  229 | });
  230 | 
  231 | test("opens plans and pets from the new dock", async ({ page }) => {
  232 |   await openNearby(page);
  233 |   const dock = page.getByRole("navigation", { name: "Основная навигация" });
  234 |   await dock.getByRole("button", { name: "Мои планы", exact: true }).click();
  235 |   await expect(page.getByRole("heading", { name: "Мои планы", exact: true })).toBeVisible();
  236 |   await expect(dock.getByRole("button", { name: "Мои планы", exact: true })).toHaveAttribute("aria-current", "page");
  237 |   await dock.getByRole("button", { name: "Питомцы", exact: true }).click();
  238 |   await expect(page.getByRole("heading", { name: "Мои питомцы", exact: true })).toBeVisible();
  239 |   expect(await page.evaluate(() => scrollY)).toBe(0);
  240 | });
  241 | 
  242 | test("opens the pet passport and preserves its actions", async ({ page }) => {
  243 |   await openNearby(page);
  244 |   await page.getByRole("button", { name: "Питомцы", exact: true }).click();
  245 |   await page.getByRole("button", { name: /Собака Луна/ }).click();
  246 |   await expect(page.getByRole("heading", { name: "Паспорт питомца", exact: true })).toBeVisible();
  247 |   await expect(page.getByRole("button", { name: "Изменить данные", exact: false })).toBeVisible();
  248 |   await expect(page.getByRole("button", { name: "Поделиться питомцем", exact: false })).toBeVisible();
  249 |   await expect(page.getByRole("button", { name: "Удалить питомца", exact: false })).toBeVisible();
  250 | });
  251 | 
  252 | test("opens the walk form with native time and preserved fields", async ({ page }) => {
  253 |   await openNearby(page);
  254 |   await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  255 |   await page.getByRole("button", { name: "Создать прогулку", exact: true }).click();
  256 |   await expect(page.getByRole("heading", { name: "Сообщить о прогулке", exact: true })).toBeVisible();
  257 |   await expect(page.getByLabel("Питомец")).toBeVisible();
  258 |   await page.getByRole("button", { name: /^Время/ }).click();
> 259 |   await expect(page.locator('input[type="time"]')).toHaveAttribute("type", "time");
      |                                                    ^ Error: expect(locator).toHaveAttribute(expected) failed
  260 |   await page.keyboard.press("Escape");
  261 |   await expect(page.getByLabel("Комментарий", { exact: false })).toHaveAttribute("maxlength", "40");
  262 | });
  263 | 
  264 | test("reopens walk pickers on the first click after closing", async ({ page }) => {
  265 |   await openNearby(page);
  266 |   await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  267 |   await page.getByRole("button", { name: "Создать прогулку", exact: true }).click();
  268 | 
  269 |   for (const [triggerName, dialogName] of [["Время", "Встречаемся сегодня"], ["Место встречи", "Место встречи"]]) {
  270 |     const trigger = page.getByRole("button", { name: new RegExp(`^${triggerName}`) });
  271 |     const dialog = page.getByRole("dialog", { name: dialogName });
  272 |     await trigger.click();
  273 |     await expect(dialog).toBeVisible();
  274 |     const sheet = page.locator(".react-modal-sheet-root").filter({ has: page.locator(`[data-app-bottom-sheet][aria-label="${dialogName}"]`) });
  275 |     await sheet.locator(".sheet-backdrop").click({ force: true });
  276 |     await expect(sheet).toHaveAttribute("data-sheet-state", "closing");
  277 |     await trigger.click();
  278 |     await expect(sheet).toHaveAttribute("data-sheet-state", "open");
  279 |     await expect(dialog).toBeVisible();
  280 |     await sheet.locator(".sheet-backdrop").click({ force: true });
  281 |     await expect(dialog).toHaveCount(0);
  282 |   }
  283 | });
  284 | 
  285 | test("blocks a walk until a pet is added", async ({ page }) => {
  286 |   await openNearby(page, { pets: [], mine: [] });
  287 |   await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  288 |   await page.getByRole("button", { name: "Создать прогулку", exact: true }).click();
  289 |   const dialog = page.getByRole("dialog", { name: "Сначала питомец" });
  290 |   await expect(dialog).toBeVisible();
  291 |   await dialog.getByRole("button", { name: "Добавить питомца", exact: true }).click();
  292 |   await expect(page.getByRole("heading", { name: "Добавить питомца", exact: true })).toBeVisible();
  293 | });
  294 | 
  295 | test("shows the browser guide only inside an in-app browser", async ({ page }) => {
  296 |   await page.addInitScript(() => Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => "Telegram Android WebView" }));
  297 |   await mockApp(page, { hasLocation: false, pets: [], nearby: [], mine: [] });
  298 |   await page.goto("/");
  299 |   await page.getByRole("button", { name: "Найти компанию", exact: true }).click();
  300 |   await expect(page.getByRole("heading", { name: "Открыть в браузере", exact: true })).toBeVisible();
  301 |   await expect(page.getByRole("button", { name: "Android", exact: true })).toHaveAttribute("aria-pressed", "true");
  302 | });
  303 | 
  304 | test("renders invalid share links in the transferred state", async ({ page }) => {
  305 |   await page.goto("/share/invalid-token");
  306 |   await expect(page.getByRole("heading", { name: "Ссылка недействительна", exact: true })).toBeVisible();
  307 |   await expect(page.getByRole("button", { name: "К прогулкам", exact: true })).toBeVisible();
  308 | });
  309 | 
  310 | test("keeps admin authentication and its transferred form", async ({ page }) => {
  311 |   await page.goto("/dogsfather");
  312 |   await expect(page.getByRole("heading", { name: "Для тех, кто заботится о дворе", exact: true })).toBeVisible();
  313 |   await page.getByRole("textbox", { name: "Логин", exact: true }).fill("qa-wrong");
  314 |   await page.getByRole("textbox", { name: "Пароль", exact: true }).fill("wrong-password");
  315 |   await page.getByRole("button", { name: "Войти", exact: true }).click();
  316 |   await expect(page.getByRole("alert")).toContainText(/Неверный логин или пароль|Слишком много попыток/);
  317 | });
  318 | 
```