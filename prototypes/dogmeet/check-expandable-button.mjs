import {chromium,expect} from '@playwright/test';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
 for(const [route,label,target] of [['nearby','Я иду гулять','announce'],['plans','Новая прогулка','announce'],['pets','Добавить питомца','new-pet']]) {
  await page.goto(`http://127.0.0.1:4178/?capture=1#${route}`);
  const button=page.getByRole('button',{name:label,exact:true});
  expect((await button.boundingBox()).width).toBe(56);
  await button.click();
  await expect(button).toHaveAttribute('aria-expanded','true');
  await expect(page).toHaveURL(new RegExp('#'+route+'$'));
  expect((await button.boundingBox()).width).toBeGreaterThan(100);
  await page.locator('h1').first().click();
  await expect(button).toHaveAttribute('aria-expanded','false');
  expect((await button.boundingBox()).width).toBe(56);
  await button.click();await page.keyboard.press('Escape');
  await expect(button).toHaveAttribute('aria-expanded','false');
  await button.click();await button.click();
  await expect(page).toHaveURL(new RegExp('#'+target+'$'));
  console.log('PASS '+label);
 }
} finally {await browser.close();}
