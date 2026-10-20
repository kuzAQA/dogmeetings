import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import pg from 'pg';
import { randomUUID } from 'node:crypto';

function fixture(rows = [], databaseQuery) {
  const calls = [];
  const queries = [];
  const exports = {};
  const source = readFileSync(new URL('./telegram-chat.ts', import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, console, require(name) {
      if (name === '../db') return { withDb: fn => fn({ $client: { query: async (sql, params) => { queries.push({ sql, params }); return databaseQuery ? databaseQuery(sql, params) : { rows }; } } }) };
      if (name === './telegram') return { telegramBotRequest: async (...args) => { calls.push(args); return true; } };
      throw new Error(name);
    }
  });
  return { service: exports, calls, queries };
}

test('Telegram sends only sender name, never chat content, to eligible recipient', async () => {
  const f = fixture([{ chat_id: '123', owner_name: 'Анна <&> _*[имя]', pet_name: 'Луна & <b>🐕</b>' }]);
  await f.service.notifyTelegramChatMessage('sender', 'dialog');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][0], 'sendMessage');
  assert.equal(f.calls[0][1].chat_id, '123');
  assert.equal(f.calls[0][1].text, '✉️ Вам пришло новое сообщение!\nОт: <b>Анна &lt;&amp;&gt; _*[имя]</b>\nПитомец: <b>Луна &amp; &lt;b&gt;🐕&lt;/b&gt;</b>');
  assert.equal(f.calls[0][1].parse_mode, 'HTML');
  assert.equal(JSON.stringify(f.calls[0][1].reply_markup), JSON.stringify({ inline_keyboard: [[{ text: 'Открыть', url: 'https://dogmeet.ru/?dialog=dialog' }]] }));
  assert.ok(!f.queries[0].sql.includes('dialog_messages'));
  assert.doesNotMatch(f.queries[0].sql, /s\.active/);
  assert.match(f.queries[0].sql, /n\.enabled/);
  assert.match(f.queries[0].sql, /n\.client_id <> \$1/);
});

for (const [owner_name, pet_name, expected] of [
  [null, null, '✉️ Вам пришло новое сообщение!'],
  [undefined, 'Луна', '✉️ Вам пришло новое сообщение!\nПитомец: <b>Луна</b>'],
  ['Анна', '  ', '✉️ Вам пришло новое сообщение!\nОт: <b>Анна</b>'],
]) {
  test(`Telegram handles missing names: ${owner_name}/${pet_name}`, async () => {
    const f = fixture([{ chat_id: '123', owner_name, pet_name }]);
    await f.service.notifyTelegramChatMessage('sender', 'dialog');
    assert.equal(f.calls[0][1].text, expected);
  });
}

test('no eligible recipient means no Telegram request', async () => {
  const f = fixture();
  await f.service.notifyTelegramChatMessage('sender', 'dialog');
  assert.equal(f.calls.length, 0);
});

test('message status depends on identity and message consent only', async () => {
  for (const [rows, status] of [[[], 'unknown'], [[{ enabled: false }], 'inactive'], [[{ enabled: true }], 'active']]) {
    const f = fixture(rows);
    assert.equal((await f.service.telegramChatSettings('client')).status, status);
    assert.doesNotMatch(f.queries[0].sql, /telegram_complex_subscriptions/);
  }
});

test('PostgreSQL: eligibility, opt-out, unsubscribing and same Telegram sender are enforced', {
  skip: !process.env.CHAT_TEST_DATABASE_URL && 'Set CHAT_TEST_DATABASE_URL to a test PostgreSQL database'
}, async () => {
  const client = new pg.Client({ connectionString: process.env.CHAT_TEST_DATABASE_URL });
  const schema = `telegram_chat_test_${randomUUID().replaceAll('-', '')}`;
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE telegram_subscription_intents (token_hash text PRIMARY KEY);
      CREATE TABLE telegram_complex_subscriptions (telegram_chat_id varchar(20), active boolean);
      CREATE TABLE pets (id uuid, client_id uuid, name text, owner_name text, created_at timestamptz);
      CREATE TABLE dialogs (id uuid, client_low uuid, client_high uuid, low_pet_id uuid, high_pet_id uuid);
    `);
    await client.query(readFileSync(new URL('../drizzle/0048_telegram_chat_settings.sql', import.meta.url), 'utf8'));
    const sender = randomUUID(), recipient = randomUUID(), dialog = randomUUID(), pet = randomUUID();
    await client.query('INSERT INTO dialogs VALUES ($1,$2,$3,$4,NULL)', [dialog, sender, recipient, pet]);
    await client.query("INSERT INTO pets VALUES ($1,$2,'Луна','Анна',now())", [pet, sender]);
    await client.query("INSERT INTO telegram_chat_settings VALUES ($1,'123',false)", [recipient]);
    await client.query("INSERT INTO telegram_complex_subscriptions VALUES ('123',true),('123',true)");
    const f = fixture([], (sql, params) => client.query(sql, params));
    await f.service.notifyTelegramChatMessage(sender, dialog);
    assert.equal(f.calls.length, 0, 'off by default');
    await client.query('UPDATE telegram_chat_settings SET enabled = true WHERE client_id = $1', [recipient]);
    await f.service.notifyTelegramChatMessage(sender, dialog);
    assert.equal(f.calls.length, 1, 'multiple walks subscriptions still produce one notification');
    assert.equal(f.calls[0][1].text, '✉️ Вам пришло новое сообщение!\nОт: <b>Анна</b>\nПитомец: <b>Луна</b>');
    const otherPet = randomUUID();
    await client.query("INSERT INTO pets VALUES ($1,$2,'Другой','Другой хозяин',now() - interval '1 day')", [otherPet, sender]);
    await f.service.notifyTelegramChatMessage(sender, dialog);
    assert.equal(f.calls.at(-1)[1].text, '✉️ Вам пришло новое сообщение!\nОт: <b>Анна</b>\nПитомец: <b>Луна</b>', 'linked pet wins over older pet');
    await client.query('UPDATE dialogs SET client_low=$1, client_high=$2, low_pet_id=NULL, high_pet_id=$3', [recipient, sender, pet]);
    await f.service.notifyTelegramChatMessage(sender, dialog);
    assert.equal(f.calls.at(-1)[1].text, '✉️ Вам пришло новое сообщение!\nОт: <b>Анна</b>\nПитомец: <b>Луна</b>', 'linked pet on either side');
    const beforeStranger = f.calls.length;
    await f.service.notifyTelegramChatMessage(randomUUID(), dialog);
    assert.equal(f.calls.length, beforeStranger, 'outsider cannot trigger a notification');
    f.calls.splice(1);
    await client.query('UPDATE telegram_complex_subscriptions SET active = false');
    await f.service.notifyTelegramChatMessage(sender, dialog);
    assert.equal(f.calls.length, 2, 'message consent survives unsubscribing all walks');
    await client.query('UPDATE telegram_complex_subscriptions SET active = true');
    await client.query("INSERT INTO telegram_chat_settings VALUES ($1,'123',false)", [sender]);
    await f.service.notifyTelegramChatMessage(sender, dialog);
    assert.equal(f.calls.length, 2, 'never notify the sender in the same Telegram account');
    await client.query('DELETE FROM telegram_chat_settings WHERE client_id = $1', [sender]);
    await client.query('UPDATE telegram_chat_settings SET enabled = false WHERE client_id = $1', [recipient]);
    await f.service.notifyTelegramChatMessage(sender, dialog);
    assert.equal(f.calls.length, 2, 'opt-out stops delivery');
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await client.end();
  }
});

test('message API notifies only after a new committed message, never a retry or failed send', async () => {
  const exports = {};
  const sent = [];
  let duplicate = false;
  let failed = false;
  const source = readFileSync(new URL('../app/api/dialogs/[id]/messages/route.ts', import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, Response, require(name) {
      if (name.endsWith('/telegram-chat')) return { notifyTelegramChatMessage: async (...args) => { sent.push(args); } };
      if (name.endsWith('/session')) return { privateJson: Response.json };
      if (name.endsWith('/domain/chat')) return { chatText: value => value };
      if (name.endsWith('/infrastructure/chat-repository')) return { sendMessage: async () => {
        if (failed) throw new Error('not committed');
        return { duplicate };
      } };
      if (name.endsWith('/transport/chat')) return { chatId: value => value, chatRequest: (_request, operation) => operation('sender') };
      if (name.endsWith('/request-json')) return { readJsonRecord: async () => ({ text: 'PRIVATE MESSAGE CONTENT', requestId: 'request' }) };
      throw new Error(name);
    }
  });
  const context = { params: Promise.resolve({ id: 'dialog' }) };
  assert.equal((await exports.POST({}, context)).status, 201);
  duplicate = true;
  assert.equal((await exports.POST({}, context)).status, 200);
  failed = true;
  await assert.rejects(() => exports.POST({}, context), /not committed/);
  assert.equal(sent.length, 1);
  assert.deepEqual(Array.from(sent[0]), ['sender', 'dialog']);
});
