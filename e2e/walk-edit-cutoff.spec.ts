import { expect, test } from '@playwright/test';
import { openNearby, walk } from './fixtures';

const message = 'Прогулка устарела для изменения. Вы можете удалить её или создать новую.';
const before = new Date('2026-10-10T11:59:00+03:00');

test('open menu updates at cutoff, keyboard activation warns for 5000 ms', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: before });
  await openNearby(page, { mine: [{ ...walk, walkDate: '2026-10-10', walkTime: '11:59' }] });
  await page.getByRole('button', { name: 'Планы', exact: true }).click();
  await page.getByRole('button', { name: 'Управлять', exact: true }).click();
  const edit = page.getByRole('button', { name: 'Изменить прогулку', exact: true });
  await expect(edit).toHaveAttribute('aria-disabled', 'false');
  await page.clock.pauseAt(new Date('2026-10-10T11:59:59+03:00'));
  await page.clock.runFor(1000);
  await expect(edit).toHaveAttribute('aria-disabled', 'true');
  await edit.focus();
  await page.keyboard.press('Enter');
  await page.clock.resume();
  const warning = page.getByRole('status').filter({ hasText: message });
  await expect(warning).toBeVisible();
  expect(await warning.evaluate(element => getComputedStyle(element, '::before').content)).toBe('none');
  await expect(page.getByRole('button', { name: 'Сохранить изменения', exact: true })).toHaveCount(0);
  await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now() + 100)));
  await page.clock.runFor(4700);
  await expect(warning).toBeVisible();
  await page.clock.runFor(300);
  await expect(warning).toHaveCount(0);
});

for (const serverRejection of [false, true]) {
test(`open form warns after cutoff (server rejection: ${serverRejection})`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: before });
  await openNearby(page, { mine: [{ ...walk, walkDate: '2026-10-10', walkTime: serverRejection ? '18:00' : '11:59' }] });
  let saves = 0;
  await page.route('**/api/walks', async route => {
    expect(route.request().method()).toBe('PATCH');
    saves++;
    await route.fulfill({ status: 409, json: { error: message } });
  });
  await page.getByRole('button', { name: 'Планы', exact: true }).click();
  await page.getByRole('button', { name: 'Управлять', exact: true }).click();
  await page.getByRole('button', { name: 'Изменить прогулку', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Сохранить изменения', exact: true })).toBeVisible();
  await page.clock.setSystemTime(new Date('2026-10-10T12:00:00+03:00'));
  await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: message })).toBeVisible();
  expect(saves).toBe(serverRejection ? 1 : 0);
  await expect(page.getByRole('button', { name: 'Сохранить изменения', exact: true })).toBeVisible();
});
}

test('returning to the tab refreshes the edit cutoff', async ({ page }) => {
  await page.clock.install({ time: before });
  await openNearby(page, { mine: [{ ...walk, walkDate: '2026-10-10', walkTime: '17:59' }] });
  await page.getByRole('button', { name: 'Планы', exact: true }).click();
  await page.getByRole('button', { name: 'Управлять', exact: true }).click();
  const edit = page.getByRole('button', { name: 'Изменить прогулку', exact: true });
  await expect(edit).toHaveAttribute('aria-disabled', 'false');
  await page.clock.setSystemTime(new Date('2026-10-10T18:00:00+03:00'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(edit).toHaveAttribute('aria-disabled', 'true');
});

for (const screen of ['Планы', 'Рядом']) {
test(`${screen} labels follow cutoffs and stay at the top right`, async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: before });
  const walks = [
    { ...walk, id: 'morning', walkDate: '2026-10-10', walkTime: '11:59' },
    { ...walk, id: 'day', walkDate: '2026-10-10', walkTime: '17:59' },
    { ...walk, id: 'evening', walkDate: '2026-10-10', walkTime: '18:00' },
    { ...walk, id: 'future', walkDate: '2026-10-11', walkTime: '11:59', scheduleType: 'tomorrow' },
  ];
  await openNearby(page, { mine: screen === 'Планы' ? walks : [], nearby: walks });
  if (screen === 'Рядом') {
    await page.locator('.filter-trigger').click();
    await page.getByRole('dialog', { name: 'Время прогулки' }).getByRole('button', { name: /^Весь день/ }).click();
    await page.getByRole('button', { name: 'Показать прогулки', exact: true }).click();
  }
  if (screen === 'Планы') await page.getByRole('button', { name: screen, exact: true }).click();
  const labels = page.locator('.walk-expired-label');
  await expect(labels).toHaveCount(0);
  await page.clock.pauseAt(new Date('2026-10-10T11:59:59+03:00'));
  await page.clock.runFor(1000);
  await expect(labels).toHaveCount(1);
  await page.clock.setSystemTime(new Date('2026-10-10T18:00:00+03:00'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(labels).toHaveCount(2);
  const row = page.locator('.walk-row').first();
  const bounds = await row.boundingBox();
  const label = await labels.first().boundingBox();
  expect(label!.x + label!.width).toBeCloseTo(bounds!.x + bounds!.width, 0);
  const name = await row.locator('.walk-name-row strong').boundingBox();
  expect(label!.y + label!.height / 2).toBeCloseTo(name!.y + name!.height / 2, 0);
  await page.screenshot({ path: `/private/tmp/dogmeet-walk-label-${screen === 'Рядом' ? 'nearby' : 'plans'}-${testInfo.project.name}.png`, animations: 'disabled' });
});
}
