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
  runInNewContext(js, { exports, require(name) { assert.ok(name in imports, name); return imports[name]; }, crypto, Date, Response, URL, TextEncoder, console: { error() {} } });
  return exports;
}
const protocol = load('./telegram-subscription-protocol.ts');
const token = 'a'.repeat(32);
const clientId = '30000000-0000-4000-8000-000000000001';
const tables = Object.fromEntries(['telegramSubscriptionIntents', 'telegramComplexSubscriptions'].map(name => [name,
  new Proxy({ name }, { get: (target, key) => target[key] ?? String(key) })]));
const orm = {
  sql: (parts, ...params) => ({ text: parts.join('?'), params }),
  eq: (key, value) => row => row[key] === value,
  gt: (key, value) => row => row[key] > value,
  isNull: key => row => row[key] == null,
  and: (...conditions) => row => conditions.every(condition => condition(row))
};

async function fixture(purpose = 'combined') {
  const intents = [{ clientId, purpose, tokenHash: Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))).toString('hex'),
    city: 'Москва', district: 'Район', residentialComplex: 'Скандинавия', expiresAt: new Date(Date.now() + 900000), usedByChatId: null }];
  const subscriptions = [], settings = [], sent = [];
  const state = { failWalk: false };
  function builder(operation, selection) {
    let table, predicate = () => true, values, conflict;
    const query = {
      from(value) { table = value; return query; }, values(value) { values = value; return query; },
      set(value) { values = value; return query; }, where(value) { predicate = value; return query; },
      onConflictDoUpdate(value) { conflict = value; return query; }, limit() { return query; },
      for() { return query; }, returning(value) { selection = value; return query; },
      then(resolve, reject) {
        try {
          const rows = table === tables.telegramSubscriptionIntents ? intents : subscriptions;
          let result;
          if (operation === 'insert') {
            if (rows === subscriptions && state.failWalk) throw new Error('walk write failed');
            const duplicate = rows.find(row => rows === intents ? row.tokenHash === values.tokenHash
              : ['telegramChatId', 'city', 'district', 'residentialComplex'].every(key => row[key] === values[key]));
            if (duplicate) { if (conflict) Object.assign(duplicate, conflict.set); result = []; }
            else { result = [{ active: true, ...values }]; rows.push(...result); }
          } else { result = rows.filter(predicate); if (operation === 'update') result.forEach(row => Object.assign(row, values)); }
          resolve(result.map(row => selection ? Object.fromEntries(Object.entries(selection).map(([key, column]) => [key, row[column]])) : { ...row }));
        } catch (error) { reject(error); }
      }
    };
    return query;
  }
  function querySettings(text, params) {
    if (/advisory/.test(text)) return { rows: [] };
    if (/SELECT EXISTS/.test(text)) return { rows: [{ enabled: settings.some(row => row.chat === params[0] && row.enabled) }] };
    if (/SELECT client_id/.test(text)) {
      const found = settings.find(row => /client_id =/.test(text) ? row.client === params[0] && row.chat === params[1] : row.chat === params[0] && row.enabled);
      return { rows: found ? [{ client_id: found.client }] : [] };
    }
    if (/INSERT INTO telegram_chat_settings/.test(text)) {
      const [client, chat] = params; const enabled = params.length === 3 ? params[2] : true;
      const row = settings.find(row => row.client === client);
      if (row) Object.assign(row, { chat, enabled }); else settings.push({ client, chat, enabled });
    } else if (/UPDATE telegram_chat_settings/.test(text)) {
      settings.filter(row => row.chat === params[0]).forEach(row => { row.enabled = /enabled = true/.test(text); });
    } else throw new Error(text);
    return { rows: [] };
  }
  const db = { execute: ({ text, params }) => Promise.resolve(querySettings(text, params)),
    $client: { query: (text, params) => Promise.resolve(querySettings(text, params)) },
    select: selection => builder('select', selection), insert: table => builder('insert').from(table), update: table => builder('update').from(table),
    async transaction(callback) {
      const snapshots = [intents, subscriptions, settings].map(rows => structuredClone(rows));
      try { return await callback(db); } catch (error) {
        [intents, subscriptions, settings].forEach((rows, i) => rows.splice(0, rows.length, ...snapshots[i])); throw error;
      }
    } };
  const service = load('./telegram-subscriptions.ts', { 'drizzle-orm': orm, '../db': { withDb: callback => callback(db) }, '../db/schema': tables,
    './telegram': { telegramBotUsername: async () => 'DogmeetBot' }, './telegram-subscription-protocol': protocol });
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
    method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify(update) }));
  const command = (text = '/subscriptions', overrides = {}) => post({ message: { ...message, text, ...overrides } });
  const start = (value = token, overrides = {}) => command(`/start ${value}`, overrides);
  const callback = (data = `complex-subscribe:${token}`, from = 123, overrides = {}) => post({ callback_query: {
    id: 'callback', from: { id: from }, message, data, ...overrides } });
  return { intents, subscriptions, settings, sent, service, start, command, callback, post, state };
}

test('/start explains both subscriptions without changing consent or linking identity', async () => {
  const f = await fixture(); await f.start();
  assert.equal(f.subscriptions.length, 0); assert.equal(f.settings.length, 0);
  assert.equal(f.intents[0].usedByChatId, '123');
  const reply = f.sent.find(call => call.method === 'sendMessage').body;
  assert.equal(reply.text, 'Получайте уведомления о новых прогулках в ЖК „Скандинавия“ и о новых сообщениях от других владельцев собак');
  assert.equal(reply.reply_markup.inline_keyboard.flat().length, 1);
  assert.equal(reply.reply_markup.inline_keyboard[0][0].text, 'Подписаться');
});

test('reopening from the site shows active complexes from this Telegram chat without offering to subscribe', async () => {
  const f = await fixture();
  f.subscriptions.push(
    { id: crypto.randomUUID(), telegramChatId: '123', active: true, residentialComplex: 'Первый ЖК' },
    { id: crypto.randomUUID(), telegramChatId: '123', active: true, residentialComplex: 'Второй ЖК' },
    { id: crypto.randomUUID(), telegramChatId: '123', active: false, residentialComplex: 'Отключённый ЖК' },
    { id: crypto.randomUUID(), telegramChatId: '456', active: true, residentialComplex: 'Чужой ЖК' }
  );
  const before = JSON.stringify(f.subscriptions);
  await f.start();
  const reply = f.sent.find(call => call.method === 'sendMessage').body;
  assert.equal(reply.text, 'Подписка на уведомления о прогулках уже активна. Ваши ЖК: „Первый ЖК“, „Второй ЖК“.');
  assert.equal(reply.reply_markup, undefined);
  assert.equal(JSON.stringify(f.subscriptions), before);
  assert.equal(f.settings.length, 0);
});

test('inactive and other Telegram chat subscriptions keep the existing subscription offer', async () => {
  const f = await fixture();
  f.subscriptions.push(
    { telegramChatId: '123', active: false, residentialComplex: 'Скандинавия' },
    { telegramChatId: '456', active: true, residentialComplex: 'Чужой ЖК' }
  );
  await f.start();
  const reply = f.sent.find(call => call.method === 'sendMessage').body;
  assert.match(reply.text, /ЖК „Скандинавия“/);
  assert.equal(reply.reply_markup.inline_keyboard[0][0].text, 'Подписаться');
  assert.equal(f.subscriptions.length, 2);
  assert.equal(f.settings.length, 0);
});

for (const action of ['back', 'walks', 'messages']) {
  test(`subscriptions:${action} deletes the current menu before sending a new message`, async () => {
    const f = await fixture();
    await f.start(); await f.callback();
    f.sent.length = 0;
    await f.callback(`subscriptions:${action}`, 123, { message: { message_id: 42, chat: { id: 123, type: 'private' } } });
    assert.deepEqual(f.sent.map(call => call.method), ['answerCallbackQuery', 'deleteMessage', 'sendMessage']);
    assert.equal(f.sent[1].body.chat_id, '123');
    assert.equal(f.sent[1].body.message_id, 42);
    assert.match(f.sent[2].body.text, action === 'back' ? /От каких уведомлений/ : action === 'walks' ? /Ваши подписки/ : /личных сообщениях/);
  });
}

for (const purpose of ['combined', 'messages-subscribe']) {
  test(`${purpose} confirmation deletes the subscribe message only after successful activation`, async () => {
    const f = await fixture(purpose);
    const data = `${purpose === 'combined' ? 'complex-subscribe' : purpose}:${token}`;
    await f.start();
    f.sent.length = 0;
    await f.callback(data, 456);
    assert.equal(f.sent.some(call => call.method === 'deleteMessage'), false);
    await f.callback(data, 123, { message: { message_id: 42, chat: { id: 123, type: 'private' } } });
    const deleted = f.sent.filter(call => call.method === 'deleteMessage');
    assert.equal(deleted.length, 1);
    assert.equal(deleted[0].body.chat_id, '123');
    assert.equal(deleted[0].body.message_id, 42);
    await f.callback(data);
    assert.equal(f.sent.filter(call => call.method === 'deleteMessage').length, 1);
  });
}

test('confirmation saves both subscriptions, success has no unsubscribe button, replay cannot restore cancelled consent', async () => {
  const f = await fixture(); await f.start(); await f.callback();
  assert.equal(f.subscriptions.length, 1); assert.equal(f.settings[0].enabled, true);
  const success = f.sent.filter(call => call.method === 'sendMessage').at(-1).body;
  assert.match(success.text, /прогулках.*Скандинавия.*личных сообщениях/); assert.equal(success.reply_markup, undefined);
  await f.service.deactivateTelegramComplexSubscription(f.subscriptions[0].id, '123'); f.settings[0].enabled = false;
  await f.callback();
  assert.equal(f.subscriptions.length, 1); assert.equal(f.subscriptions[0].active, false); assert.equal(f.settings[0].enabled, false);
});

test('failure saving walks rolls back message consent and allows retry', async () => {
  const f = await fixture(); await f.start(); f.state.failWalk = true;
  await assert.rejects(() => f.service.activateTelegramComplexSubscription(token, '123'), /walk write failed/);
  assert.equal(f.settings.length, 0); assert.equal(f.subscriptions.length, 0); assert.equal(f.intents[0].completedAt, undefined);
  f.state.failWalk = false; await f.callback(); assert.equal(f.settings[0].enabled, true);
});

test('/subscriptions and ordinary /start for either subscription show two management choices', async () => {
  for (const kind of ['walks', 'messages']) {
    const f = await fixture();
    if (kind === 'walks') f.subscriptions.push({ id: crypto.randomUUID(), telegramChatId: '123', residentialComplex: 'ЖК', active: true });
    else f.settings.push({ client: clientId, chat: '123', enabled: true });
    for (const command of ['/subscriptions', '/start']) {
      f.sent.length = 0; await f.command(command);
      const reply = f.sent.find(call => call.method === 'sendMessage').body;
      assert.equal(reply.text, 'От каких уведомлений вы хотите отписаться?');
      assert.deepEqual(Array.from(reply.reply_markup.inline_keyboard, row => row[0].text), ['От прогулок', 'От сообщений']);
    }
    await f.start(); assert.match(f.sent.at(-1).body.text, /Получайте/);
  }
});

test('walk list includes only own active complexes; removal preserves other walks and messages', async () => {
  const f = await fixture(); const own = { id: crypto.randomUUID(), telegramChatId: '123', residentialComplex: 'Первый ЖК', active: true };
  f.subscriptions.push(own, { ...own, id: crypto.randomUUID(), residentialComplex: 'Второй ЖК' }, { ...own, id: crypto.randomUUID(), telegramChatId: '456' }, { ...own, active: false, id: crypto.randomUUID() });
  f.settings.push({ client: clientId, chat: '123', enabled: true });
  await f.callback('subscriptions:walks');
  const list = f.sent.find(call => call.method === 'sendMessage').body;
  assert.deepEqual(Array.from(list.reply_markup.inline_keyboard, row => row[0].text), ['Первый ЖК', 'Второй ЖК', 'Назад']);
  await f.callback(protocol.telegramUnsubscribeCallbackData(own.id));
  assert.equal(own.active, false); assert.equal(f.subscriptions[1].active, true); assert.equal(f.settings[0].enabled, true);
  await f.callback(protocol.telegramUnsubscribeCallbackData(f.subscriptions[1].id));
  assert.match(f.sent.filter(call => call.method === 'editMessageText').at(-1).body.text, /нет активных подписок/);
  const count = f.sent.filter(call => call.method === 'sendMessage').length;
  await f.callback(protocol.telegramUnsubscribeCallbackData(own.id)); assert.equal(f.sent.filter(call => call.method === 'sendMessage').length, count);
});

test('messages unsubscribe requires one explicit confirmation and preserves walks; expired and replayed buttons are safe', async () => {
  const f = await fixture(); await f.start(); await f.callback();
  await f.callback('subscriptions:messages');
  const reply = f.sent.filter(call => call.method === 'sendMessage').at(-1).body;
  assert.equal(reply.text, 'Вы точно хотите отписаться от уведомлений о личных сообщениях других владельцев собак?');
  const button = reply.reply_markup.inline_keyboard[0][0]; assert.equal(button.text, 'Отписаться');
  assert.equal(f.settings[0].enabled, true);
  await f.callback(button.callback_data, 456); assert.equal(f.settings[0].enabled, true);
  await f.callback(button.callback_data); assert.equal(f.settings[0].enabled, false); assert.equal(f.subscriptions[0].active, true);
  f.settings[0].enabled = true; await f.callback(button.callback_data); assert.equal(f.settings[0].enabled, true);
  await f.callback('subscriptions:messages'); const expired = f.sent.at(-1).body.reply_markup.inline_keyboard[0][0].callback_data;
  f.intents.at(-1).expiresAt = new Date(0); await f.callback(expired); assert.equal(f.settings[0].enabled, true);
});

test('messages-only confirmation works without a location and rejects purpose confusion', async () => {
  const f = await fixture('messages-subscribe'); Object.assign(f.intents[0], { city: '', district: '', residentialComplex: '' });
  await f.start(); await f.callback(); assert.equal(f.settings.length, 0);
  await f.callback(`messages-subscribe:${token}`); assert.equal(f.settings[0].enabled, true); assert.equal(f.subscriptions.length, 0);
});

test('checking identity copies existing consent to session without subscribing or changing other consent', async () => {
  for (const enabled of [true, false]) {
    const f = await fixture('messages-check'); f.settings.push({ client: 'other-session', chat: '123', enabled });
    await f.start(); assert.equal(f.settings.find(row => row.client === clientId).enabled, enabled);
    assert.equal(f.settings[0].enabled, enabled); assert.equal(f.subscriptions.length, 0);
    assert.equal(f.sent.at(-1).body.reply_markup, undefined);
    await f.callback(`messages-subscribe:${token}`); assert.equal(f.settings[0].enabled, enabled);
  }
});

test('site unsubscribe cannot target a different Telegram identity', async () => {
  const f = await fixture('messages-unsubscribe'); f.settings.push({ client: clientId, chat: '456', enabled: true });
  await f.start(); await f.callback(`messages-unsubscribe:${token}`); assert.equal(f.settings[0].enabled, true);
});

for (const invalid of ['unknown', 'expired', 'other chat', 'unclaimed', 'malformed', 'no client', 'purpose']) {
  test(`rejects ${invalid} token without changing subscriptions or identity`, async () => {
    const f = await fixture(); if (invalid !== 'unclaimed') await f.start();
    if (invalid === 'expired') f.intents[0].expiresAt = new Date(0);
    if (invalid === 'other chat') f.intents[0].usedByChatId = '456';
    if (invalid === 'no client') f.intents[0].clientId = null;
    if (invalid === 'purpose') f.intents[0].purpose = 'bad';
    const value = invalid === 'unknown' ? 'b'.repeat(32) : invalid === 'malformed' ? 'invalid' : token;
    await f.callback(`complex-subscribe:${value}`); assert.equal(f.subscriptions.length, 0); assert.equal(f.settings.length, 0);
    assert.match(f.sent.at(-1).body.text, /сайт/);
  });
}

test('secret, private chat, callback owner and subscription owner remain required', async () => {
  const f = await fixture(); assert.equal((await f.post({}, 'wrong')).status, 401);
  await f.start(token, { chat: { id: -123, type: 'group' } }); assert.equal(f.sent.length, 0);
  await f.start(); await f.callback(undefined, 456); assert.equal(f.settings.length, 0);
  await f.callback(undefined, 123, { message: { message_id: 1, chat: { id: 123, type: 'group' } } }); assert.equal(f.settings.length, 0);
  const other = { id: crypto.randomUUID(), telegramChatId: '456', active: true }; f.subscriptions.push(other);
  await f.callback(protocol.telegramUnsubscribeCallbackData(other.id)); assert.equal(other.active, true);
});

test('new confirmation reactivates existing walk row without duplicates', async () => {
  const f = await fixture(); await f.start(); await f.callback(); const id = f.subscriptions[0].id;
  await f.service.deactivateTelegramComplexSubscription(id, '123');
  const link = await f.service.createTelegramSubscriptionLink({ city: 'Москва', district: 'Район', complex: 'Скандинавия' }, clientId);
  const next = new URL(link).searchParams.get('start'); await f.start(next); assert.equal(f.subscriptions[0].active, false);
  await f.callback(`complex-subscribe:${next}`); assert.equal(f.subscriptions.length, 1); assert.equal(f.subscriptions[0].id, id); assert.equal(f.subscriptions[0].active, true);
});

test('PostgreSQL: combined confirmation is atomic, scoped and consumed once', {
  skip: !process.env.CHAT_TEST_DATABASE_URL && 'Set CHAT_TEST_DATABASE_URL to a test PostgreSQL database'
}, async () => {
  const { default: pg } = await import('pg');
  const realOrm = await import('drizzle-orm');
  const pgCore = await import('drizzle-orm/pg-core');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const client = new pg.Client({ connectionString: process.env.CHAT_TEST_DATABASE_URL });
  const namespace = `telegram_subscription_test_${crypto.randomUUID().replaceAll('-', '')}`;
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${namespace}"`);
    await client.query(`SET search_path TO "${namespace}"`);
    const migration = readFileSync(new URL('../drizzle/0019_telegram_complex_subscriptions.sql', import.meta.url), 'utf8');
    await client.query(migration.slice(0, migration.indexOf('CREATE TABLE "telegram_walk_notifications"')));
    for (const file of ['0048_telegram_chat_settings.sql', '0050_telegram_subscription_purposes.sql']) {
      await client.query(readFileSync(new URL(`../drizzle/${file}`, import.meta.url), 'utf8'));
    }
    const schema = load('../db/schema.ts', { 'drizzle-orm': realOrm, 'drizzle-orm/pg-core': pgCore });
    const db = drizzle(client);
    const service = load('./telegram-subscriptions.ts', { 'drizzle-orm': realOrm, '../db': { withDb: fn => fn(db) }, '../db/schema': schema,
      './telegram': { telegramBotUsername: async () => 'DogmeetBot' }, './telegram-subscription-protocol': protocol });
    const location = { city: 'Москва', district: 'Район', complex: 'Скандинавия' };
    const link = await service.createTelegramSubscriptionLink(location, clientId);
    const value = new URL(link).searchParams.get('start');
    await service.prepareTelegramComplexSubscription(value, '123');
    await client.query(`CREATE FUNCTION reject_walk_subscription() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'walk write failed'; END $$`);
    await client.query('CREATE TRIGGER reject_walk BEFORE INSERT ON telegram_complex_subscriptions FOR EACH ROW EXECUTE FUNCTION reject_walk_subscription()');
    await assert.rejects(() => service.activateTelegramComplexSubscription(value, '123'));
    assert.equal((await client.query('SELECT * FROM telegram_chat_settings')).rows.length, 0);
    assert.equal((await client.query('SELECT completed_at FROM telegram_subscription_intents')).rows[0].completed_at, null);
    await client.query('DROP TRIGGER reject_walk ON telegram_complex_subscriptions');
    assert.equal((await service.activateTelegramComplexSubscription(value, '123', 'messages-subscribe')).status, 'expired');
    assert.equal((await service.activateTelegramComplexSubscription(value, '456')).status, 'expired');
    assert.equal((await service.activateTelegramComplexSubscription(value, '123')).status, 'subscribed');
    assert.equal((await client.query('SELECT enabled FROM telegram_chat_settings')).rows[0].enabled, true);
    assert.equal((await client.query('SELECT * FROM telegram_complex_subscriptions')).rows.length, 1);
    const unsubscribe = await service.createTelegramMessagesUnsubscribeToken('123');
    await service.activateTelegramComplexSubscription(unsubscribe, '123', 'messages-unsubscribe');
    assert.equal((await client.query('SELECT active FROM telegram_complex_subscriptions')).rows[0].active, true);
    await service.activateTelegramComplexSubscription(value, '123');
    assert.equal(await service.telegramMessagesActive('123'), false, 'old subscribe confirmation must not restore consent');
    const check = new URL(await service.createTelegramSubscriptionLink(null, crypto.randomUUID(), 'messages-check')).searchParams.get('start');
    await service.prepareTelegramComplexSubscription(check, '123');
    assert.equal((await client.query('SELECT count(*)::int AS count FROM telegram_complex_subscriptions')).rows[0].count, 1);
    assert.equal(await service.telegramMessagesActive('123'), false);
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`);
    await client.end();
  }
});

test('invalid /start tokens cannot bind identity, change consent or offer confirmation', async () => {
  for (const invalid of ['expired', 'claimed', 'unknown', 'malformed', 'purpose']) {
    const f = await fixture();
    if (invalid === 'expired') f.intents[0].expiresAt = new Date(0);
    if (invalid === 'claimed') f.intents[0].usedByChatId = '456';
    if (invalid === 'purpose') f.intents[0].purpose = 'other';
    await f.start(invalid === 'unknown' ? 'b'.repeat(32) : invalid === 'malformed' ? 'invalid' : token);
    assert.equal(f.settings.length, 0); assert.equal(f.subscriptions.length, 0);
    const reply = f.sent.find(call => call.method === 'sendMessage').body;
    assert.equal(reply.reply_markup, undefined); assert.match(reply.text, /недействительна|просрочена/);
    assert.equal(f.intents[0].usedByChatId, invalid === 'claimed' ? '456' : null);
  }
});

test('ordinary /start for a new visitor offers the site without subscribing', async () => {
  const f = await fixture(); await f.command('/start');
  assert.equal(f.settings.length, 0); assert.equal(f.subscriptions.length, 0);
  assert.equal(f.sent[0].body.reply_markup.inline_keyboard[0][0].url, 'https://dogmeet.ru/?telegram=notifications');
});
