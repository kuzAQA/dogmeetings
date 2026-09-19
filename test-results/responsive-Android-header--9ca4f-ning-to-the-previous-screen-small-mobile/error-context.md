# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: responsive.spec.ts >> Android header exit >> reverses the back arrow and logo when returning to the previous screen
- Location: e2e/responsive.spec.ts:120:3

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Matcher error: received value must not be null nor undefined

Received has value: undefined
```

# Page snapshot

```yaml
- main [ref=e4]:
  - region "Сервис совместных прогулок" [ref=e5]:
    - navigation "Основная навигация" [ref=e6]:
      - generic [ref=e7]:
        - button "Рядом" [ref=e8] [cursor=pointer]
        - button "Мои планы" [ref=e14] [cursor=pointer]
        - button "Питомцы" [ref=e19] [cursor=pointer]
      - button "Создать прогулку" [ref=e27] [cursor=pointer]
    - generic [ref=e32]:
      - generic [ref=e33]:
        - generic [ref=e34]: dogmeet
        - button "Москвичка" [ref=e40] [cursor=pointer]
        - button "Мой район и настройки" [ref=e45] [cursor=pointer]
      - heading "Мои планы" [active] [level=1] [ref=e50]
      - paragraph [ref=e51]: Ваши встречи сегодня, завтраи маленькие ежедневные традиции.
      - generic [ref=e53]:
        - generic [ref=e54]:
          - strong [ref=e55]: 18:30
          - generic [ref=e56]: Сегодня
        - generic [ref=e57]:
          - img "Собака Луна" [ref=e58]
          - generic [ref=e59]:
            - strong [ref=e60]: Луна
            - generic [ref=e61]: Анна · Корги
          - generic [ref=e62]: Сквер у фонтана
          - generic [ref=e66]: Возьмём мячик
          - button "Управлять" [ref=e69] [cursor=pointer]
```

# Test source

```ts
  36  |     await openNearby(page);
  37  |     await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  38  |     await page.getByRole("button", { name: "Создать прогулку", exact: true }).click();
  39  |     await expect(page.getByLabel("Комментарий", { exact: false })).toBeVisible();
  40  |     expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  41  |     await page.getByRole("button", { name: /^Место встречи/ }).click();
  42  |     await page.getByLabel("Или своё место встречи").fill("У входа в сквер");
  43  |     await page.setViewportSize({ width, height: 430 });
  44  |     const dialog = page.getByRole("dialog");
  45  |     const bounds = await dialog.boundingBox();
  46  |     expect(bounds!.y).toBeGreaterThanOrEqual(0);
  47  |     expect(bounds!.width).toBeLessThanOrEqual(width);
  48  |     expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(430);
  49  |     await page.getByRole("button", { name: "Выбрать место" }).click();
  50  |     await expect(dialog).toHaveCount(0);
  51  |     await page.screenshot({ path: `.impeccable/review/transfer/responsive-${width}.png`, fullPage: true, animations: "disabled" });
  52  |   }
  53  | });
  54  | 
  55  | test("back arrow slides in while the logo shifts after add and profile actions", async ({ page }) => {
  56  |   await page.emulateMedia({ reducedMotion: "no-preference" });
  57  |   await page.setViewportSize({ width: 390, height: 844 });
  58  |   await openNearby(page);
  59  | 
  60  |   for (const action of ["Создать прогулку", "Мой район и настройки"]) {
  61  |     if (action === "Создать прогулку") {
  62  |       await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  63  |       await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {}))));
  64  |     }
  65  |     await page.addStyleTag({ content: ":root { --motion-screen: 2s; --motion-shared: 2s; }" });
  66  |     const logoBefore = await page.locator(".page-header .brand").boundingBox();
  67  |     await page.getByRole("button", { name: action, exact: true }).click();
  68  |     await expect(page.getByRole("button", { name: "Назад" })).toBeVisible();
  69  |     const logoAfter = await page.locator(".page-header .brand").boundingBox();
  70  |     expect(Math.round(logoAfter!.x - logoBefore!.x)).toBe(44);
  71  | 
  72  |     const animations = await page.evaluate(() => document.getAnimations().map((animation) => {
  73  |       const effect = animation.effect as KeyframeEffect & { pseudoElement?: string };
  74  |       return { pseudoElement: effect.pseudoElement, duration: effect.getTiming().duration, frames: effect.getKeyframes() };
  75  |     }));
  76  |     const back = animations.find((animation) => animation.pseudoElement === "::view-transition-new(dogmeet-back)");
  77  |     const brand = animations.find((animation) => animation.pseudoElement === "::view-transition-group(dogmeet-brand)");
  78  |     expect(back?.duration).toBe(2000);
  79  |     expect(back?.frames[0]).toMatchObject({ opacity: "0" });
  80  |     expect(back?.frames[0].transform).not.toBe(back?.frames.at(-1)?.transform);
  81  |     expect(brand?.duration).toBe(2000);
  82  | 
  83  |     await page.goto("/");
  84  |     await expect(page.getByRole("button", { name: "Мой район и настройки" })).toBeVisible();
  85  |   }
  86  | });
  87  | 
  88  | test.describe("Android header entry", () => {
  89  |   test.use({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36" });
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
> 136 |     expect(animations.back).toContain(2000);
      |                             ^ Error: expect(received).toContain(expected) // indexOf
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
  190 |   expect(dragArea).toMatchObject({ height: 48 });
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
```