import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

function fixture(location = null, authenticated = true) {
  const calls = [], exports = {};
  const session = { clientId: 'trusted-client' };
  const source = readFileSync(new URL('../app/api/telegram/subscription-link/route.ts', import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, Response, JSON,
    require(name) {
      if (name.endsWith('/session')) return { getClientSession: async () => authenticated ? session : null,
        isSameOriginRequest: request => request.headers.get('origin') === 'https://dogmeet.ru', privateJson: Response.json };
      if (name.endsWith('/telegram-subscriptions')) return {
        telegramSubscriptionPurposes: ['combined', 'messages-check', 'messages-subscribe', 'messages-unsubscribe'],
        createTelegramSubscriptionLink: async (...args) => { calls.push(args); return 'https://t.me/DogmeetBot?start=opaque'; } };
      if (name.endsWith('/location')) return { getSavedLocation: () => location };
      if (name.endsWith('/database-error')) return { databaseErrorMessage: () => 'Ошибка базы' };
      assert.fail(name);
    }
  });
  const post = (body, origin = 'https://dogmeet.ru') => exports.POST(new Request('https://dogmeet.ru/api/telegram/subscription-link', {
    method: 'POST', headers: { origin }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) }));
  return { post, calls };
}

for (const purpose of ['messages-check', 'messages-subscribe', 'messages-unsubscribe']) {
  test(`${purpose} needs no location and ignores untrusted client/chat parameters`, async () => {
    const f = fixture();
    assert.equal((await f.post({ purpose, clientId: 'foreign', chatId: '456' })).status, 200);
    assert.deepEqual(Array.from(f.calls[0]), [null, 'trusted-client', purpose]);
  });
}

test('combined subscription uses only saved location and requires it', async () => {
  const f = fixture(); assert.equal((await f.post()).status, 400); assert.equal(f.calls.length, 0);
  const location = { city: 'Москва', district: 'Район', complex: 'ЖК' };
  const valid = fixture(location); assert.equal((await valid.post()).status, 200);
  assert.equal(valid.calls[0][0], location); assert.equal(valid.calls[0][2], 'combined');
});

test('invalid purpose, malformed JSON, cross-origin and expired session cannot create intents', async () => {
  const f = fixture();
  for (const body of ['{', 'null', '[]', { purpose: 'other' }]) assert.equal((await f.post(body)).status, 400);
  assert.equal((await f.post({ purpose: 'messages-check' }, 'https://other.example')).status, 403);
  assert.equal(f.calls.length, 0);
  assert.equal((await fixture(null, false).post({ purpose: 'messages-check' })).status, 401);
});

test('site settings API exposes no consent-changing PATCH handler', () => {
  const exports = {};
  const source = readFileSync(new URL('../app/api/telegram/notifications/route.ts', import.meta.url), 'utf8');
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, require: () => ({}) });
  assert.equal(typeof exports.GET, 'function'); assert.equal(exports.PATCH, undefined);
});
