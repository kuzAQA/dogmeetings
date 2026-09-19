# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: responsive.spec.ts >> place sheet keeps its footer visible, supports top-edge drag, and releases the form
- Location: e2e/responsive.spec.ts:141:1

# Error details

```
Error: expect(received).toMatchObject(expected)

- Expected  - 1
+ Received  + 1

  Object {
-   "height": 48,
+   "height": 34,
  }
```

# Page snapshot

```yaml
- generic [ref=f1e2]:
  - main [ref=f1e4]:
    - region "Сервис совместных прогулок" [ref=f1e5]:
      - generic [ref=f1e6]:
        - generic [ref=f1e7]:
          - button "Назад" [ref=f1e8] [cursor=pointer]
          - generic [ref=f1e11]: dogmeet
        - heading "Сообщить о прогулке" [level=1] [ref=f1e17]
        - paragraph [ref=f1e18]: Расскажите соседям, где вас найти.
        - generic [ref=f1e19]:
          - button "Питомец" [ref=f1e20] [cursor=pointer]:
            - img "Луна" [ref=f1e21]
            - generic [ref=f1e22]:
              - generic [ref=f1e23]: Иду гулять с
              - strong [ref=f1e24]: Луна
          - generic [ref=f1e27]: Когда
          - group "Когда" [ref=f1e29]:
            - button "Сегодня" [pressed] [ref=f1e30] [cursor=pointer]
            - button "Завтра" [ref=f1e31] [cursor=pointer]
            - button "Ежедневно" [ref=f1e32] [cursor=pointer]
          - generic [ref=f1e33]:
            - button "Время Выберите время" [ref=f1e34] [cursor=pointer]:
              - generic [ref=f1e38]:
                - strong [ref=f1e39]: Время
                - generic [ref=f1e40]: Выберите время
            - button "Место встречи Выберите место" [ref=f1e43] [cursor=pointer]:
              - generic [ref=f1e47]:
                - strong [ref=f1e48]: Место встречи
                - generic [ref=f1e49]: Выберите место
          - generic [ref=f1e52]:
            - generic [ref=f1e53]:
              - text: Комментарий
              - generic [ref=f1e54]: необязательно
            - textbox "Комментарий необязательно 0/40" [ref=f1e55]:
              - /placeholder: Например, возьмём мячик
            - generic [ref=f1e56]: 0/40
          - generic [ref=f1e57]: Прогулка появится в районе Москвичка.
          - button "Сообщить о прогулке" [ref=f1e61] [cursor=pointer]
  - generic:
    - dialog "Место встречи" [ref=f1e64]:
      - generic [ref=f1e67]:
        - textbox "Найти место" [ref=f1e72]:
          - /placeholder: Название места
        - generic [ref=f1e74]:
          - button "За чёрным домом у стройкиываываываываываываываываываываываываываываываываываываываыва" [ref=f1e75] [cursor=pointer]
          - button "Место встречи 2" [ref=f1e77] [cursor=pointer]
          - button "Место встречи 3" [ref=f1e79] [cursor=pointer]
          - button "Место встречи 4" [ref=f1e81] [cursor=pointer]
          - button "Место встречи 5" [ref=f1e83] [cursor=pointer]
          - button "Место встречи 6" [ref=f1e85] [cursor=pointer]
          - button "Место встречи 7" [ref=f1e87] [cursor=pointer]
          - button "Место встречи 8" [ref=f1e89] [cursor=pointer]
          - button "Место встречи 9" [ref=f1e91] [cursor=pointer]
          - button "Место встречи 10" [ref=f1e93] [cursor=pointer]
          - button "Место встречи 11" [ref=f1e95] [cursor=pointer]
          - button "Место встречи 12" [ref=f1e97] [cursor=pointer]
          - button "Место встречи 13" [ref=f1e99] [cursor=pointer]
          - button "Место встречи 14" [ref=f1e101] [cursor=pointer]
          - button "Место встречи 15" [ref=f1e103] [cursor=pointer]
          - button "Место встречи 16" [ref=f1e105] [cursor=pointer]
          - button "Место встречи 17" [ref=f1e107] [cursor=pointer]
          - button "Место встречи 18" [ref=f1e109] [cursor=pointer]
      - generic [ref=f1e112]:
        - generic [ref=f1e113]:
          - generic [ref=f1e114]: Или своё место встречи
          - textbox "Или своё место встречи" [active] [ref=f1e115]:
            - /placeholder: Например, у входа в сквер
        - button "Выбрать место" [disabled] [ref=f1e116]
    - button "Закрыть" [ref=f1e117] [cursor=pointer]
```

# Test source

```ts
  90  | 
  91  |   test("animates the back arrow and logo for every nearby entry path", async ({ page }) => {
  92  |     await page.emulateMedia({ reducedMotion: "no-preference" });
  93  |     await page.setViewportSize({ width: 390, height: 844 });
  94  |     await openNearby(page);
  95  | 
  96  |     for (const action of ["Создать прогулку", "Мой район и настройки"]) {
  97  |       if (action === "Создать прогулку") {
  98  |         await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  99  |         await expect(page.getByRole("heading", { name: "Мои планы", exact: true })).toBeVisible();
  100 |       } else {
  101 |         await page.goto("/");
  102 |         await expect(page.getByRole("heading", { name: "Кто сегодня на прогулку?", exact: true })).toBeVisible();
  103 |       }
  104 |       await page.addStyleTag({ content: ":root { --motion-screen: 2s; --motion-shared: 2s; }" });
  105 |       await page.getByRole("button", { name: action, exact: true }).click();
  106 |       await expect(page.getByRole("button", { name: "Назад" })).toBeVisible();
  107 |       const animations = await page.evaluate(() => ({
  108 |         back: document.querySelector<HTMLElement>(".header-back")?.getAnimations().map((animation) => animation.effect?.getTiming().duration),
  109 |         brand: document.querySelector<HTMLElement>(".page-header .brand")?.getAnimations().map((animation) => animation.effect?.getTiming().duration)
  110 |       }));
  111 |       expect(animations.back).toContain(2000);
  112 |       expect(animations.brand).toContain(2000);
  113 |     }
  114 |   });
  115 | });
  116 | 
  117 | test.describe("Android header exit", () => {
  118 |   test.use({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36" });
  119 | 
  120 |   test("reverses the back arrow and logo when returning to the previous screen", async ({ page }) => {
  121 |     await page.emulateMedia({ reducedMotion: "no-preference" });
  122 |     await page.setViewportSize({ width: 390, height: 844 });
  123 |     await openNearby(page);
  124 |     await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  125 |     await expect(page.getByRole("heading", { name: "Мои планы", exact: true })).toBeVisible();
  126 |     await page.addStyleTag({ content: ":root { --motion-screen: 2s; --motion-shared: 2s; }" });
  127 |     await page.getByRole("button", { name: "Создать прогулку", exact: true }).click();
  128 |     await expect(page.getByRole("button", { name: "Назад" })).toBeVisible();
  129 |     await page.getByRole("button", { name: "Назад" }).click();
  130 |     await expect(page.getByRole("heading", { name: "Мои планы", exact: true })).toBeVisible();
  131 | 
  132 |     const animations = await page.evaluate(() => ({
  133 |       back: document.querySelector<HTMLElement>(".motion-header-back-exit")?.getAnimations().map((animation) => animation.effect?.getTiming().duration),
  134 |       brand: document.querySelector<HTMLElement>(".page-header .brand")?.getAnimations().map((animation) => animation.effect?.getTiming().duration)
  135 |     }));
  136 |     expect(animations.back).toContain(2000);
  137 |     expect(animations.brand).toContain(2000);
  138 |   });
  139 | });
  140 | 
  141 | test("place sheet keeps its footer visible, supports top-edge drag, and releases the form", async ({ page }) => {
  142 |   const errors: string[] = [];
  143 |   page.on("pageerror", (error) => errors.push(error.message));
  144 |   await page.setViewportSize({ width: 390, height: 700 });
  145 |   await openNearby(page);
  146 |   await page.unroute("**/api/places?*");
  147 |   await page.route("**/api/places?*", (route) => route.fulfill({
  148 |     json: { places: Array.from({ length: 18 }, (_, index) => ({ id: `place-${index}`, name: index ? `Место встречи ${index + 1}` : `За чёрным домом у стройки${"ыва".repeat(20)}` })) }
  149 |   }));
  150 |   await page.reload();
  151 |   await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  152 |   await page.getByRole("button", { name: "Создать прогулку", exact: true }).click();
  153 |   await page.getByRole("button", { name: /^Место встречи/ }).click();
  154 | 
  155 |   const dialog = page.getByRole("dialog", { name: "Место встречи" });
  156 |   const layout = await dialog.evaluate((element) => {
  157 |     const list = element.querySelector<HTMLElement>(".place-picker-list")!;
  158 |     const footer = element.querySelector<HTMLElement>(".place-picker-footer")!;
  159 |     const bounds = element.getBoundingClientRect();
  160 |     const nameRange = document.createRange();
  161 |     nameRange.selectNodeContents(list.querySelector(".option-list > button > span")!);
  162 |     return {
  163 |       height: bounds.height,
  164 |       viewport: innerHeight,
  165 |       horizontalOverflow: list.scrollWidth > list.clientWidth,
  166 |       listScrollable: list.scrollHeight > list.clientHeight,
  167 |       listOverflow: getComputedStyle(list).overflowY,
  168 |       footerVisible: footer.getBoundingClientRect().bottom <= bounds.bottom,
  169 |       firstNameLines: new Set(Array.from(nameRange.getClientRects(), (line) => Math.round(line.top))).size
  170 |     };
  171 |   });
  172 |   expect(layout.height).toBeLessThanOrEqual(layout.viewport * .8 + 1);
  173 |   expect(layout).toMatchObject({ horizontalOverflow: false, listScrollable: true, listOverflow: "auto", footerVisible: true });
  174 |   expect(layout.firstNameLines).toBeGreaterThanOrEqual(3);
  175 | 
  176 |   const customPlace = page.getByLabel("Или своё место встречи");
  177 |   await customPlace.focus();
  178 |   expect(await customPlace.evaluate((input) => {
  179 |     const content = input.closest<HTMLElement>(".sheet-footer")!.getBoundingClientRect();
  180 |     const bounds = input.getBoundingClientRect();
  181 |     const style = getComputedStyle(input);
  182 |     const focusRing = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
  183 |     return bounds.left - focusRing >= content.left && bounds.right + focusRing <= content.right;
  184 |   })).toBe(true);
  185 | 
  186 |   const dragArea = await dialog.locator(".sheet-drag-area").boundingBox();
  187 |   const grip = await dialog.locator(".sheet-grip").boundingBox();
  188 |   const sheetBounds = await dialog.boundingBox();
  189 |   expect(grip).toMatchObject({ width: 64, height: 20 });
> 190 |   expect(dragArea).toMatchObject({ height: 48 });
      |                    ^ Error: expect(received).toMatchObject(expected)
  191 |   expect(Math.round(dragArea!.width)).toBe(Math.round(sheetBounds!.width));
  192 |   await page.mouse.move(dragArea!.x + dragArea!.width - 8, dragArea!.y + 4);
  193 |   await page.mouse.down();
  194 |   expect(errors).toEqual([]);
  195 |   await page.mouse.move(dragArea!.x + dragArea!.width - 8, dragArea!.y + 28, { steps: 3 });
  196 |   await page.mouse.up();
  197 |   await expect(dialog).toBeVisible();
  198 | 
  199 |   const sheetHeight = sheetBounds!.height;
  200 |   await page.mouse.move(dragArea!.x + 8, dragArea!.y + dragArea!.height - 4);
  201 |   await page.mouse.down();
  202 |   await page.mouse.move(dragArea!.x + 8, dragArea!.y + dragArea!.height - 4 + sheetHeight * .75, { steps: 8 });
  203 |   await page.mouse.up();
  204 |   await expect(dialog).toHaveCount(0);
  205 |   await page.getByRole("button", { name: /^Время/ }).click();
  206 |   await expect(page.getByRole("dialog")).toBeVisible();
  207 | });
  208 | 
  209 | test("place sheet does not autofocus search or add keyboard padding to its list", async ({ page }) => {
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
```