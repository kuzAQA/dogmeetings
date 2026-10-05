import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { getTableName } from "drizzle-orm";
import sharp from "sharp";

// Run the actual handlers and auth checks with an isolated storage adapter.
// No connection to the configured application database is made.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && context.parentURL) {
      const base = new URL(specifier, context.parentURL);
      if (base.href === new URL("../db", import.meta.url).href) {
        return { url: "data:text/javascript,export const withDb = operation => operation(globalThis.__photoTestDb)", shortCircuit: true };
      }
      for (const suffix of [".ts", "/index.ts"]) {
        const url = new URL(specifier + suffix, context.parentURL);
        if (existsSync(fileURLToPath(url))) return nextResolve(url.href, context);
      }
    }
    return nextResolve(specifier, context);
  }
});

test("photo uploads through user/admin handlers and photo response", async (t) => {
  const clientId = "00000000-0000-4000-8000-000000000001";
  const rows = new Map();
  let failStorage = false;
  const previousQuality = process.env.IMAGE_AVIF_QUALITY;
  const previousSecret = process.env.ADMIN_SESSION_SECRET;
  process.env.IMAGE_AVIF_QUALITY = "40";
  process.env.ADMIN_SESSION_SECRET = "photo-test-secret-only-00000000000000";
  const session = {
    clientId, tokenHash: "a".repeat(64), hasLocation: false,
    expiresAt: new Date(Date.now() + 60_000)
  };
  globalThis.__photoTestDb = {
    select() {
      let table;
      const query = {
        from(value) { table = getTableName(value); return query; },
        where() { return query; },
        limit() {
          if (table === "client_sessions") return [session];
          if (table === "admin_sessions") return [{ nonce: "b".repeat(24) }];
          if (table === "pets") return [...rows.values()];
          return [];
        }
      };
      return query;
    },
    insert() {
      return { values(value) {
        return { returning() {
          if (failStorage) throw new Error("simulated storage failure");
          const pet = { ...value, createdAt: new Date(), updatedAt: new Date() };
          rows.set(pet.id, pet);
          return [pet];
        } };
      } };
    },
    update() {
      return { set(value) {
        return { where() {
          return { returning() {
            if (failStorage) throw new Error("simulated storage failure");
            const pet = { ...rows.values().next().value, ...value };
            rows.set(pet.id, pet);
            return [pet];
          } };
        } };
      } };
    }
  };
  try {
    const { POST, PATCH } = await import("../app/api/pets/route.ts");
    const { PATCH: adminPatch } = await import("../app/api/dogsfather/pets/route.ts");
    const { GET: photoGet } = await import("../app/api/pet-photo/route.ts");
    const request = (method, photo, admin = false, cookie = "dogmeet_session=" + "a".repeat(64)) => {
      const form = new FormData();
      form.set("petName", "Боня");
      form.set("ownerName", "Анна");
      form.set("breed", "Корги");
      if (method === "PATCH") form.set("petId", rows.keys().next().value);
      if (photo) form.set("photo", photo);
      const path = admin ? "dogsfather/pets" : "pets";
      return new Request(`http://localhost:3000/api/${path}`, {
        method, headers: { origin: "http://localhost:3000", cookie }, body: form
      });
    };
    const image = sharp({ create: { width: 96, height: 64, channels: 4, background: { r: 100, g: 160, b: 220, alpha: 0.5 } } });
    for (const format of ["jpeg", "png", "webp"]) {
      await t.test(`${format} is stored and served as AVIF with a safe filename`, async () => {
        rows.clear();
        const source = await image.clone()[format]().toBuffer();
        const response = await POST(request("POST", new File([source], "../../original.jpg", { type: "image/jpeg" })));
        assert.equal(response.status, 201);
        const data = await response.json();
        const stored = rows.get(data.pet.id);
        assert.equal(stored.photoType, "image/avif");
        const decoded = await sharp(stored.photo).raw().toBuffer({ resolveWithObject: true });
        assert.equal(decoded.info.width, 96);
        assert.equal(decoded.info.height, 64);
        assert.equal((await sharp(stored.photo).metadata()).compression, "av1");
        const served = await photoGet(new Request("http://localhost:3000" + data.pet.photoUrl));
        assert.equal(served.status, 200);
        assert.equal(served.headers.get("content-type"), "image/avif");
        assert.equal(served.headers.get("content-length"), String(stored.photo.length));
        assert.equal(served.headers.get("content-disposition"), `inline; filename="${stored.id}.avif"`);
        assert.deepEqual(Buffer.from(await served.arrayBuffer()), stored.photo);
      });
    }
    for (const format of ["jpeg", "png", "webp"]) {
      await t.test(`large ${format} upload preserves dimensions and measures AVIF savings`, async () => {
        rows.clear();
        const pipeline = sharp("public/walk-hero-screen.webp").resize(3800, 3040, { fit: "fill" });
        const options = format === "jpeg" ? { quality: 100, chromaSubsampling: "4:4:4" } : format === "webp" ? { quality: 90 } : {};
        const source = await pipeline[format](options).toBuffer();
        if (format === "png") assert.ok(source.length > 10 * 1024 * 1024 && source.length <= 20 * 1024 * 1024);
        const started = performance.now();
        const response = await POST(request("POST", new File([source], `large.${format}`, { type: `image/${format}` })));
        assert.equal(response.status, 201);
        const data = await response.json();
        const stored = rows.get(data.pet.id);
        assert.equal(stored.photoType, "image/avif");
        const output = await sharp(stored.photo).raw().toBuffer({ resolveWithObject: true });
        assert.equal(output.info.width, 3800);
        assert.equal(output.info.height, 3040);
        const served = await photoGet(new Request("http://localhost:3000" + data.pet.photoUrl));
        assert.equal(served.headers.get("content-type"), "image/avif");
        assert.deepEqual(Buffer.from(await served.arrayBuffer()), stored.photo);
        console.info("PHOTO_UPLOAD_MEASUREMENT", JSON.stringify({
          format, width: 3800, height: 3040, beforeBytes: source.length,
          afterBytes: stored.photo.length, ratio: source.length / stored.photo.length,
          savingsPercent: (1 - stored.photo.length / source.length) * 100,
          durationMs: Math.round(performance.now() - started)
        }));
      });
    }
    await t.test("both update handlers convert photos, preserving storage on failures", async () => {
      const payload = `v1.${Math.floor(Date.now() / 1000) + 60}.${"b".repeat(24)}`;
      const signature = createHmac("sha256", process.env.ADMIN_SESSION_SECRET).update(payload).digest("base64url");
      const adminCookie = `dogmeet_admin_dev=${payload}.${signature}`;
      const input = new File([await image.clone().png().toBuffer()], "pet.png", { type: "image/png" });
      for (const admin of [false, true]) {
        const handler = admin ? adminPatch : PATCH;
        const buildRequest = (file) => request("PATCH", file, admin, admin ? adminCookie : undefined);
        assert.equal((await handler(buildRequest(input))).status, 200);
        const unchangedPhoto = rows.values().next().value.photo;
        assert.equal((await handler(buildRequest(undefined))).status, 200);
        assert.strictEqual(rows.values().next().value.photo, unchangedPhoto, "Editing fields without a new file must preserve the photo bytes");
        const original = rows.values().next().value;
        assert.equal(original.photoType, "image/avif");
        assert.equal((await handler(buildRequest(new File(["broken"], "pet.png")))).status, 400);
        assert.equal((await handler(buildRequest(new File([], "empty.png")))).status, 400);
        assert.strictEqual(rows.values().next().value, original);
        failStorage = true;
        assert.equal((await handler(buildRequest(input))).status, 500);
        assert.strictEqual(rows.values().next().value, original);
        failStorage = false;
      }
    });
    await t.test("invalid uploads/config and failed inserts never publish a photo URL", async () => {
      rows.clear();
      const invalidFiles = [
        new File([], "empty.png"), new File(["broken"], "bad.png"),
        new File(['<svg width="1" height="1"></svg>'], "bad.svg"),
        new File([Buffer.alloc(20 * 1024 * 1024 + 1)], "large.jpg")
      ];
      for (const file of invalidFiles) {
        const response = await POST(request("POST", file));
        assert.equal(response.status, 400);
        assert.equal((await response.json()).pet, undefined);
        assert.equal(rows.size, 0);
      }
      const input = new File([await image.clone().png().toBuffer()], "pet.png");
      process.env.IMAGE_AVIF_QUALITY = "invalid";
      const badConfig = await POST(request("POST", input));
      assert.equal(badConfig.status, 500);
      assert.match((await badConfig.json()).error, /IMAGE_AVIF_QUALITY/);
      process.env.IMAGE_AVIF_QUALITY = "40";
      failStorage = true;
      const failed = await POST(request("POST", input));
      assert.equal(failed.status, 500);
      assert.equal((await failed.json()).pet, undefined);
      assert.equal(rows.size, 0);
      failStorage = false;
      assert.equal((await POST(request("POST", input, false, ""))).status, 401);
    });
  } finally {
    delete globalThis.__photoTestDb;
    if (previousQuality === undefined) delete process.env.IMAGE_AVIF_QUALITY;
    else process.env.IMAGE_AVIF_QUALITY = previousQuality;
    if (previousSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
    else process.env.ADMIN_SESSION_SECRET = previousSecret;
  }
});
