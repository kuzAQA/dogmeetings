import {chromium,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {screens,captures} from './catalog.mjs';
const root=fileURLToPath(new URL('.',import.meta.url));
const base='http://127.0.0.1:4178';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']});
const page=await context.newPage();page.setDefaultTimeout(6000);
const failures=[],consoleErrors=[],requests=[];const results=[];
if(process.argv.includes('--scroll-lock')){
 for(const screen of screens){
  await open(screen.id);
  if(!await page.getByRole('dialog').count())continue;
  await expect(page.getByRole('dialog')).toBeVisible();
  const before=await page.evaluate(()=>scrollY);
  await page.mouse.move(5,100);await page.mouse.wheel(0,600);
  await page.waitForTimeout(150);
  expect(await page.evaluate(()=>scrollY)).toBe(before);
  expect(await page.evaluate(()=>getComputedStyle(document.documentElement).overflow)).toBe('hidden');
 }
 await open('share');
 await expect(page.locator('dialog img,dialog .share-portrait,dialog #sheet-title')).toHaveCount(0);
 await expect(page.getByRole('dialog',{name:'Поделиться питомцем'})).toBeVisible();
 await page.getByRole('button',{name:'Закрыть панель'}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>getComputedStyle(document.documentElement).overflow)).not.toBe('hidden');
 console.log('PASS: modal scroll lock and simplified share form');await browser.close();process.exit(0);
}
if(process.argv.includes('--background')){
 for(const name of ['Боня','Луна']){
  await open('pets');await page.getByRole('button',{name:new RegExp(name)}).click();
  const remove=page.getByRole('button',{name:name==='Луна'?/Убрать из моего списка/:/Удалить питомца/});
  await remove.scrollIntoViewIfNeeded();
  const before=await page.locator('main').innerHTML(),scroll=await page.evaluate(()=>scrollY);
  await remove.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.locator('main').innerHTML()).toBe(before);
  expect(await page.evaluate(()=>document.body.style.position==='fixed'?-parseFloat(document.body.style.top):scrollY)).toBe(scroll);
  await page.getByRole('button',{name:'Оставить',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.locator('main').innerHTML()).toBe(before);
  expect(await page.evaluate(()=>document.body.style.position==='fixed'?-parseFloat(document.body.style.top):scrollY)).toBe(scroll);
 }
 console.log('PASS: pet deletion preserves background and scroll for owned/shared pets');await browser.close();process.exit(0);
}
if(process.argv.includes('--cta')){
 for(const width of [320,360,375,390,430,1280])for(const floating of [false,true])for(const id of ['nearby','plans','pets']){
  await page.setViewportSize({width,height:667});
  await page.goto(`${base}/?${floating?'nav=floating':''}#${id}`);await page.locator('.dock-add').waitFor();
  for(const scroll of [0,10000]){
   await page.evaluate(y=>window.scrollTo(0,y),scroll);
   const cta=page.locator('.dock-add'),nav=page.locator('.bottom-nav');
   await expect(async()=>{
    const b=await cta.boundingBox(),n=await nav.boundingBox();
    expect(Math.abs(b.height-n.height)).toBeLessThan(1);
    expect(Math.abs(b.x+b.width-n.x-n.width)).toBeLessThan(1);
    expect(Math.abs(n.y-b.y)).toBeLessThan(1);
    const tabs=await page.locator('.nav-tabs').boundingBox();
    expect(Math.abs(b.x-tabs.x-tabs.width-12)).toBeLessThan(1);
    expect(Math.abs(b.width-b.height)).toBeLessThan(1);
    expect(await cta.evaluate(el=>getComputedStyle(el).borderRadius)).toBe('50%');
    expect(b.width).toBeGreaterThanOrEqual(52);
    expect(b.width).toBeLessThanOrEqual(64);
   }).toPass();
  }
  await page.locator('.dock-add').click();await expect(page.locator('.dock-add')).toHaveCount(0);
 }
 console.log('PASS: 36 CTA layouts before/after scroll and single-click actions');await browser.close();process.exit(0);
}
if(process.argv.includes('--sheets')){
 const ids=['filters','choose-pet','choose-place','choose-time','pet-required','walk-actions','delete-walk','delete-pet','share','rotate-link','already-added','approve','reject','admin-delete','admin-logout'];
 await mkdir(`${root}review/sheets`,{recursive:true});
 for(const [width,height] of [[320,568],[360,640],[375,667],[390,844],[1280,720]]){
  await page.setViewportSize({width,height});
  for(const id of ids){
   await open(id);
   const sheet=page.getByRole('dialog');await expect(sheet).toBeVisible();
   const issues=await sheet.evaluate(el=>{
    const r=el.getBoundingClientRect(),issues=[];
    if(el.scrollHeight>el.clientHeight+1)issues.push(`vertical ${el.scrollHeight-el.clientHeight}`);
    if(el.scrollWidth>el.clientWidth+1||r.left<0||r.right>innerWidth)issues.push('horizontal');
    if(r.top<0||r.bottom>innerHeight)issues.push('viewport');
    for(const e of el.querySelectorAll('*')){
     const b=e.getBoundingClientRect();
     if(b.width&&b.height&&(b.left<r.left-1||b.right>r.right+1||b.top<r.top-1||b.bottom>r.bottom+1))issues.push(`clipped ${e.tagName}.${e.className}`);
    }
    for(const e of el.querySelectorAll('button,input,select,textarea')){
     const b=e.getBoundingClientRect();
     if(b.width<44||b.height<44)issues.push(`target ${e.textContent}: ${b.width}x${b.height}`);
    }
    return issues;
   });
   await page.screenshot({path:`${root}review/sheets/${id}-${width}x${height}.png`});
   if(issues.length)failures.push({id,width,height,issues});
  }
 }
 for(const enlarged of [false,true]){
  await page.setViewportSize({width:320,height:enlarged?568:300});await open('share');
  const sheet=page.getByRole('dialog');
  if(enlarged)await sheet.evaluate(el=>{
   const sizes=[...el.querySelectorAll('*')].map(e=>[e,parseFloat(getComputedStyle(e).fontSize)]);
   for(const [e,size] of sizes)e.style.fontSize=`${size*2}px`;
  });
  expect(await sheet.evaluate(el=>getComputedStyle(el).overflowY)).toBe('auto');
  expect(await sheet.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
  const last=sheet.getByRole('button',{name:'Получить новую ссылку',exact:true});
  await last.scrollIntoViewIfNeeded();await expect(last).toBeInViewport();
 }
 console.log(JSON.stringify({checks:75,fallbackChecks:2,failures},null,2));
 await browser.close();process.exit(failures.length?1:0);
}
page.on('pageerror',e=>consoleErrors.push(String(e)));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('data:'))requests.push(r.url())});
async function open(id,state='base'){await page.goto(`${base}/?capture=1#${id}${state==='base'?'':`?state=${state}`}`);await page.reload();await page.locator('.phone').waitFor();await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))});}
async function click(name){const button=page.getByRole('button',{name,exact:true});const expands=await button.getAttribute('aria-expanded')==='false';await button.click();if(expands)await button.click();}
async function success(){await expect(page.locator('.success')).toBeVisible();await click('Готово');}
async function run(name,fn){try{await fn();results.push({name,pass:true});console.log('PASS',name)}catch(e){failures.push({name,error:String(e).slice(0,1800)});console.log('FAIL',name,String(e).slice(0,300))}}
await run('Знакомство → браузер → район → расписание',async()=>{await open('welcome');await click('Найти компанию');await click('Android');await expect(page.getByText('Откройте меню с тремя точками',{exact:true})).toBeVisible();await click('Продолжить');await click('Показать прогулки');await success();await expect(page.locator('h1')).toContainText('Кто сегодня');});
await run('Фильтр вечера и возврат по Escape',async()=>{await open('nearby');await click('Весь день');await page.getByRole('button',{name:/Вечер После/}).click();await click('Показать прогулки');await expect(page.locator('.walk-row')).toHaveCount(1);await click('Вечер');await expect(page.locator('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('dialog')).toHaveCount(0)});
await run('Создание питомца, валидация и фото',async()=>{await open('new-pet');await click('Добавить питомца');await expect(page.locator('[aria-invalid=true]')).toHaveCount(3);await page.getByLabel('Имя питомца',{exact:true}).fill('Тоби');await page.getByLabel('Имя хозяина',{exact:true}).fill('Екатерина');await page.getByLabel('Порода',{exact:true}).fill('Метис');await page.getByRole('button',{name:/Выбрать фотографию/}).click();await click('Выбрать фото Боня');await click('Использовать фото');await expect(page.getByLabel('Имя питомца',{exact:true})).toHaveValue('Тоби');await click('Добавить питомца');await success();await expect(page.getByRole('button',{name:/Тоби/})).toBeVisible()});
await run('Публикация со своим местом и временем → планы → правка → удаление',async()=>{await open('nearby');await click('Я иду гулять');await click('Завтра');await page.getByRole('button',{name:/Время 18:30/}).click();await page.getByLabel('Время начала прогулки').fill('19:45');await click('Готово');await page.getByRole('button',{name:/Место встречи/}).click();await page.getByLabel('Или своё место встречи').fill('У северного входа в сквер');await click('Выбрать это место');await click('Сообщить о прогулке');await expect(page.locator('.success')).toBeVisible();await click('Посмотреть мои планы');await expect(page.locator('.walk-row').filter({hasText:'19:45'})).toContainText('У северного входа');await page.locator('.walk-row').filter({hasText:'19:45'}).getByRole('button').click();await click('Изменить прогулку');await click('Ежедневно');await click('Сохранить изменения');await click('Посмотреть мои планы');await page.locator('.walk-row').filter({hasText:'19:45'}).getByRole('button').click();await click('Удалить прогулку');await page.getByRole('dialog').getByRole('button',{name:'Удалить прогулку',exact:true}).click();await click('Посмотреть мои планы');await expect(page.locator('.walk-row').filter({hasText:'19:45'})).toHaveCount(0)});
await run('Общий питомец: правка и удаление только из списка',async()=>{await open('pets');await page.getByRole('button',{name:/Луна/}).click();await expect(page.getByRole('button',{name:/Поделиться питомцем/})).toHaveCount(0);await page.getByRole('button',{name:/Изменить данные/}).click();await page.getByLabel('Имя хозяина',{exact:true}).fill('Мария и Анна');await click('Сохранить изменения');await success();await expect(page.locator('.facts')).toContainText('Мария и Анна');await page.getByRole('button',{name:/Убрать из моего списка/}).click();await click('Убрать из списка');await success();await expect(page.getByRole('button',{name:/Луна/})).toHaveCount(0);await click('Рядом');await expect(page.locator('.timeline')).toContainText('Луна')});
await run('Копирование и ротация одноразовой ссылки',async()=>{await open('share');const old=await page.getByLabel('Одноразовая ссылка').inputValue();await click('Скопировать ссылку');await expect(page.locator('.success')).toBeVisible();await success();await page.getByRole('button',{name:/Поделиться питомцем/}).click();await click('Получить новую ссылку');await page.getByRole('dialog').getByRole('button',{name:'Получить новую ссылку',exact:true}).click();await success();const updated=await page.getByLabel('Одноразовая ссылка').inputValue();expect(updated).not.toBe(old);await page.goto(old);await expect(page.getByRole('heading',{name:'Ссылка недействительна'})).toBeVisible()});
await run('Принятие приглашения и защита от повтора',async()=>{await open('accept');await click('Добавить к моим питомцам');await success();await expect(page.getByRole('button',{name:/Ричи/})).toBeVisible();await page.evaluate(()=>{location.hash='accept'});await expect(page.getByRole('heading',{name:'Ссылка уже использована'})).toBeVisible()});
await run('Заявка → администратор → одобрение → локация',async()=>{await open('request');await page.getByLabel('Жилой комплекс').fill('Южные сады');await click('Отправить заявку');await expect(page.locator('.success')).toBeVisible();await page.evaluate(()=>{location.hash='admin-login'});await page.getByLabel('Логин').fill('demo');await page.getByLabel('Пароль').fill('dogmeet');await click('Войти');await click('Открыть управление');await page.getByRole('button',{name:/Заявки жителей/}).click();await page.locator('.request-row').filter({hasText:'Южные сады'}).getByRole('button',{name:'Добавить',exact:true}).click();await click('Добавить локацию');await success();await expect(page.locator('.request-row').filter({hasText:'Южные сады'})).toHaveCount(0);await page.evaluate(()=>{location.hash='location'});await expect(page.getByLabel('Жилой комплекс').getByRole('option',{name:'Южные сады'})).toHaveCount(1)});
await run('Админ: отклонение, правка и удаление чужого питомца, уведомления и выход',async()=>{await open('requests');await page.locator('.request-row').first().getByRole('button',{name:'Отклонить',exact:true}).click();await click('Отклонить заявку');await success();await expect(page.locator('.request-row')).toHaveCount(1);await page.evaluate(()=>{location.hash='admin-pets'});await page.getByRole('button',{name:/Ричи/}).click();await page.getByLabel('Имя питомца',{exact:true}).fill('Ричард');await click('Сохранить изменения');await success();await page.getByRole('button',{name:/Ричард/}).click();await click('Удалить питомца');await page.getByRole('dialog').getByRole('button',{name:'Удалить питомца',exact:true}).click();await success();await expect(page.getByRole('button',{name:/Ричард/})).toHaveCount(0);await page.evaluate(()=>{location.hash='notifications'});await page.getByRole('switch').click();await expect(page.getByRole('switch')).toHaveAttribute('aria-checked','true');await page.evaluate(()=>{location.hash='admin-logout'});await click('Выйти');await success();await expect(page.getByLabel('Пароль')).toHaveValue('')});
await run('Форма при уменьшенной высоте клавиатуры',async()=>{await page.setViewportSize({width:360,height:430});await open('new-pet');await page.getByLabel('Порода',{exact:true}).fill('Длинношёрстный колли');await page.getByRole('button',{name:'Добавить питомца',exact:true}).scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'Добавить питомца',exact:true})).toBeInViewport();await page.setViewportSize({width:390,height:844})});
await mkdir(`${root}png`,{recursive:true});
const audit=[];const full=process.argv.includes('--capture');
for(const width of [360,390,430]){await page.setViewportSize({width,height:844});for(const c of captures){await open(c.id,c.state);const result=await page.evaluate(()=>{const phone=document.querySelector('.phone');const overflow=[];const tiny=[];for(const e of document.querySelectorAll('.phone button,.phone input,.phone select,.phone textarea,dialog button,dialog input')){const r=e.getBoundingClientRect();if(!r.width||!r.height||e.closest('[inert]'))continue;if(r.width<43.5||r.height<43.5)tiny.push({text:e.getAttribute('aria-label')||e.textContent?.slice(0,30),w:r.width,h:r.height})}for(const e of document.querySelectorAll('.phone *,dialog *')){const r=e.getBoundingClientRect();if(r.width&&r.left<-.6||r.right>innerWidth+.6)if(!e.closest('[inert]')&&getComputedStyle(e).position!=='fixed')overflow.push(e.className?.baseVal??e.className)}const unevenHighlight=[];for(const e of document.querySelectorAll('.menu-row,.pet-row')){const r=e.getBoundingClientRect();if(!r.width||!r.height||e.closest('[inert]'))continue;const first=e.firstElementChild.getBoundingClientRect(),last=e.lastElementChild.getBoundingClientRect();const left=first.left-r.left,right=r.right-last.right;if(Math.abs(left-right)>.5||left<11.5)unevenHighlight.push({text:e.textContent,left,right});}return {unevenHighlight,width:innerWidth,scroll:document.documentElement.scrollWidth,phone:phone.getBoundingClientRect().width,overflow:[...new Set(overflow)],tiny,broken:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src),headings:document.querySelectorAll('h1').length}});audit.push({screen:c.id,state:c.state,...result});if(result.unevenHighlight.length||result.scroll>width||result.overflow.length||result.tiny.length||result.broken.length)failures.push({name:`${c.id}/${c.state}@${width}`,result});if(width===390&&full){const height=Math.max(844,await page.evaluate(()=>document.documentElement.scrollHeight));await page.setViewportSize({width,height});await page.screenshot({path:`${root}png/${c.file}`,fullPage:true,animations:'disabled'});await page.setViewportSize({width,height:844})}}
console.log(`AUDIT ${width}: ${captures.length} variants`)}
await writeFile(`${root}check-results.json`,JSON.stringify({date:new Date().toISOString(),screens:screens.length,variants:captures.length,viewportChecks:audit.length,results,failures,consoleErrors:[...new Set(consoleErrors)],externalRequests:[...new Set(requests)],audit},null,2));
await browser.close();console.log(JSON.stringify({scenarios:results.length,failures:failures.length,consoleErrors:consoleErrors.length,externalRequests:requests.length,variants:captures.length}));if(failures.length||consoleErrors.length||requests.length)process.exitCode=1;
