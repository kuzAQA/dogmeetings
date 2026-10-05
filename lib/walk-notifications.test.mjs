import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { telegramWalkChangeMessage } from './telegram.ts';

function load(file, imports = {}) {
  const exports = {};
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(js, { exports, require: (name) => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  }, Response, URL, Date, crypto, console });
  return exports;
}
const domain = load('../server/domain/walk.ts');
const { parseWalkMutation } = load('../server/application/walk-input.ts', { '../domain/walk': domain });
const payload = { petId: '00000000-0000-4000-8000-000000000001', walkId: '10000000-0000-4000-8000-000000000001', place: 'Парк', comment: '', scheduleType: 'tomorrow', walkTime: '18:00' };
const tables = Object.fromEntries(['pets', 'walks', 'telegramComplexSubscriptions', 'telegramWalkNotifications'].map(name => [name, new Proxy({ name }, { get: (target, key) => target[key] ?? `${name}.${String(key)}` })]));

function fixture({ notifyTelegram = true, fail = '', unchanged = false } = {}) {
  let saved = { ...payload, id: payload.walkId, notifyTelegram, residentialComplex: 'ЖК', city: 'Москва', district: 'Район', placeId: 'place', updatedAt: new Date(), walkDate: domain.moscowDate(1), place: unchanged ? 'Парк' : 'Старый парк' };
  let pending = [];
  const sent = [];
  let committed = false;
  const pet = { id: payload.petId, name: 'Луна', breed: 'Корги', ownerName: 'Анна', updatedAt: new Date() };
  const builder = (kind, initialTable, selection, state) => {
    let table = initialTable, values;
    const chain = {
      from(value) { table = value; return chain; }, innerJoin() { return chain; }, where() { return chain; }, for() { return chain; }, limit() { return chain; },
      values(value) { values = value; return chain; }, set(value) { values = value; return chain; }, onConflictDoNothing() { return chain; }, returning() { return chain; },
      then(resolve, reject) { return Promise.resolve().then(() => {
        if (kind === 'select') return table === tables.walks ? [{ ...state.saved, petName: pet.name, ownerName: pet.ownerName }] : [selection?.chatId ? { chatId: '123' } : { id: 'subscription' }];
        if (kind === 'delete') { state.pending = []; return []; }
        if (table === tables.telegramWalkNotifications) { state.pending.push(...values); return []; }
        if (fail === 'write') throw new Error('write failed');
        state.saved = { ...state.saved, ...Object.fromEntries(Object.entries(values).filter(([,value]) => value !== undefined)) };
        return [state.saved];
      }).then(resolve, reject); }
    };
    return chain;
  };
  const dbFor = state => ({ select: selection => builder('select', null, selection, state), insert: table => builder('insert', table, null, state), update: table => builder('update', table, null, state), delete: table => builder('delete', table, null, state) });
  const db = { ...dbFor({ saved, pending }), async transaction(callback) {
    const state = { saved: { ...saved }, pending: [...pending] };
    const result = await callback(dbFor(state));
    if (fail === 'commit') throw new Error('commit failed');
    saved = state.saved; pending = state.pending; committed = true;
    return result;
  } };
  const route = load('../app/api/walks/route.ts', {
    'drizzle-orm': { and: (...args) => args, eq: (...args) => args, isNull: value => value },
    '../../../db': { withDb: callback => callback(db) }, '../../../db/schema': tables,
    '../../../lib/database-error': { databaseErrorMessage: () => 'save failed' },
    '../../../lib/session': { isSameOriginRequest: () => true, getClientSession: async () => ({ clientId: 'client' }), privateJson: Response.json },
    '../../../lib/telegram': { telegramWalkChangeMessage, telegramBotRequest: async (method, body) => { assert.equal(committed, true); sent.push({ method, body }); } },
    '../../../server/application/walk-input': { parseWalkMutation },
    '../../../server/domain/location': { getSavedLocation: () => ({ city: 'Москва', district: 'Район', complex: 'ЖК' }) },
    '../../../server/infrastructure/walk-repository': { findWalkPetForClient: async () => fail === 'missing' ? null : pet, findOrCreateSharedPlace: async () => ({ id: 'place', name: 'Парк' }), listWalksForOwner: async () => [{ ...saved, petId: pet.id, petName: pet.name, petBreed: pet.breed, ownerName: pet.ownerName, petUpdatedAt: pet.updatedAt }], listWalksForLocation: async () => [] },
    '../../../server/domain/walk': domain, '../../../server/domain/pet': { petPhotoUrl: () => '/photo' },
    '../../../server/transport/request-json': { readJsonRecord: request => request.json() }
  });
  return { route, sent, get pending() { return pending; }, get saved() { return saved; }, addPending() { pending.push({ id: 'pending' }); } };
}
const request = (method, body) => new Request('http://localhost/api/walks', { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });

for (const method of ['POST', 'PATCH']) {
  for (const notifyTelegram of [true, false]) {
    test(`${method} persists ${notifyTelegram}, gates notification and restores GET`, async () => {
      const f = fixture();
      if (method === 'PATCH') f.addPending();
      const response = await f.route[method](request(method, { ...payload, notifyTelegram }));
      assert.equal(response.status, method === 'POST' ? 201 : 200);
      assert.equal((await response.json()).walk.notifyTelegram, notifyTelegram);
      assert.equal(f.saved.notifyTelegram, notifyTelegram);
      assert.equal(f.pending.length, method === 'POST' && notifyTelegram ? 1 : 0);
      assert.equal(f.sent.length, method === 'PATCH' && notifyTelegram ? 1 : 0);
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
test('explicit true sends once even for unchanged edit; legacy unchanged edit stays silent', async () => {
  for (const value of [true, undefined]) {
    const f = fixture({ unchanged: true });
    f.addPending();
    await f.route.PATCH(request('PATCH', { ...payload, notifyTelegram: value }));
    assert.equal(f.sent.length, value === true ? 1 : 0);
    assert.equal(f.pending.length, value === true ? 0 : 1);
  }
});
test('queue worker checks persisted preference and locks walk before mocked Telegram send', async () => {
  const source = readFileSync(new URL('../scripts/cleanup-expired-walks.mjs', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('async function retryWalkTelegramNotifications()'), source.indexOf('async function pollTelegramCallbacks()'));
  for (const enabled of [true, false]) {
    let delivered = false, sends = 0;
    class Client {
      async connect() {} async end() {}
      async query(sql, params) {
        if (sql.includes('SELECT')) {
          assert.match(sql, /AND walk\.notify_telegram = true/);
          assert.match(sql, /notification\.created_at >= \$1/);
          assert.equal(params[0].toISOString(), '2026-10-03T21:00:00.000Z');
          assert.match(sql, /FOR UPDATE OF notification, subscription, walk SKIP LOCKED/);
          return { rows: enabled && !delivered ? [{ notification_id: 'notification', telegram_chat_id: '123' }] : [] };
        }
        if (sql.includes('sent_at = CURRENT_TIMESTAMP')) delivered = true;
        return { rows: [] };
      }
    }
    const retry = runInNewContext(body + '\nretryWalkTelegramNotifications', { Client, telegramTokenConfiguration: () => ({ token: 'fake' }), telegramRetentionBoundary: () => new Date('2026-10-04T00:00:00+03:00'), connectionString: () => 'mock', telegramBotRequest: async () => { sends++; }, walkNotificationMessage: () => 'card', console });
    await retry(); await retry();
    assert.equal(sends, enabled ? 1 : 0);
  }
});
