# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: site.spec.ts >> keeps admin authentication and its transferred form
- Location: e2e/site.spec.ts:162:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Для тех, кто заботится о дворе', exact: true })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('heading', { name: 'Для тех, кто заботится о дворе', exact: true })

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
  64  |   await expect.poll(centered).toBeLessThan(1);
  65  |   await expect(tabs).not.toHaveCSS("transform", "none");
  66  | });
  67  | 
  68  | test("keeps the active dock tab inert", async ({ page }) => {
  69  |   await openNearby(page);
  70  |   await expect(page.locator(".nearby-toolbar")).toHaveCSS("view-transition-name", "dogmeet-header");
  71  |   await page.evaluate(() => {
  72  |     const state = window as Window & { transitionStarts?: number };
  73  |     const start = document.startViewTransition?.bind(document);
  74  |     state.transitionStarts = 0;
  75  |     if (start) document.startViewTransition = (callback) => {
  76  |       state.transitionStarts = (state.transitionStarts ?? 0) + 1;
  77  |       return start(callback);
  78  |     };
  79  |   });
  80  | 
  81  |   const dock = page.getByRole("navigation", { name: "Основная навигация" });
  82  |   await dock.getByRole("button", { name: "Рядом", exact: true }).click();
  83  |   await expect.poll(() => page.evaluate(() => (window as Window & { transitionStarts?: number }).transitionStarts)).toBe(0);
  84  | 
  85  |   await dock.getByRole("button", { name: "Мои планы", exact: true }).click();
  86  |   await expect(page.getByRole("heading", { name: "Мои планы", exact: true })).toBeVisible();
  87  |   const transitions = await page.evaluate(() => (window as Window & { transitionStarts?: number }).transitionStarts);
  88  |   await dock.getByRole("button", { name: "Мои планы", exact: true }).click();
  89  |   await expect.poll(() => page.evaluate(() => (window as Window & { transitionStarts?: number }).transitionStarts)).toBe(transitions);
  90  |   await dock.getByRole("button", { name: "Рядом", exact: true }).click();
  91  |   await expect(page.getByRole("heading", { name: "Кто сегодня на прогулку?", exact: true })).toBeVisible();
  92  | });
  93  | 
  94  | test("filters the timeline through the mockup bottom sheet", async ({ page }) => {
  95  |   await openNearby(page);
  96  |   await page.getByRole("button", { name: "Весь день" }).click();
  97  |   const dialog = page.getByRole("dialog", { name: "Время прогулки" });
  98  |   await expect(dialog).toBeVisible();
  99  |   await dialog.getByRole("button", { name: /Вечер/ }).click();
  100 |   await dialog.getByRole("button", { name: "Показать прогулки" }).click();
  101 |   await expect(page.getByRole("button", { name: "Вечер", exact: true })).toBeVisible();
  102 | });
  103 | 
  104 | test("opens plans and pets from the new dock", async ({ page }) => {
  105 |   await openNearby(page);
  106 |   const dock = page.getByRole("navigation", { name: "Основная навигация" });
  107 |   await dock.getByRole("button", { name: "Мои планы", exact: true }).click();
  108 |   await expect(page.getByRole("heading", { name: "Мои планы", exact: true })).toBeVisible();
  109 |   await expect(dock.getByRole("button", { name: "Мои планы", exact: true })).toHaveAttribute("aria-current", "page");
  110 |   await dock.getByRole("button", { name: "Питомцы", exact: true }).click();
  111 |   await expect(page.getByRole("heading", { name: "Мои питомцы", exact: true })).toBeVisible();
  112 |   expect(await page.evaluate(() => scrollY)).toBe(0);
  113 | });
  114 | 
  115 | test("opens the pet passport and preserves its actions", async ({ page }) => {
  116 |   await openNearby(page);
  117 |   await page.getByRole("button", { name: "Питомцы", exact: true }).click();
  118 |   await page.getByRole("button", { name: /Собака Луна/ }).click();
  119 |   await expect(page.getByRole("heading", { name: "Паспорт питомца", exact: true })).toBeVisible();
  120 |   await expect(page.getByRole("button", { name: "Изменить данные", exact: false })).toBeVisible();
  121 |   await expect(page.getByRole("button", { name: "Поделиться питомцем", exact: false })).toBeVisible();
  122 |   await expect(page.getByRole("button", { name: "Удалить питомца", exact: false })).toBeVisible();
  123 | });
  124 | 
  125 | test("opens the walk form with native time and preserved fields", async ({ page }) => {
  126 |   await openNearby(page);
  127 |   await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  128 |   await page.getByRole("button", { name: "Создать прогулку", exact: true }).click();
  129 |   await expect(page.getByRole("heading", { name: "Сообщить о прогулке", exact: true })).toBeVisible();
  130 |   await expect(page.getByLabel("Питомец")).toBeVisible();
  131 |   await page.getByRole("button", { name: /^Время/ }).click();
  132 |   await expect(page.locator('input[type="time"]')).toHaveAttribute("type", "time");
  133 |   await page.getByRole("button", { name: "Закрыть панель" }).click();
  134 |   await expect(page.getByLabel("Комментарий", { exact: false })).toHaveAttribute("maxlength", "40");
  135 | });
  136 | 
  137 | test("blocks a walk until a pet is added", async ({ page }) => {
  138 |   await openNearby(page, { pets: [], mine: [] });
  139 |   await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  140 |   await page.getByRole("button", { name: "Создать прогулку", exact: true }).click();
  141 |   const dialog = page.getByRole("dialog", { name: "Сначала питомец" });
  142 |   await expect(dialog).toBeVisible();
  143 |   await dialog.getByRole("button", { name: "Добавить питомца", exact: true }).click();
  144 |   await expect(page.getByRole("heading", { name: "Добавить питомца", exact: true })).toBeVisible();
  145 | });
  146 | 
  147 | test("shows the browser guide only inside an in-app browser", async ({ page }) => {
  148 |   await page.addInitScript(() => Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => "Telegram Android WebView" }));
  149 |   await mockApp(page, { hasLocation: false, pets: [], nearby: [], mine: [] });
  150 |   await page.goto("/");
  151 |   await page.getByRole("button", { name: "Найти компанию", exact: true }).click();
  152 |   await expect(page.getByRole("heading", { name: "Открыть в браузере", exact: true })).toBeVisible();
  153 |   await expect(page.getByRole("button", { name: "Android", exact: true })).toHaveAttribute("aria-pressed", "true");
  154 | });
  155 | 
  156 | test("renders invalid share links in the transferred state", async ({ page }) => {
  157 |   await page.goto("/share/invalid-token");
  158 |   await expect(page.getByRole("heading", { name: "Ссылка недействительна", exact: true })).toBeVisible();
  159 |   await expect(page.getByRole("button", { name: "К прогулкам", exact: true })).toBeVisible();
  160 | });
  161 | 
  162 | test("keeps admin authentication and its transferred form", async ({ page }) => {
  163 |   await page.goto("/dogsfather");
> 164 |   await expect(page.getByRole("heading", { name: "Для тех, кто заботится о дворе", exact: true })).toBeVisible();
      |                                                                                                    ^ Error: expect(locator).toBeVisible() failed
  165 |   await page.getByRole("textbox", { name: "Логин", exact: true }).fill("qa-wrong");
  166 |   await page.getByRole("textbox", { name: "Пароль", exact: true }).fill("wrong-password");
  167 |   await page.getByRole("button", { name: "Войти", exact: true }).click();
  168 |   await expect(page.getByRole("alert")).toContainText(/Неверный логин или пароль|Слишком много попыток/);
  169 | });
  170 | 
```