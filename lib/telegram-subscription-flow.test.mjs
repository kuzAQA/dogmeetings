import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function load(file, imports = {}) {
  const exports = {};
  const js = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS }
  }).outputText;
  runInNewContext(js, { exports, require(name) { assert.ok(name in imports, name); return imports[name]; }, crypto, Date, Response, URL, TextEncoder, console });
  return exports;
}

const protocol = load('./telegram-subscription-protocol.ts');
const token = 'a'.repeat(32);
const tables = Object.fromEntries(['telegramSubscriptionIntents', 'telegramComplexSubscriptions'].map(name => [name,
  new Proxy({ name }, { get: (target, key) => target[key] ?? String(key) })]));
const orm = {
  eq: (key, value) => row => row[key] === value,
  gt: (key, value) => row => row[key] > value,
  isNull: key => row => row[key] == null,
  and: (...conditions) => row => conditions.every(condition => condition(row))
};

async function fixture() {
  const intent = { tokenHash: Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))).toString('hex'),
    city: 'Москва', district: 'Район', residentialComplex: 'Скандинавия', expiresAt: new Date(Date.now() + 900000), usedByChatId: null };
  const subscriptions = [];
  const sent = [];
  function builder(operation, selection) {
    let table, predicate = () => true, values;
    const query = {
      from(value) { table = value; return query; },
      values(value) { values = value; return query; },
      set(value) { values = value; return query; },
      where(value) { predicate = value; return query; },
      onConflictDoNothing() { return query; },
      limit() { return query; },
      returning() { return query; },
      then(resolve, reject) {
        try {
          const rows = table === tables.telegramSubscriptionIntents ? [intent] : subscriptions;
          let result;
          if (operation === 'insert') {
            const duplicate = rows.some(row => ['telegramChatId', 'city', 'district', 'residentialComplex'].every(key => row[key] === values[key]));
            result = duplicate ? [] : [{ active: true, ...values }];
            rows.push(...result);
          } else {
            result = rows.filter(predicate);
            if (operation === 'update') result.forEach(row => Object.assign(row, values));
          }
          resolve(result.map(row => selection ? Object.fromEntries(Object.entries(selection).map(([key, column]) => [key, row[column]])) : { ...row }));
        } catch (error) { reject(error); }
      }
    };
    return query;
  }
  const db = { select: selection => builder('select', selection), insert: table => builder('insert').from(table),
    update: table => builder('update').from(table), transaction: callback => callback(db) };
  const service = load('./telegram-subscriptions.ts', {
    'drizzle-orm': orm, '../db': { withDb: callback => callback(db) }, '../db/schema': tables,
    './telegram': { telegramBotUsername: async () => 'DogmeetBot' }, './telegram-subscription-protocol': protocol
  });
  const route = load('../app/api/telegram/webhook/route.ts', {
    '../../../../lib/telegram': { isTelegramWebhookRequest: request => request.headers.get('x-telegram-bot-api-secret-token') === 'secret',
      telegramBotRequest: async (method, body) => { sent.push({ method, body }); return true; } },
    '../../../../lib/telegram-subscriptions': service, '../../../../lib/telegram-subscription-protocol': protocol,
    '../../../../server/infrastructure/public-origin': { PUBLIC_ORIGIN: 'https://dogmeet.ru' },
    '../../../../scripts/cleanup-expired-walks.mjs': { telegramRetentionBoundary: () => new Date(0) },
    '../../dogsfather/location-requests/route': { PATCH: assert.fail, DELETE: assert.fail }
  });
  const message = { message_id: 1, date: Math.floor(Date.now() / 1000), chat: { id: 123, type: 'private' } };
  const post = (update, secret = 'secret') => route.POST(new Request('https://dogmeet.ru/api/telegram/webhook', {
    method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify(update)
  }));
  const start = (value = token, overrides = {}) => post({ message: { ...message, text: `/start ${value}`, ...overrides } });
  const command = (text = '/subscriptions', overrides = {}) => post({ message: { ...message, text, ...overrides } });
  const callback = (data = `complex-subscribe:${token}`, from = 123, overrides = {}) => post({ callback_query: {
    id: 'callback', from: { id: from }, message, data, ...overrides
  } });
  return { intent, subscriptions, sent, service, start, command, callback, post };
}

test('/subscriptions lists only the current chat active subscriptions', async () => {
  const f = await fixture();
  const own = { id: crypto.randomUUID(), telegramChatId: '123', residentialComplex: 'Первый ЖК', active: true };
  f.subscriptions.push(own,
    { ...own, id: crypto.randomUUID(), residentialComplex: 'Второй ЖК' },
    { ...own, id: crypto.randomUUID(), telegramChatId: '456', residentialComplex: 'Чужой ЖК' },
    { ...own, id: crypto.randomUUID(), active: false, residentialComplex: 'Отключённый ЖК' });
  await f.command('/subscriptions@DogmeetBot');
  const reply = f.sent.find(call => call.method === 'sendMessage').body;
  assert.match(reply.text, /Ваши подписки/);
  assert.equal(reply.reply_markup.inline_keyboard.length, 2);
  assert.equal(reply.reply_markup.inline_keyboard[0][0].callback_data, protocol.telegramUnsubscribeCallbackData(own.id));
  assert.match(reply.reply_markup.inline_keyboard[0][0].text, /Первый ЖК/);
  assert.match(reply.reply_markup.inline_keyboard[1][0].text, /Второй ЖК/);
  assert.doesNotMatch(JSON.stringify(reply), /Чужой ЖК|Отключённый ЖК/);
});

test('/subscriptions handles no subscriptions and ignores group chats and other commands', async () => {
  const f = await fixture();
  await f.command();
  assert.match(f.sent[0].body.text, /нет активных подписок/);
  assert.deepEqual(f.sent[0].body.reply_markup.inline_keyboard, []);
  f.sent.length = 0;
  await f.command('/subscriptions', { chat: { id: -123, type: 'group' } });
  await f.command('/subscriptions_other');
  assert.equal(f.sent.length, 0);
});

test('unsubscribe refreshes the same message and keeps other subscriptions', async () => {
  const f = await fixture();
  const first = { id: crypto.randomUUID(), telegramChatId: '123', residentialComplex: 'Первый ЖК', active: true };
  const second = { ...first, id: crypto.randomUUID(), residentialComplex: 'Второй ЖК' };
  f.subscriptions.push(first, second);
  await f.callback(protocol.telegramUnsubscribeCallbackData(first.id));
  assert.equal(first.active, false);
  assert.equal(second.active, true);
  const update = f.sent.find(call => call.method === 'editMessageText').body;
  assert.equal(update.message_id, 1);
  assert.equal(update.reply_markup.inline_keyboard.length, 1);
  assert.match(update.reply_markup.inline_keyboard[0][0].text, /Второй ЖК/);
  await f.callback(protocol.telegramUnsubscribeCallbackData(second.id));
  assert.match(f.sent.filter(call => call.method === 'editMessageText').at(-1).body.text, /нет активных подписок/);
});

test('unsubscribe rejects another sender and another chat subscription', async () => {
  const f = await fixture();
  const own = { id: crypto.randomUUID(), telegramChatId: '123', residentialComplex: 'Свой ЖК', active: true };
  const other = { ...own, id: crypto.randomUUID(), telegramChatId: '456' };
  f.subscriptions.push(own, other);
  await f.callback(protocol.telegramUnsubscribeCallbackData(own.id), 456);
  assert.equal(own.active, true);
  await f.callback(protocol.telegramUnsubscribeCallbackData(other.id));
  assert.equal(other.active, true);
});

test('/subscriptions reports a database failure instead of an empty list', async () => {
  const f = await fixture();
  f.service.listTelegramComplexSubscriptions = async () => { throw new Error('database unavailable'); };
  await f.command();
  assert.match(f.sent.find(call => call.method === 'sendMessage').body.text, /Не удалось загрузить подписки/);
});

test('/start shows greeting and inline button without subscribing', async () => {
  const f = await fixture();
  await f.start();
  assert.equal(f.subscriptions.length, 0);
  assert.equal(f.intent.usedByChatId, '123');
  const welcome = f.sent.find(call => call.method === 'sendMessage').body;
  assert.equal(welcome.text, 'Привет! 🐾 Я помогу узнавать о новых прогулках.\n\n🏘️ ЖК «Скандинавия»\nНажмите на кнопку ниже, чтобы подписаться на уведомления.');
  assert.equal(welcome.reply_markup.inline_keyboard[0][0].text, 'Подписаться');
  assert.equal(welcome.reply_markup.inline_keyboard[0][0].callback_data, `complex-subscribe:${token}`);
});

test('callback subscribes to server-side location and repeated click does not duplicate', async () => {
  const f = await fixture();
  await f.start();
  await f.callback();
  assert.equal(f.subscriptions.length, 1);
  assert.equal(f.subscriptions[0].telegramChatId, '123');
  assert.equal(f.subscriptions[0].residentialComplex, 'Скандинавия');
  assert.equal(f.subscriptions[0].city, 'Москва');
  assert.equal(f.subscriptions[0].district, 'Район');
  assert.ok(f.sent.some(call => call.body.text === '✅ Вы подписались на уведомления ЖК „Скандинавия“'));
  await f.callback();
  assert.equal(f.subscriptions.length, 1);
  assert.ok(f.sent.some(call => /уже активна/.test(call.body.text)));
  assert.equal(f.sent.filter(call => call.method === 'answerCallbackQuery').length, 2);
});

for (const invalid of ['unknown', 'expired', 'other chat', 'unclaimed', 'malformed']) {
  test(`rejects ${invalid} token without creating subscription`, async () => {
    const f = await fixture();
    if (invalid !== 'unclaimed') await f.start();
    if (invalid === 'expired') f.intent.expiresAt = new Date(0);
    if (invalid === 'other chat') f.intent.usedByChatId = '456';
    const data = invalid === 'unknown' ? 'b'.repeat(32) : invalid === 'malformed' ? 'invalid' : token;
    await f.callback(`complex-subscribe:${data}`);
    assert.equal(f.subscriptions.length, 0);
    assert.ok(f.sent.some(call => call.method === 'answerCallbackQuery'));
    assert.match(f.sent.at(-1).body.text, /сайт|приложени/);
  });
}

test('invalid /start offers a new link from the site', async () => {
  for (const value of ['b'.repeat(32), 'invalid']) {
    const f = await fixture();
    await f.start(value);
    assert.equal(f.subscriptions.length, 0);
    assert.match(f.sent.at(-1).body.text, /сайт|приложени/);
  }
});

test('callback must come from the owner of the private chat', async () => {
  const f = await fixture();
  await f.start();
  await f.callback(undefined, 456);
  assert.equal(f.subscriptions.length, 0);
  await f.callback(undefined, 123, { message: { message_id: 1, chat: { id: 123, type: 'group' } } });
  assert.equal(f.subscriptions.length, 0);
});

test('webhook secret remains required', async () => {
  const f = await fixture();
  assert.equal((await f.post({ message: { text: `/start ${token}` } }, 'wrong')).status, 401);
  assert.equal(f.sent.length, 0);
});

test('expired or previously claimed /start does not show a subscribe button', async () => {
  for (const invalid of ['expired', 'claimed']) {
    const f = await fixture();
    if (invalid === 'expired') f.intent.expiresAt = new Date(0);
    else f.intent.usedByChatId = '456';
    await f.start();
    assert.equal(f.subscriptions.length, 0);
    const reply = f.sent.find(call => call.method === 'sendMessage').body;
    assert.match(reply.text, /Снова откройте бота с сайта/);
    assert.equal(reply.reply_markup, undefined);
  }
});

test('a new confirmation reactivates the existing subscription row', async () => {
  const f = await fixture();
  await f.start();
  await f.callback();
  const id = f.subscriptions[0].id;
  await f.service.deactivateTelegramComplexSubscription(id, '123');
  assert.equal(f.subscriptions[0].active, false);
  await f.start();
  assert.equal(f.subscriptions[0].active, false);
  await f.callback();
  assert.equal(f.subscriptions.length, 1);
  assert.equal(f.subscriptions[0].id, id);
  assert.equal(f.subscriptions[0].active, true);
});

test('subscribe callback fits Telegram limit and accepts only opaque tokens', () => {
  assert.ok(Buffer.byteLength(`complex-subscribe:${token}`) <= 64);
  assert.equal(protocol.telegramSubscribeToken(`complex-subscribe:${token}`), token);
  assert.equal(protocol.telegramSubscribeToken('complex-subscribe:Скандинавия'), null);
});
