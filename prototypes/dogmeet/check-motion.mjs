import assert from 'node:assert/strict';
import {chromium, expect} from '@playwright/test';
import {directionFor, tabOrder} from './motion.mjs';

for(const [a,from] of tabOrder.entries())for(const [b,to] of tabOrder.entries()){
 if(a!==b)assert.equal(directionFor(from,to,false),Math.sign(b-a));
}
assert.equal(directionFor('pet','pets',true),-1);
assert.equal(directionFor('pets','pet',false),1);

const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'no-preference'});
 const errors=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.addInitScript(()=>{
  window.motionSamples=[];
  const start=document.startViewTransition?.bind(document);
  if(start)document.startViewTransition=callback=>{
   const transition=start(callback);
   transition.ready.then(()=>requestAnimationFrame(()=>{
    window.motionSamples.push({direction:document.documentElement.dataset.motionDirection,
     page:document.querySelector('main')?.dataset.motionPage,
     effects:document.getAnimations().map(a=>({pseudo:a.effect?.pseudoElement,frames:a.effect?.getKeyframes(),duration:a.effect?.getTiming().duration}))});
   })).catch(()=>{});
   return transition;
  };
 });
 const open=async id=>{
  await page.goto(`http://127.0.0.1:4178/?capture=1#${id}`);await page.reload();
  await page.locator('.phone').waitFor();
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))});
 };
 const settled=()=>expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>a.playState==='running'&&a.effect?.target?.className!=='loader').length)).toBe(0);

 await open('nearby');
 for(const [label,id,direction] of [['Питомцы','pets','forward'],['Мои планы','plans','back'],['Питомцы','pets','forward'],['Рядом','nearby','back']]){
  await page.getByRole('button',{name:label,exact:true}).click();
  await expect(page.locator('main')).toHaveAttribute('data-motion-page',id);
  await expect(page.locator('html')).toHaveAttribute('data-motion-direction',direction);
  await settled();
  const indicator=await page.locator('.nav-tabs').evaluate(el=>{
   const active=el.querySelector('[aria-current]'),style=getComputedStyle(el.querySelector('.nav-indicator'));
   return {width:parseFloat(style.width),activeWidth:active.getBoundingClientRect().width};
  });
  assert.ok(Math.abs(indicator.width-indicator.activeWidth)<1);
 }
 await page.goBack();await expect(page.locator('main')).toHaveAttribute('data-motion-page','pets');
 await page.goForward();await expect(page.locator('main')).toHaveAttribute('data-motion-page','nearby');
 await settled();
 const samples=await page.evaluate(()=>window.motionSamples);
 assert.ok(samples.some(s=>s.effects.some(a=>a.frames?.some(f=>f.transform?.includes('20px')))),'screen snapshots move 20px');
 assert.ok(samples.filter(s=>tabOrder.includes(s.page)).every(s=>!s.effects.some(a=>a.pseudo?.includes('dogmeet-shade'))),'nav shade has no crossfade animation');
 await page.evaluate(()=>{
  const tabs=[...document.querySelectorAll('.nav-tabs button')];
  tabs[2].click();tabs[1].click();tabs[0].click();
 });
 await expect(page.locator('main')).toHaveAttribute('data-motion-page','nearby');await settled();
 assert.equal(new URL(page.url()).hash,'#nearby');
 console.log('PASS tab order, browser Back/Forward, indicator geometry and native snapshots');

 await open('pets');await page.locator('.pet-row').first().click();
 await expect(page.locator('main')).toHaveAttribute('data-motion-page','pet');await settled();
 assert.ok(await page.evaluate(()=>window.motionSamples.some(s=>s.effects.some(a=>a.pseudo==='::view-transition-group(dogmeet-photo)'&&a.duration===240))),'shared photo uses transform snapshot');
 await page.getByRole('button',{name:'Назад',exact:true}).click();
 await expect(page.locator('main')).toHaveAttribute('data-motion-page','pets');await settled();
 assert.equal(await page.locator('img[style*="view-transition-name"]').count(),0);
 console.log('PASS shared photo forward/back and snapshot cleanup');

 await open('nearby');const filter=page.getByRole('button',{name:'Весь день',exact:true});
 await filter.click();await expect(page.getByRole('dialog')).toBeVisible();await settled();
 await page.getByRole('button',{name:'Закрыть панель',exact:true}).click();
 await expect(page.locator('dialog')).toHaveClass(/is-closing/);
 await expect(page.locator('dialog')).toHaveCount(0);await expect(filter).toBeFocused();
 assert.equal(await page.locator('.scenario-content').evaluate(el=>el.getAnimations().length),0,'closing a sheet does not fade the page');
 await filter.click();await page.keyboard.press('Escape');
 await expect(page.locator('dialog')).toHaveCount(0);await expect(filter).toBeFocused();
 await filter.click();await settled();
 await page.getByRole('button',{name:'Закрыть панель',exact:true}).click();
 await page.goForward();await expect(page.getByRole('dialog')).toBeVisible();
 await settled();await expect(page.locator('dialog')).not.toHaveClass(/is-closing/);
 await page.keyboard.press('Escape');await expect(page.locator('dialog')).toHaveCount(0);
 console.log('PASS sheet exit, Escape, focus restoration and interrupted close');

 await open('announce');await page.locator('.selected-pet').click();await expect(page.getByRole('dialog')).toBeVisible();await settled();
 await page.locator('.pet-row').nth(1).click();await expect(page.locator('dialog')).toHaveCount(0);
 assert.equal(await page.locator('.scenario-content').evaluate(el=>el.getAnimations().length),0,'choosing a pet does not fade the walk form');
 await page.locator('.selected-pet').click();await page.getByRole('button',{name:'Закрыть панель',exact:true}).click();await expect(page.locator('dialog')).toHaveCount(0);
 assert.equal(await page.locator('.scenario-content').evaluate(el=>el.getAnimations().length),0,'closing the pet picker does not fade the walk form');
 console.log('PASS pet picker close/select without background flash');

 for(const close of ['button','escape','done']){
  await open('plans');await page.locator('.walk-summary').first().click();await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button',{name:'Изменить прогулку',exact:true}).click();await expect(page.locator('main')).toHaveAttribute('data-motion-page','edit-walk');
  await page.locator('.walk-settings .menu-row').first().click();await expect(page.getByRole('dialog')).toBeVisible();await settled();
  if(close==='button')await page.getByRole('button',{name:'Закрыть панель',exact:true}).click();
  else if(close==='escape')await page.keyboard.press('Escape');
  else await page.getByRole('button',{name:'Готово',exact:true}).click();
  await expect(page.locator('dialog')).toHaveCount(0);await expect(page.locator('main')).toHaveAttribute('data-motion-page','edit-walk');
  await page.getByRole('button',{name:'Назад',exact:true}).click();await expect(page.locator('main')).toHaveAttribute('data-motion-page','plans');
  await expect(page.locator('dialog')).toHaveCount(0);
 }
 console.log('PASS closed sheets do not return through Back history');

 for(const [route,label,target] of [['nearby','Я иду гулять','announce'],['plans','Новая прогулка','announce'],['pets','Добавить питомца','new-pet']]){
  await open(route);await page.getByRole('button',{name:label,exact:true}).click();await expect(page.locator('main')).toHaveAttribute('data-motion-page',target);await settled();
  await expect(page.locator('.bottom-nav')).toHaveCount(0);await expect(page.locator('.nav-shade')).toHaveCount(0);
  assert.ok(!await page.evaluate(()=>window.motionSamples.at(-1).effects.some(a=>a.pseudo==='::view-transition-old(dogmeet-dock)')),'old dock snapshot is hidden immediately');
 }
 await open('nearby');await page.getByRole('button',{name:'Мой район и настройки',exact:true}).click();await expect(page.locator('main')).toHaveAttribute('data-motion-page','profile');await settled();
 await expect(page.locator('.bottom-nav')).toHaveCount(0);await expect(page.locator('.nav-shade')).toHaveCount(0);
 console.log('PASS dock/shade disappear immediately after contextual action and profile menu');

 await open('new-pet');
 await expect(page.locator('.action-icon')).toHaveAttribute('data-done','false');
 await page.getByLabel('Имя питомца',{exact:true}).fill('Тоби');
 await page.getByLabel('Имя хозяина',{exact:true}).fill('Анна');
 await page.getByLabel('Порода',{exact:true}).fill('Метис');
 await expect(page.locator('.action-icon')).toHaveAttribute('data-done','true');
 await page.getByRole('button',{name:'Добавить питомца',exact:true}).click();
 await expect(page.locator('[aria-busy=true]')).toBeVisible();
 await expect(page.locator('.success')).toBeVisible();await settled();
 console.log('PASS Plus/Check, loading and successful form submission');

 await page.emulateMedia({reducedMotion:'reduce'});await open('nearby');
 await page.getByRole('button',{name:'Питомцы',exact:true}).click();
 await expect(page.locator('main')).toHaveAttribute('data-motion-page','pets');await settled();
 assert.equal(await page.evaluate(()=>window.motionSamples.length),0);
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.evaluate(()=>{document.startViewTransition=undefined});
 await page.getByRole('button',{name:'Рядом',exact:true}).click();
 await expect(page.locator('main')).toHaveAttribute('data-motion-page','nearby');
 await filter.click();await page.getByRole('button',{name:'Закрыть панель'}).click();
 await expect(page.locator('dialog')).toHaveCount(0);
 console.log('PASS reduced motion and navigation without View Transitions');

 await page.setViewportSize({width:1440,height:900});await open('nearby');
 await filter.click();await settled();
 const box=await page.getByRole('dialog').boundingBox();
 assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=1440&&box.y+box.height<=900);
 assert.deepEqual(errors,[]);
 console.log('PASS desktop sheet geometry; no page errors');
}finally{await browser.close()}
