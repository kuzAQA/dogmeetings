import { expect, test } from '@playwright/test';
import { openNearby, walk } from './fixtures';

test.use({ timezoneId: 'America/Los_Angeles' });

const nearby = ['11:00', '15:00', '19:00'].map((walkTime) => ({ ...walk, id: walkTime, walkTime }));

for (const [time, period] of [['11:00:00', 'Утро'], ['11:59:59', 'Утро'], ['12:00:00', 'День'], ['15:05:00', 'День'], ['17:59:59', 'День'], ['18:00:00', 'Вечер'], ['00:00:00', 'Утро']]) {
  test(`${time} Moscow selects ${period}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.setFixedTime(new Date(`2026-10-10T${time}+03:00`));
    await openNearby(page, { nearby });
    await expect(page.locator('.filter-trigger')).toHaveText(period);
    await expect(page.locator('.walk-row')).toHaveCount(1);
    await page.locator('.filter-trigger').click();
    await expect(page.getByRole('dialog', { name: 'Время прогулки' }).getByRole('button', { name: new RegExp(`^${period}`) })).toHaveAttribute('aria-pressed', 'true');
  });
}

test('automatic period updates at noon, on return to tab and at midnight', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-10-10T11:59:00+03:00') });
  await openNearby(page, { nearby });
  await expect(page.locator('.filter-trigger')).toHaveText('Утро');
  await page.clock.pauseAt(new Date('2026-10-10T11:59:59+03:00'));
  await page.clock.runFor(1000);
  await expect(page.locator('.filter-trigger')).toHaveText('День');
  await page.clock.setSystemTime(new Date('2026-10-10T18:00:00+03:00'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('.filter-trigger')).toHaveText('Вечер');
  await page.clock.fastForward(6 * 60 * 60 * 1000);
  await expect(page.locator('.filter-trigger')).toHaveText('Утро');
});

test('manual choice survives a cutoff and returning to Nearby', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: new Date('2026-10-10T15:05:00+03:00') });
  await openNearby(page, { nearby });
  await page.locator('.filter-trigger').click();
  await page.getByRole('dialog', { name: 'Время прогулки' }).getByRole('button', { name: /^Весь день/ }).click();
  await page.getByRole('button', { name: 'Показать прогулки', exact: true }).click();
  await expect(page.locator('.walk-row')).toHaveCount(3);
  await page.clock.setSystemTime(new Date('2026-10-10T18:00:00+03:00'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.getByRole('button', { name: 'Мои планы', exact: true }).click();
  await page.getByRole('button', { name: 'Рядом', exact: true }).click();
  await expect(page.locator('.filter-trigger')).toHaveText('Весь день');
});

test('summary portraits follow the active filter and keep the three portrait limit', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.setFixedTime(new Date('2026-10-10T15:05:00+03:00'));
  const walks = ['11:00', '15:00', '19:00', '19:30'].map((walkTime, index) => ({
    ...walk, id: String(index), walkTime, image: `/api/pet-photo?id=portrait-${index}`,
  }));
  await openNearby(page, { nearby: walks });
  const portraits = page.locator('.stacked-faces img');
  await expect(portraits).toHaveCount(1);
  await expect(portraits.first()).toHaveAttribute('src', walks[1].image);
  for (const [period, images] of [
    ['Вечер', walks.slice(2).map((item) => item.image)],
    ['Весь день', walks.slice(0, 3).map((item) => item.image)],
  ] as const) {
    await page.locator('.filter-trigger').click();
    await page.getByRole('dialog', { name: 'Время прогулки' }).getByRole('button', { name: new RegExp(`^${period}`) }).click();
    await page.getByRole('button', { name: 'Показать прогулки', exact: true }).click();
    await expect(portraits).toHaveCount(images.length);
    for (const [index, src] of images.entries()) {
      await expect(portraits.nth(index)).toHaveAttribute('src', src);
    }
  }
});
