# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: responsive.spec.ts >> backdrop close does not refocus the place picker input
- Location: e2e/responsive.spec.ts:306:1

# Error details

```
Error: Channel closed
```

```
Error: locator.click: Test ended.
Call log:
  - waiting for getByRole('button', { name: /^Место встречи/ })
    - locator resolved to <button type="button" class="menu-row">…</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is visible, enabled and stable
      - scrolling into view if needed
      - done scrolling
      - <html lang="ru" data-motion-input="pointer" data-view-transition="active" data-motion-direction="forward">…</html> intercepts pointer events
    - retrying click action
    - waiting 20ms
    - waiting for element to be visible, enabled and stable
    - element is visible, enabled and stable
    - scrolling into view if needed
    - done scrolling
    - <html lang="ru" data-motion-input="pointer" data-view-transition="active" data-motion-direction="forward">…</html> intercepts pointer events
  - retrying click action
    - waiting 100ms
    - waiting for element to be visible, enabled and stable

```

# Page snapshot

```yaml
- main [ref=e4]:
  - region "Сервис совместных прогулок" [ref=e5]:
    - generic [ref=e6]:
      - generic [ref=e7]:
        - button "Назад" [ref=e8] [cursor=pointer]
        - generic [ref=e11]: dogmeet
      - heading "Сообщить о прогулке" [active] [level=1] [ref=e17]
      - paragraph [ref=e18]: Расскажите соседям, где вас найти.
      - generic [ref=e19]:
        - button "Питомец" [ref=e20] [cursor=pointer]:
          - img "Луна" [ref=e21]
          - generic [ref=e22]:
            - generic [ref=e23]: Иду гулять с
            - strong [ref=e24]: Луна
        - generic [ref=e27]: Когда
        - group "Когда" [ref=e29]:
          - button "Сегодня" [pressed] [ref=e30] [cursor=pointer]
          - button "Завтра" [ref=e31] [cursor=pointer]
          - button "Ежедневно" [ref=e32] [cursor=pointer]
        - generic [ref=e33]:
          - button "Время Выберите время" [ref=e34] [cursor=pointer]:
            - generic [ref=e38]:
              - strong [ref=e39]: Время
              - generic [ref=e40]: Выберите время
          - button "Место встречи Выберите место" [ref=e43] [cursor=pointer]:
            - generic [ref=e47]:
              - strong [ref=e48]: Место встречи
              - generic [ref=e49]: Выберите место
        - generic [ref=e52]:
          - generic [ref=e53]:
            - text: Комментарий
            - generic [ref=e54]: необязательно
          - textbox "Комментарий необязательно 0/40" [ref=e55]:
            - /placeholder: Например, возьмём мячик
          - generic [ref=e56]: 0/40
        - generic [ref=e57]: Прогулка появится в районе Москвичка.
        - button "Сообщить о прогулке" [ref=e61] [cursor=pointer]
```

# Test source

```ts
  210 |   await page.setViewportSize({ width: 390, height: 700 });
  211 |   await openNearby(page);
  212 |   await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  213 |   await page.getByRole("button", { name: "Создать прогулку", exact: true }).click();
  214 |   await page.getByRole("button", { name: /^Место встречи/ }).click();
  215 | 
  216 |   const dialog = page.getByRole("dialog", { name: "Место встречи" });
  217 |   const searchField = dialog.locator(".search-field");
  218 |   const search = page.getByLabel("Найти место");
  219 |   const customPlace = page.getByLabel("Или своё место встречи");
  220 |   await expect(search).not.toBeFocused();
  221 |   await expect(search).toHaveAttribute("rows", "1");
  222 |   await expect(search).toHaveAttribute("inputmode", "text");
  223 |   await expect(search).toHaveAttribute("autocomplete", "off");
  224 |   await expect(search).toHaveAttribute("enterkeyhint", "search");
  225 |   await expect(customPlace).toHaveAttribute("rows", "1");
  226 |   await expect(customPlace).toHaveAttribute("autocomplete", "off");
  227 |   await expect(dialog.locator("form.place-picker-footer")).toHaveAttribute("autocomplete", "off");
  228 |   await search.focus();
  229 |   expect(await searchField.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe("none");
  230 |   await expect(search).toHaveCSS("outline-style", "none");
  231 | 
  232 |   const searchBounds = await searchField.evaluate((element) => {
  233 |     const field = element.getBoundingClientRect();
  234 |     const input = element.querySelector("textarea")!.getBoundingClientRect();
  235 |     return { field, input };
  236 |   });
  237 |   expect(searchBounds.input.left).toBeGreaterThan(searchBounds.field.left);
  238 |   expect(searchBounds.input.right).toBeLessThanOrEqual(searchBounds.field.right);
  239 | 
  240 |   await expect(dialog.locator(".react-modal-sheet-content-scroller")).toHaveCSS("padding-bottom", "0px");
  241 |   await expect(dialog.locator(".react-modal-sheet-content-scroller")).not.toHaveAttribute("style", /padding-bottom/);
  242 |   await expect(dialog.locator(".react-modal-sheet-content-scroller")).toHaveCSS("overflow-y", "clip");
  243 |   await expect(dialog.getByRole("button", { name: "Выбрать место" })).toBeVisible();
  244 | });
  245 | 
  246 | test.describe("Android place picker", () => {
  247 |   test.use({ hasTouch: true, isMobile: true, userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36" });
  248 | 
  249 |   test("keeps results visible and stable while moving focus to a custom place", async ({ page }) => {
  250 |     await page.setViewportSize({ width: 390, height: 700 });
  251 |     await openNearby(page);
  252 |     await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  253 |     await page.getByRole("button", { name: "Создать прогулку", exact: true }).click();
  254 |     await page.getByRole("button", { name: /^Место встречи/ }).click();
  255 | 
  256 |     const dialog = page.getByRole("dialog", { name: "Место встречи" });
  257 |     const search = page.getByLabel("Найти место");
  258 |     const customPlace = page.getByLabel("Или своё место встречи");
  259 |     const results = dialog.locator(".place-picker-list .option-list > button");
  260 |     await expect(results.first()).toBeVisible();
  261 |     const initialResultCount = await results.count();
  262 |     expect(initialResultCount).toBeGreaterThan(0);
  263 | 
  264 |     await search.tap();
  265 |     await expect(search).toBeFocused();
  266 |     await page.evaluate(() => {
  267 |       const keyboard = (navigator as Navigator & { virtualKeyboard?: EventTarget }).virtualKeyboard;
  268 |       if (keyboard) {
  269 |         Object.defineProperty(keyboard, "boundingRect", { configurable: true, value: { height: 300 } });
  270 |         keyboard.dispatchEvent(new Event("geometrychange"));
  271 |       } else {
  272 |         Object.defineProperty(window.visualViewport!, "height", { configurable: true, value: innerHeight - 300 });
  273 |         window.visualViewport!.dispatchEvent(new Event("resize"));
  274 |       }
  275 |     });
  276 |     await expect.poll(() => dialog.evaluate((element) => element.style.getPropertyValue("--keyboard-inset-height"))).toMatch(/300px/);
  277 |     await dialog.evaluate((element) => element.style.setProperty("--keyboard-inset-height", "300px"));
  278 |     expect(await dialog.evaluate((element) => Math.round(parseFloat(getComputedStyle(element).bottom)))).toBe(312);
  279 |     await expect(dialog.locator(".react-modal-sheet-content-scroller")).toHaveCSS("padding-bottom", "0px");
  280 |     await expect(dialog.locator(".react-modal-sheet-content-scroller")).not.toHaveAttribute("style", /padding-bottom/);
  281 |     await expect(results.first()).toBeVisible();
  282 |     await customPlace.tap();
  283 |     await expect(customPlace).toBeFocused();
  284 |     expect(await results.count()).toBe(initialResultCount);
  285 | 
  286 |     const beforeRepeatTap = await dialog.evaluate((element) => {
  287 |       const form = document.querySelector<HTMLElement>(".announce-form")!.getBoundingClientRect();
  288 |       const sheet = element.getBoundingClientRect();
  289 |       const list = element.querySelector<HTMLElement>(".place-picker-list")!.getBoundingClientRect();
  290 |       return { formTop: form.top, listVisible: list.bottom > sheet.top && list.top < sheet.bottom, scrollY, sheetTop: sheet.top };
  291 |     });
  292 |     expect(beforeRepeatTap.listVisible).toBe(true);
  293 | 
  294 |     await customPlace.tap();
  295 |     await expect(customPlace).toBeFocused();
  296 |     expect(await page.evaluate(() => {
  297 |       const formTop = document.querySelector<HTMLElement>(".announce-form")!.getBoundingClientRect().top;
  298 |       return { formTop, scrollY, sheetTop: document.querySelector<HTMLElement>(".sheet--place-picker")!.getBoundingClientRect().top };
  299 |     })).toEqual({ formTop: beforeRepeatTap.formTop, scrollY: beforeRepeatTap.scrollY, sheetTop: beforeRepeatTap.sheetTop });
  300 | 
  301 |     await search.fill("Несуществующее место");
  302 |     await expect(results).toHaveCount(0);
  303 |   });
  304 | });
  305 | 
  306 | test("backdrop close does not refocus the place picker input", async ({ page }) => {
  307 |   await openNearby(page);
  308 |   await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  309 |   await page.getByRole("button", { name: "Создать прогулку", exact: true }).click();
> 310 |   await page.getByRole("button", { name: /^Место встречи/ }).click();
      |                                                              ^ Error: locator.click: Test ended.
  311 | 
  312 |   const dialog = page.getByRole("dialog", { name: "Место встречи" });
  313 |   const customPlace = page.getByLabel("Или своё место встречи");
  314 |   await customPlace.focus();
  315 |   await page.evaluate(() => {
  316 |     const state = window as Window & { placePickerRefocuses?: number };
  317 |     state.placePickerRefocuses = 0;
  318 |     document.addEventListener("focusin", (event) => {
  319 |       if (event.target === document.querySelector(".place-picker-footer textarea")) state.placePickerRefocuses!++;
  320 |     }, { once: false });
  321 |   });
  322 | 
  323 |   await page.locator(".react-modal-sheet-backdrop").click();
  324 |   await expect(dialog).toHaveCount(0);
  325 |   expect(await page.evaluate(() => (window as Window & { placePickerRefocuses?: number }).placePickerRefocuses)).toBe(0);
  326 | });
  327 | 
```