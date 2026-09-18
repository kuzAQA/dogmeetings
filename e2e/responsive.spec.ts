import { expect, test } from "@playwright/test";
import { openNearby } from "./fixtures";

test("reference widths 360, 375 and 430 keep forms and sheets accessible", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [360, 375, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await openNearby(page);
    await page.getByRole("button", { name: "Мои планы", exact: true }).click();
    await page.getByRole("button", { name: "Создать прогулку", exact: true }).click();
    await expect(page.getByLabel("Комментарий", { exact: false })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await page.getByRole("button", { name: /^Место встречи/ }).click();
    await page.getByLabel("Или своё место встречи").fill("У входа в сквер");
    await page.setViewportSize({ width, height: 430 });
    const dialog = page.getByRole("dialog");
    const bounds = await dialog.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(430);
    await page.getByRole("button", { name: "Выбрать место" }).click();
    await expect(dialog).toHaveCount(0);
    await page.screenshot({ path: `.impeccable/review/transfer/responsive-${width}.png`, fullPage: true, animations: "disabled" });
  }
});

test("back arrow slides in while the logo shifts after add and profile actions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 390, height: 844 });
  await openNearby(page);

  for (const action of ["Создать прогулку", "Мой район и настройки"]) {
    if (action === "Создать прогулку") {
      await page.getByRole("button", { name: "Мои планы", exact: true }).click();
      await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {}))));
    }
    await page.addStyleTag({ content: ":root { --motion-screen: 2s; --motion-shared: 2s; }" });
    const logoBefore = await page.locator(".page-header .brand").boundingBox();
    await page.getByRole("button", { name: action, exact: true }).click();
    await expect(page.getByRole("button", { name: "Назад" })).toBeVisible();
    const logoAfter = await page.locator(".page-header .brand").boundingBox();
    expect(Math.round(logoAfter!.x - logoBefore!.x)).toBe(44);

    const animations = await page.evaluate(() => document.getAnimations().map((animation) => {
      const effect = animation.effect as KeyframeEffect & { pseudoElement?: string };
      return { pseudoElement: effect.pseudoElement, duration: effect.getTiming().duration, frames: effect.getKeyframes() };
    }));
    const back = animations.find((animation) => animation.pseudoElement === "::view-transition-new(dogmeet-back)");
    const brand = animations.find((animation) => animation.pseudoElement === "::view-transition-group(dogmeet-brand)");
    expect(back?.duration).toBe(2000);
    expect(back?.frames[0]).toMatchObject({ opacity: "0" });
    expect(back?.frames[0].transform).not.toBe(back?.frames.at(-1)?.transform);
    expect(brand?.duration).toBe(2000);

    await page.goto("/");
    await expect(page.getByRole("button", { name: "Мой район и настройки" })).toBeVisible();
  }
});

test.describe("Android header entry", () => {
  test.use({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36" });

  test("animates the back arrow and logo for every nearby entry path", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 390, height: 844 });
    await openNearby(page);

    for (const action of ["Создать прогулку", "Мой район и настройки"]) {
      if (action === "Создать прогулку") {
        await page.getByRole("button", { name: "Мои планы", exact: true }).click();
        await expect(page.getByRole("heading", { name: "Мои планы", exact: true })).toBeVisible();
      } else {
        await page.goto("/");
        await expect(page.getByRole("heading", { name: "Кто сегодня на прогулку?", exact: true })).toBeVisible();
      }
      await page.addStyleTag({ content: ":root { --motion-screen: 2s; --motion-shared: 2s; }" });
      await page.getByRole("button", { name: action, exact: true }).click();
      await expect(page.getByRole("button", { name: "Назад" })).toBeVisible();
      const animations = await page.evaluate(() => ({
        back: document.querySelector<HTMLElement>(".header-back")?.getAnimations().map((animation) => animation.effect?.getTiming().duration),
        brand: document.querySelector<HTMLElement>(".page-header .brand")?.getAnimations().map((animation) => animation.effect?.getTiming().duration)
      }));
      expect(animations.back).toContain(2000);
      expect(animations.brand).toContain(2000);
    }
  });
});

test.describe("Android header exit", () => {
  test.use({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36" });

  test("reverses the back arrow and logo when returning to the previous screen", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 390, height: 844 });
    await openNearby(page);
    await page.getByRole("button", { name: "Мои планы", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Мои планы", exact: true })).toBeVisible();
    await page.addStyleTag({ content: ":root { --motion-screen: 2s; --motion-shared: 2s; }" });
    await page.getByRole("button", { name: "Создать прогулку", exact: true }).click();
    await expect(page.getByRole("button", { name: "Назад" })).toBeVisible();
    await page.getByRole("button", { name: "Назад" }).click();
    await expect(page.getByRole("heading", { name: "Мои планы", exact: true })).toBeVisible();

    const animations = await page.evaluate(() => ({
      back: document.querySelector<HTMLElement>(".motion-header-back-exit")?.getAnimations().map((animation) => animation.effect?.getTiming().duration),
      brand: document.querySelector<HTMLElement>(".page-header .brand")?.getAnimations().map((animation) => animation.effect?.getTiming().duration)
    }));
    expect(animations.back).toContain(2000);
    expect(animations.brand).toContain(2000);
  });
});

test("place sheet keeps its footer visible, supports top-edge drag, and releases the form", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 700 });
  await openNearby(page);
  await page.unroute("**/api/places?*");
  await page.route("**/api/places?*", (route) => route.fulfill({
    json: { places: Array.from({ length: 18 }, (_, index) => ({ id: `place-${index}`, name: index ? `Место встречи ${index + 1}` : `За чёрным домом у стройки${"ыва".repeat(20)}` })) }
  }));
  await page.reload();
  await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  await page.getByRole("button", { name: "Создать прогулку", exact: true }).click();
  await page.getByRole("button", { name: /^Место встречи/ }).click();

  const dialog = page.getByRole("dialog", { name: "Место встречи" });
  const layout = await dialog.evaluate((element) => {
    const list = element.querySelector<HTMLElement>(".place-picker-list")!;
    const footer = element.querySelector<HTMLElement>(".place-picker-footer")!;
    const bounds = element.getBoundingClientRect();
    const nameRange = document.createRange();
    nameRange.selectNodeContents(list.querySelector(".option-list > button > span")!);
    return {
      height: bounds.height,
      viewport: innerHeight,
      horizontalOverflow: list.scrollWidth > list.clientWidth,
      listScrollable: list.scrollHeight > list.clientHeight,
      listOverflow: getComputedStyle(list).overflowY,
      footerVisible: footer.getBoundingClientRect().bottom <= bounds.bottom,
      firstNameLines: new Set(Array.from(nameRange.getClientRects(), (line) => Math.round(line.top))).size
    };
  });
  expect(layout.height).toBeLessThanOrEqual(layout.viewport * .8 + 1);
  expect(layout).toMatchObject({ horizontalOverflow: false, listScrollable: true, listOverflow: "auto", footerVisible: true });
  expect(layout.firstNameLines).toBeGreaterThanOrEqual(3);

  const customPlace = page.getByLabel("Или своё место встречи");
  await customPlace.focus();
  expect(await customPlace.evaluate((input) => {
    const content = input.closest<HTMLElement>(".sheet-footer")!.getBoundingClientRect();
    const bounds = input.getBoundingClientRect();
    const style = getComputedStyle(input);
    const focusRing = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
    return bounds.left - focusRing >= content.left && bounds.right + focusRing <= content.right;
  })).toBe(true);

  const dragArea = await dialog.locator(".sheet-drag-area").boundingBox();
  const grip = await dialog.locator(".sheet-grip").boundingBox();
  const sheetBounds = await dialog.boundingBox();
  expect(grip).toMatchObject({ width: 64, height: 20 });
  expect(dragArea).toMatchObject({ height: 48 });
  expect(Math.round(dragArea!.width)).toBe(Math.round(sheetBounds!.width));
  await page.mouse.move(dragArea!.x + dragArea!.width - 8, dragArea!.y + 4);
  await page.mouse.down();
  expect(errors).toEqual([]);
  await page.mouse.move(dragArea!.x + dragArea!.width - 8, dragArea!.y + 28, { steps: 3 });
  await page.mouse.up();
  await expect(dialog).toBeVisible();

  const sheetHeight = sheetBounds!.height;
  await page.mouse.move(dragArea!.x + 8, dragArea!.y + dragArea!.height - 4);
  await page.mouse.down();
  await page.mouse.move(dragArea!.x + 8, dragArea!.y + dragArea!.height - 4 + sheetHeight * .75, { steps: 8 });
  await page.mouse.up();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: /^Время/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("place sheet does not autofocus search and uses library keyboard avoidance", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await openNearby(page);
  await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  await page.getByRole("button", { name: "Создать прогулку", exact: true }).click();
  await page.getByRole("button", { name: /^Место встречи/ }).click();

  const dialog = page.getByRole("dialog", { name: "Место встречи" });
  const searchField = dialog.locator(".search-field");
  const search = page.getByLabel("Найти место");
  const customPlace = page.getByLabel("Или своё место встречи");
  await expect(search).not.toBeFocused();
  await expect(search).toHaveAttribute("rows", "1");
  await expect(search).toHaveAttribute("inputmode", "text");
  await expect(search).toHaveAttribute("autocomplete", "off");
  await expect(search).toHaveAttribute("enterkeyhint", "search");
  await expect(customPlace).toHaveAttribute("rows", "1");
  await expect(customPlace).toHaveAttribute("autocomplete", "off");
  await expect(dialog.locator("form.place-picker-footer")).toHaveAttribute("autocomplete", "off");
  await search.focus();
  expect(await searchField.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe("none");
  await expect(search).toHaveCSS("outline-style", "none");

  const searchBounds = await searchField.evaluate((element) => {
    const field = element.getBoundingClientRect();
    const input = element.querySelector("textarea")!.getBoundingClientRect();
    return { field, input };
  });
  expect(searchBounds.input.left).toBeGreaterThan(searchBounds.field.left);
  expect(searchBounds.input.right).toBeLessThanOrEqual(searchBounds.field.right);

  await expect(dialog.locator(".react-modal-sheet-content-scroller")).toHaveAttribute("style", /keyboard-inset-height/);
  await expect(dialog.getByRole("button", { name: "Выбрать место" })).toBeVisible();
});
