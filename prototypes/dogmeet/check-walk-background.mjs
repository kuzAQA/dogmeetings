import {chromium, expect} from '@playwright/test';

const browser = await chromium.launch({headless: true});
try {
  const page = await browser.newPage({viewport: {width: 390, height: 844}, reducedMotion: 'reduce'});
  for (const route of ['announce', 'edit-walk']) {
    await page.goto(`http://127.0.0.1:4178/?capture=1#${route}`);
    const main = page.locator('main');
    await main.locator('textarea').fill('Прогулка с мячиком');
    for (const selector of ['.selected-pet', '.walk-settings button:first-child', '.walk-settings button:last-child']) {
      const trigger = main.locator(selector);
      await trigger.scrollIntoViewIfNeeded();
      const before = await main.innerHTML();
      const scrollY = await page.evaluate(() => window.scrollY);
      await trigger.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(main).toHaveAttribute('inert', '');
      expect(await main.innerHTML()).toBe(before);
      expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
      await page.keyboard.press('Escape');
      await expect(page.locator('dialog')).toHaveCount(0);
      await expect(main.locator('textarea')).toHaveValue('Прогулка с мячиком');
      expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
    }
    await main.locator('.selected-pet').click();
    await page.getByRole('dialog').getByRole('button', {name: /Луна/}).click();
    await expect(page.locator('dialog')).toHaveCount(0);
    await expect(main.locator('.selected-pet')).toContainText('Луна');
    await expect(main.locator('textarea')).toHaveValue('Прогулка с мячиком');
    console.log(`PASS ${route}: background, scroll, dismissal and pet selection`);
  }
} finally {
  await browser.close();
}
