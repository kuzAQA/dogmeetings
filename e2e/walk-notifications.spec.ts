import { expect, test } from '@playwright/test';
import { openNearby, walk } from './fixtures';

for (const mode of ['create', 'edit']) {
  for (const enabled of [true, false]) {
    test(`${mode} saves and restores Telegram preference ${enabled}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      let stored = { ...walk, scheduleType: 'tomorrow', notifyTelegram: !enabled };
      let saves = 0;
      await openNearby(page, { mine: mode === 'edit' ? [stored] : [] });
      await page.route('**/api/walks?*', route => route.fulfill({ json: { walks: [stored] } }));
      await page.route('**/api/walks', async route => {
        expect(route.request().method()).toBe(mode === 'create' ? 'POST' : 'PATCH');
        const body = route.request().postDataJSON();
        expect(body.notifyTelegram).toBe(enabled);
        saves++;
        stored = { ...stored, notifyTelegram: body.notifyTelegram, point: body.place, walkTime: body.walkTime };
        await route.fulfill({ json: { walk: stored } });
      });
      await page.getByRole('button', { name: 'Мои планы', exact: true }).click();
      if (mode === 'edit') {
        await page.getByRole('button', { name: 'Управлять', exact: true }).click();
        await page.getByRole('button', { name: 'Изменить прогулку', exact: true }).click();
      } else {
        await page.getByRole('button', { name: 'Создать прогулку', exact: true }).click();
        await page.getByRole('button', { name: 'Завтра', exact: true }).click();
        await page.getByRole('button', { name: /^Время/ }).click();
        await page.getByRole('button', { name: 'Готово', exact: true }).click();
        await page.getByRole('button', { name: /^Место встречи/ }).click();
        await page.getByRole('dialog', { name: 'Место встречи' }).getByRole('button', { name: walk.point, exact: true }).click();
        await page.getByRole('button', { name: 'Выбрать место', exact: true }).click();
      }
      const checkbox = page.getByRole('checkbox', { name: 'Отправить уведомление в бота Telegram', exact: true });
      await expect(checkbox).toBeChecked({ checked: mode === 'create' ? true : !enabled });
      await checkbox.setChecked(enabled);
      expect(saves).toBe(0);
      await page.getByRole('button', { name: mode === 'create' ? 'Сообщить о прогулке' : 'Сохранить изменения', exact: true }).click();
      await expect(page.getByRole('heading', { name: mode === 'create' ? 'Вы идёте гулять!' : 'Планы обновлены', exact: true })).toBeVisible();
      expect(saves).toBe(1);
      await page.getByRole('button', { name: 'Посмотреть мои планы', exact: true }).click();
      await page.getByRole('button', { name: 'Управлять', exact: true }).click();
      await page.getByRole('button', { name: 'Изменить прогулку', exact: true }).click();
      await expect(checkbox).toBeChecked({ checked: enabled });
      expect(saves).toBe(1);
    });
  }
}

test('failed save retains preference and sends only the save request', async ({ page }) => {
  await openNearby(page, { mine: [{ ...walk, scheduleType: 'tomorrow' }] });
  let saves = 0;
  await page.route('**/api/walks', async route => {
    saves++;
    expect(route.request().postDataJSON().notifyTelegram).toBe(false);
    await route.fulfill({ status: 500, json: { error: 'Тестовая ошибка сохранения' } });
  });
  await page.getByRole('button', { name: 'Мои планы', exact: true }).click();
  await page.getByRole('button', { name: 'Управлять', exact: true }).click();
  await page.getByRole('button', { name: 'Изменить прогулку', exact: true }).click();
  const checkbox = page.getByRole('checkbox', { name: 'Отправить уведомление в бота Telegram', exact: true });
  await checkbox.uncheck();
  expect(saves).toBe(0);
  await page.getByRole('button', { name: 'Сохранить изменения', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Тестовая ошибка сохранения' })).toBeVisible();
  await page.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(checkbox).not.toBeChecked();
  expect(saves).toBe(1);
});
