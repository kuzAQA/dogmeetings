import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { telegramWalkChangeMessage } from './telegram.ts';
import { replaceTelegramWalkNotification } from '../server/telegram-walk-photo.mjs';
import { cleanupDeletedWalkMessages } from '../server/telegram-walk-deletion.mjs';
import sharp from 'sharp';

function load(file, imports = {}) {
  const exports = {};
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(js, { exports, require: (name) => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  }, Response, URL, Date, crypto, console, fetch });
  return exports;
}
const domain = load('../server/domain/walk.ts');
const { parseWalkMutation } = load('../server/application/walk-input.ts', { '../domain/walk': domain });
const payload = { petId: '00000000-0000-4000-8000-000000000001', walkId: '10000000-0000-4000-8000-000000000001', place: 'Парк', comment: '', scheduleType: 'tomorrow', walkTime: '18:00' };
const tables = Object.fromEntries(['pets', 'walks', 'telegramComplexSubscriptions', 'telegramWalkNotifications'].map(name => [name, new Proxy({ name }, { get: (target, key) => target[key] ?? `${name}.${String(key)}` })]));

function fixture({ notifyTelegram = true, fail = '', unchanged = false, photo = null, stale = false, chats = 1 } = {}) {
  let saved = { ...payload, id: payload.walkId, notifyTelegram, residentialComplex: 'ЖК', city: 'Москва', district: 'Район', placeId: 'place', updatedAt: new Date(), walkDate: domain.moscowDate(1), place: unchanged ? 'Парк' : 'Старый парк' };
  let pending = [];
  const sent = [];
  let committed = false;
  let locks = 0;
  const pet = { id: payload.petId, name: 'Луна', breed: 'Корги', ownerName: 'Анна', updatedAt: new Date() };
  const builder = (kind, initialTable, selection, state) => {
    let table = initialTable, values;
    const chain = {
      from(value) { table = value; return chain; }, innerJoin() { return chain; }, where(condition) { if (table === tables.pets) { assert.equal(committed, true); assert.equal(condition[1], saved.petId); } return chain; }, for() { locks++; return chain; }, limit() { return chain; },
      values(value) { values = value; return chain; }, set(value) { values = value; return chain; }, onConflictDoNothing() { return chain; }, onConflictDoUpdate(options) { assert.equal(options.set.id, 'excluded.id'); return chain; }, returning() { return chain; },
      then(resolve, reject) { return Promise.resolve().then(() => {
        if (kind === 'select' && table === tables.pets) return [{ photo }];
        if (kind === 'select') return table === tables.walks ? [{ ...state.saved, ...(stale && committed ? { updatedAt: new Date(0) } : {}), petName: pet.name, ownerName: pet.ownerName }] : Array.from({ length: chats }, (_, index) => selection?.chatId ? { chatId: String(123 + index) } : { id: `subscription-${index}` });
        if (kind === 'delete') { if (table === tables.walks) { if (fail === 'write') throw new Error('delete failed'); return [{ id: state.saved.id }]; } state.pending = []; return []; }
        if (table === tables.telegramWalkNotifications) { state.pending.push(...values); return []; }
        if (fail === 'write') throw new Error('write failed');
        state.saved = { ...state.saved, ...Object.fromEntries(Object.entries(values).filter(([,value]) => value !== undefined)) };
        return [state.saved];
      }).then(resolve, reject); }
    };
    return chain;
  };
  const dbFor = state => ({ select: selection => builder('select', null, selection, state), insert: table => builder('insert', table, null, state), update: table => builder('update', table, null, state), delete: table => builder('delete', table, null, state) });
  const db = { $client: { query: async () => ({ rows: [] }) }, ...dbFor({ saved, pending }), async transaction(callback) {
    const state = { saved: { ...saved }, pending: [...pending] };
    const result = await callback(dbFor(state));
    if (fail === 'commit') throw new Error('commit failed');
    saved = state.saved; pending = state.pending; committed = true;
    return result;
  } };
  const route = load('../app/api/walks/route.ts', {
    'drizzle-orm': { and: (...args) => args, eq: (...args) => args, isNull: value => value, sql: strings => strings.join('') },
    '../../../db': { withDb: callback => callback(db) }, '../../../db/schema': tables,
    '../../../lib/database-error': { databaseErrorMessage: () => 'save failed' },
    '../../../lib/session': { isSameOriginRequest: () => true, getClientSession: async () => ({ clientId: 'client' }), privateJson: Response.json },
    '../../../lib/telegram': { telegramWalkChangeMessage, telegramBotRequest: async (method, body) => { assert.equal(committed, true); assert.ok(locks >= 2, 'edit delivery holds the walk lock'); sent.push({ method, body }); return method === 'sendPhoto' && fail === 'photo' ? false : { message_id: sent.length, date: Math.floor(Date.now() / 1000), chat: { id: 123 } }; } },
    '../../../server/telegram-walk-photo.mjs': { replaceTelegramWalkNotification },
    '../../../server/application/walk-input': { parseWalkMutation },
    '../../../server/domain/location': { getSavedLocation: () => ({ city: 'Москва', district: 'Район', complex: 'ЖК' }) },
    '../../../server/infrastructure/walk-repository': { findWalkPetForClient: async (_tx, petId) => fail === 'missing' ? null : { ...pet, id: petId }, findOrCreateSharedPlace: async (_tx, _location, _name, _normalizedName, clientId) => { assert.equal(clientId, 'client'); return { id: 'place', name: 'Парк' }; }, listWalksForOwner: async () => [{ ...saved, petId: pet.id, petName: pet.name, petBreed: pet.breed, ownerName: pet.ownerName, petUpdatedAt: pet.updatedAt }], listWalksForLocation: async () => [] },
    '../../../server/domain/walk': domain, '../../../server/domain/pet': { petPhotoUrl: () => '/photo' },
    '../../../server/transport/request-json': { readJsonRecord: request => request.json(), readJsonString: (record, key) => record?.[key] ?? '' }
  });
  return { route, sent, get pending() { return pending; }, get saved() { return saved; }, addPending() { pending.push({ id: 'pending' }); } };
}
const request = (method, body) => new Request('http://localhost/api/walks', { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });

test('PATCH checks saved schedule before edits and leaves expired walk and queue unchanged', async () => {
  const f = fixture();
  Object.assign(f.saved, { walkDate: '2026-01-01', walkTime: '11:59' });
  f.addPending();
  const previous = { ...f.saved };
  const pending = [...f.pending];
  const response = await f.route.PATCH(request('PATCH', { ...payload, scheduleType: 'tomorrow', walkTime: '18:00' }));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, domain.WALK_EDIT_EXPIRED_MESSAGE);
  assert.deepEqual(f.saved, previous);
  assert.deepEqual(f.pending, pending);
  assert.deepEqual(f.sent, []);
});

test('PATCH allows a future morning walk regardless of today cutoff', async () => {
  const f = fixture();
  Object.assign(f.saved, { walkDate: domain.moscowDate(1), walkTime: '11:59' });
  const response = await f.route.PATCH(request('PATCH', payload));
  assert.equal(response.status, 200);
  assert.equal(f.saved.walkTime, payload.walkTime);
});

for (const method of ['POST', 'PATCH']) {
  test(`${method} takes the place creator from the session, ignoring a submitted owner`, async () => {
    const f = fixture();
    const response = await f.route[method](request(method, { ...payload, clientId: 'attacker', createdBy: 'attacker' }));
    assert.equal(response.status, method === 'POST' ? 201 : 200);
  });
  for (const notifyTelegram of [true, false]) {
    test(`${method} persists ${notifyTelegram}, gates notification and restores GET`, async () => {
      const f = fixture();
      if (method === 'PATCH') f.addPending();
      const response = await f.route[method](request(method, { ...payload, notifyTelegram }));
      assert.equal(response.status, method === 'POST' ? 201 : 200);
      assert.equal((await response.json()).walk.notifyTelegram, notifyTelegram);
      assert.equal(f.saved.notifyTelegram, notifyTelegram);
      assert.equal(f.pending.length, notifyTelegram ? 1 : 0);
      assert.equal(f.sent.length, 0);
      const restored = await f.route.GET(new Request('http://localhost/api/walks?scope=mine'));
      assert.equal((await restored.json()).walks[0].notifyTelegram, notifyTelegram);
    });
  }
  for (const fail of ['write', 'commit', 'missing', 'invalid']) {
    test(`${method} ${fail} failure never sends or queues`, async () => {
      const f = fixture({ fail });
      const response = await f.route[method](request(method, { ...payload, notifyTelegram: true, ...(fail === 'invalid' ? { walkTime: 'bad' } : {}) }));
      assert.ok(response.status >= 400);
      assert.equal(f.sent.length, 0);
      assert.equal(f.pending.length, 0);
    });
  }
}
test('omitted setting defaults for create and preserves false for edit; non-booleans rejected', async () => {
  const create = fixture();
  assert.equal((await (await create.route.POST(request('POST', payload))).json()).walk.notifyTelegram, true);
  const edit = fixture({ notifyTelegram: false });
  assert.equal((await (await edit.route.PATCH(request('PATCH', payload))).json()).walk.notifyTelegram, false);
  assert.equal(edit.sent.length, 0);
  for (const value of ['false', 0, null, {}]) assert.equal(parseWalkMutation({ ...payload, notifyTelegram: value }, 'create').ok, false);
});
test('explicit true queues an unchanged edit; legacy unchanged edit preserves pending creation', async () => {
  for (const value of [true, undefined]) {
    const f = fixture({ unchanged: true });
    f.addPending();
    await f.route.PATCH(request('PATCH', { ...payload, notifyTelegram: value }));
    assert.equal(f.sent.length, 0);
    assert.equal(f.pending.length, 1);
    if (value === true) assert.match(f.pending[0].messageText, /Прогулка изменена/);
  }
});
test('edit queues the saved pet and card without contacting Telegram', async () => {
  for (const petId of [payload.petId, '00000000-0000-4000-8000-000000000002']) {
    const f = fixture();
    const response = await f.route.PATCH(request('PATCH', { ...payload, petId }));
    assert.equal(response.status, 200);
    assert.equal(f.saved.petId, petId);
    assert.equal(f.sent.length, 0);
    assert.match(f.pending[0].messageText, /Прогулка изменена/);
  }
});

test('rapid edits keep only the latest queued card', async () => {
  const f = fixture();
  for (const walkTime of ['18:00', '19:00', '20:00']) {
    assert.equal((await f.route.PATCH(request('PATCH', { ...payload, walkTime }))).status, 200);
  }
  assert.equal(f.sent.length, 0);
  assert.equal(f.pending.length, 1);
  assert.match(f.pending[0].messageText, /20:00/);
});

test('queue worker commits the claim before Telegram and preserves latest pending edits', async () => {
  const source = readFileSync(new URL('../scripts/cleanup-expired-walks.mjs', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('async function retryWalkTelegramNotifications()'), source.indexOf('async function pollTelegramCallbacks()'));
  const photo = await sharp({ create: { width: 20, height: 30, channels: 3, background: 'green' } }).avif().toBuffer();
  for (const enabled of [true, false]) {
    let delivered = false, sends = 0, claimed = false;
    class Client {
      async connect() {} async end() {}
      async query(sql, params) {
        if (sql === 'COMMIT') claimed = true;
        if (sql.includes('SELECT') && sql.includes('notification.id')) {
          assert.match(sql, /pet\.photo AS pet_photo/);
          assert.match(sql, /AND walk\.notify_telegram = true/);
          assert.match(sql, /notification\.created_at >= \$1/);
          assert.equal(params[0].toISOString(), '2026-10-03T21:00:00.000Z');
          assert.match(sql, /FOR UPDATE OF notification, subscription, walk SKIP LOCKED/);
          return { rows: enabled && !delivered ? [{ notification_id: 'notification', telegram_chat_id: '123', walk_id: payload.walkId, pet_photo: photo, message_text: 'queued edit' }] : [] };
        }
        if (sql.includes('sent_at = CURRENT_TIMESTAMP')) delivered = true;
        return { rows: [] };
      }
    }
    const retry = runInNewContext(body + '\nretryWalkTelegramNotifications', { Client, telegramTokenConfiguration: () => ({ token: 'fake' }), telegramRetentionBoundary: () => new Date('2026-10-04T00:00:00+03:00'), connectionString: () => 'mock', replaceTelegramWalkNotification, cleanupDeletedWalkMessages, telegramBotRequest: async (_token, method, form) => { assert.equal(claimed, true); assert.equal(method, 'sendPhoto'); assert.equal(form.get('caption'), 'queued edit'); sends++; return { message_id: sends, date: Math.floor(Date.now() / 1000), chat: { id: 123 } }; }, walkNotificationMessage: () => 'card', console });
    await retry(); await retry();
    assert.equal(sends, enabled ? 1 : 0);
  }
});





test('DELETE responds from the database without any Telegram request', async () => {
  for (const fail of ['', 'write']) {
    const f = fixture({ fail });
    const response = await f.route.DELETE(request('DELETE', { walkId: payload.walkId }));
    assert.equal(response.status, fail ? 500 : 200);
    if (!fail) assert.equal((await response.json()).deleted, true);
    assert.equal(f.sent.length, 0);
  }
});

test('an edit during Telegram I/O remains queued and is delivered after the old job', async () => {
  const source = readFileSync(new URL('../scripts/cleanup-expired-walks.mjs', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('async function retryWalkTelegramNotifications()'), source.indexOf('async function pollTelegramCallbacks()'));
  let currentId = 'old', delivered = false, rowLocked = false;
  const sent = [];
  class Client {
    async connect() {}
    async end() {}
    async query(sql, params) {
      if (sql === 'COMMIT' || sql === 'ROLLBACK') rowLocked = false;
      if (sql.includes('notification.id')) {
        rowLocked = true;
        return { rows: delivered ? [] : [{ notification_id: currentId, walk_id: payload.walkId,
          subscription_id: 'subscription', telegram_chat_id: '123', message_text: currentId, pet_photo: null }] };
      }
      if (sql.includes('sent_at = CURRENT_TIMESTAMP') && params[0] === currentId) delivered = true;
      return { rows: [] };
    }
  }
  const retry = runInNewContext(body + '\nretryWalkTelegramNotifications', {
    Client, telegramTokenConfiguration: () => ({ token: 'fake' }), connectionString: () => 'mock',
    telegramRetentionBoundary: () => new Date(), replaceTelegramWalkNotification, cleanupDeletedWalkMessages,
    telegramBotRequest: async (_token, method, body) => {
      assert.equal(rowLocked, false, 'Telegram I/O must not hold the walk/queue lock');
      assert.equal(method, 'sendMessage');
      sent.push(body.text);
      if (currentId === 'old') currentId = 'new'; // A concurrent committed PATCH replaces the queue job ID.
      return { message_id: sent.length, date: Math.floor(Date.now() / 1000), chat: { id: 123 } };
    }, notificationError: String, blockedByTelegram: () => false, console: { info() {}, error: assert.fail }
  });
  await retry();
  assert.deepEqual(sent, ['old', 'new']);
  assert.equal(delivered, true);
});


test('each chat gets a distinct replacement job ID', async () => {
  const f = fixture({ chats: 2 });
  for (const walkTime of ['18:00', '19:00']) {
    assert.equal((await f.route.PATCH(request('PATCH', { ...payload, walkTime }))).status, 200);
    assert.equal(f.pending.length, 2);
    assert.equal(new Set(f.pending.map(job => job.id)).size, 2);
    assert.equal(new Set(f.pending.map(job => job.subscriptionId)).size, 2);
  }
  assert.equal(f.sent.length, 0);
});
