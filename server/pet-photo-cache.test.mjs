import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import sharp from "sharp";

// Exercise the real handler without connecting to the application database.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && context.parentURL) {
      if (new URL(specifier, context.parentURL).href === new URL("../db", import.meta.url).href) {
        return { url: "data:text/javascript,export const withDb = operation => operation(globalThis.__photoCacheTestDb)", shortCircuit: true };
      }
      for (const suffix of [".ts", "/index.ts"]) {
        const url = new URL(specifier + suffix, context.parentURL);
        if (existsSync(fileURLToPath(url))) return nextResolve(url.href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

test("photo validators and persistent browser HTTP cache", async (t) => {
  const png = (width) => sharp({ create: { width, height: 8, channels: 3, background: "red" } }).png().toBuffer();
  let pet = { photo: await png(8), photoType: "image/png", updatedAt: new Date(0) };
  let failStorage = false;
  globalThis.__photoCacheTestDb = {
    select() {
      const query = {
        from() { return query; },
        where() { return query; },
        limit() {
          if (failStorage) throw new Error("storage unavailable");
          return pet ? [pet] : [];
        },
      };
      return query;
    },
  };
  const { GET } = await import("../app/api/pet-photo/route.ts");
  const { petPhotoUrl } = await import("./domain/pet.ts");
  hooks.deregister();
  const path = petPhotoUrl("fixture", pet.updatedAt, pet.photoType);
  assert.equal(path, "/api/pet-photo?id=fixture&v=0&cache=2");
  assert.equal(petPhotoUrl("fixture", pet.updatedAt, null), "/dog-placeholder.webp");
  const request = (validator, suffix = "") => new Request(`http://localhost${path}${suffix}`, {
    headers: validator ? { "If-None-Match": validator } : {},
  });
  await t.test("content validators, legacy URLs, redirects and errors", async () => {
    const first = await GET(request());
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("cache-control"), "private, no-cache");
    const etag = first.headers.get("etag");
    assert.ok(etag);
    assert.deepEqual(Buffer.from(await first.arrayBuffer()), pet.photo);
    for (const validator of [etag, `W/${etag}`, `"other", W/${etag}`, "*"]) {
      const cached = await GET(request(validator));
      assert.equal(cached.status, 304);
      assert.equal(cached.headers.get("etag"), etag);
      assert.equal(cached.headers.get("content-length"), null);
      assert.equal((await cached.arrayBuffer()).byteLength, 0);
    }
    pet.updatedAt = new Date(1000);
    assert.equal((await GET(request(etag))).status, 304);
    const legacy = new Request("http://localhost/api/pet-photo?id=fixture&v=0", { headers: { "If-None-Match": etag } });
    assert.equal((await GET(legacy)).status, 304);
    const original = pet;
    pet = { ...pet, photo: await png(16) };
    const replaced = await GET(request(etag));
    assert.equal(replaced.status, 200);
    assert.notEqual(replaced.headers.get("etag"), etag);
    assert.deepEqual(Buffer.from(await replaced.arrayBuffer()), pet.photo);
    pet = { ...original, photo: null };
    const fallback = await GET(request(etag));
    assert.equal(fallback.status, 302);
    assert.equal(fallback.headers.get("cache-control"), "no-store");
    pet = null;
    assert.equal((await GET(request(etag))).status, 404);
    failStorage = true;
    const failed = await GET(request(etag));
    assert.equal(failed.status, 500);
    assert.equal(failed.headers.get("cache-control"), "no-store");
    failStorage = false;
    pet = original;
  });

  const transfers = [];
  const server = createServer(async (req, res) => {
    if (!req.url.startsWith("/api/pet-photo")) {
      res.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
      res.end(`<img id="photo" loading="lazy" src="${path}">`);
      return;
    }
    const response = await GET(new Request(`http://localhost${req.url}`, { headers: req.headers }));
    const body = Buffer.from(await response.arrayBuffer());
    transfers.push({ status: response.status, bytes: body.length, validator: req.headers["if-none-match"] });
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(body);
  });
  const profile = await mkdtemp(join(tmpdir(), "dogmeet-photo-cache-"));
  let context;
  t.after(async () => {
    await context?.close();
    server.closeAllConnections();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    await rm(profile, { recursive: true, force: true });
    delete globalThis.__photoCacheTestDb;
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  const open = async () => {
    context = await chromium.launchPersistentContext(profile, { headless: true });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    await page.locator("#photo").evaluate((image) => image.decode());
    return page;
  };
  const assertCached = (start) => {
    const requests = transfers.slice(start);
    assert.ok(requests.length > 0, "browser must revalidate");
    assert.ok(requests.every((entry) => entry.status === 304 && entry.bytes === 0 && entry.validator));
  };
  await t.test("first load, repeated display and reload", async () => {
    const page = await open();
    assert.equal(transfers[0].status, 200);
    assert.equal(transfers[0].bytes, pet.photo.length);
    let start = transfers.length;
    await page.evaluate(async () => {
      const image = new Image();
      image.src = document.querySelector("#photo").src;
      await image.decode();
    });
    assert.ok(transfers.slice(start).every((entry) => entry.bytes === 0));
    start = transfers.length;
    await page.reload({ waitUntil: "networkidle" });
    assertCached(start);
  });
  await t.test("browser restart reuses disk cache", async () => {
    await context.close();
    const start = transfers.length;
    await open();
    assertCached(start);
  });
  await t.test("replacement at the same URL, with and without updatedAt", async () => {
    const page = context.pages().at(-1);
    for (const width of [16, 24]) {
      pet = { ...pet, photo: await png(width), updatedAt: width === 24 ? new Date(2000) : pet.updatedAt };
      const start = transfers.length;
      await page.reload({ waitUntil: "networkidle" });
      assert.equal(transfers[start].status, 200);
      assert.equal(transfers[start].bytes, pet.photo.length);
      assert.equal(await page.locator("#photo").evaluate((image) => image.naturalWidth), width);
    }
  });
  await t.test("cleared and disabled cache still loads normally", async () => {
    const page = context.pages().at(-1);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    for (const method of ["Network.clearBrowserCache", "Network.setCacheDisabled"]) {
      await cdp.send(method, method === "Network.setCacheDisabled" ? { cacheDisabled: true } : {});
      const start = transfers.length;
      await page.reload({ waitUntil: "networkidle" });
      assert.equal(transfers[start].status, 200);
      assert.equal(await page.locator("#photo").evaluate((image) => image.naturalWidth), 24);
    }
  });
  console.info("PHOTO_CACHE_TRANSFERS", JSON.stringify(transfers));
});
