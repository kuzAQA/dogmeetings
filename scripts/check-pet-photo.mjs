import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { AVIF_TYPE, encodeAvif, encodePetPhotoFile, PetPhotoError } from "../server/pet-photo.mjs";
import { spawnSync } from "node:child_process";
import { migratePetPhotos } from "./migrate-pet-photos.mjs";

const width = 128;
const height = 128;
const sourcePixels = Buffer.alloc(width * height * 4);
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 4;
    sourcePixels[offset] = Math.round((x * 255) / (width - 1));
    sourcePixels[offset + 1] = Math.round((y * 255) / (height - 1));
    sourcePixels[offset + 2] = Math.round(((x + y) * 255) / (width + height - 2));
    sourcePixels[offset + 3] = x < 32 ? 0 : x < 64 ? 85 : x < 96 ? 170 : 255;
  }
}
const source = await sharp(sourcePixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
const encoded = await encodeAvif(source);
const encodedMetadata = await sharp(encoded).metadata();
const decodedSource = await sharp(source).ensureAlpha().raw().toBuffer();
const decodedAvif = await sharp(encoded).ensureAlpha().raw().toBuffer();
assert.equal(encodedMetadata.format, "heif");
assert.equal(encodedMetadata.width, width);
assert.equal(encodedMetadata.height, height);
assert.equal(encodedMetadata.hasAlpha, true);
assert.equal(AVIF_TYPE, "image/avif");
assert.equal(encodedMetadata.compression, "av1");
let squaredError = 0;
let comparedChannels = 0;
for (let i = 0; i < decodedAvif.length; i += 4) {
  if (decodedSource[i + 3] === 0) continue;
  for (let channel = 0; channel < 3; channel += 1) {
    const delta = decodedAvif[i + channel] - decodedSource[i + channel];
    squaredError += delta * delta;
    comparedChannels += 1;
  }
}
const mse = squaredError / comparedChannels;
const psnr = 10 * Math.log10((255 * 255) / mse);
assert.ok(psnr >= 30, `Expected usable lossy quality, got ${psnr.toFixed(2)} dB`);
const alphaAt = (x) => decodedAvif[(64 * width + x) * 4 + 3];
assert.deepEqual([16, 48, 80, 112].map(alphaAt), [0, 85, 170, 255]);

const phonePhoto = await sharp(await readFile(new URL("../public/dog-bonya.webp", import.meta.url)))
  .resize(4032, 3024, { fit: "fill" })
  .jpeg({ quality: 90 })
  .toBuffer();
const phoneStarted = performance.now();
const phoneEncoded = await encodeAvif(phonePhoto);
const phoneElapsed = performance.now() - phoneStarted;
assert.ok(phoneElapsed < 60_000, `Phone photo conversion took ${Math.round(phoneElapsed)} ms`);
const phoneMetadata = await sharp(phoneEncoded).metadata();
assert.equal(phoneMetadata.width, 4032);
assert.equal(phoneMetadata.height, 3024);
console.log(`12 MP JPEG: ${phonePhoto.length} -> ${phoneEncoded.length} bytes in ${Math.round(phoneElapsed)} ms.`);

// Orientation and private metadata must not survive the conversion.
const oriented = await sharp(source).resize(96, 64).removeAlpha().jpeg()
  .withMetadata({ orientation: 6 })
  .withExifMerge({ IFD0: { Artist: "private" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "55/1 45/1 0/1" } })
  .toBuffer();
assert.ok((await sharp(oriented).metadata()).exif);
const orientedResult = await encodeAvif(oriented);
const clean = await sharp(orientedResult).metadata();
assert.equal(clean.orientation, undefined);
assert.equal(clean.exif, undefined);
assert.equal(clean.xmp, undefined);
assert.equal(clean.icc, undefined);
assert.equal(clean.width, 64);
assert.equal(clean.height, 96);
const expectedPixels = await sharp(oriented).rotate().raw().toBuffer();
const actualPixels = await sharp(orientedResult).raw().toBuffer();
const pixelMse = actualPixels.reduce((sum, value, index) => sum + (value - expectedPixels[index]) ** 2, 0) / actualPixels.length;
assert.ok(pixelMse < 100, `Orientation pixel MSE: ${pixelMse}`);

for (const format of ["jpeg", "png", "webp"]) {
  const input = await sharp(source)[format]().toBuffer();
  // Name and MIME are deliberately misleading: decode the actual bytes.
  const output = await encodePetPhotoFile(new File([input], "untrusted.txt", { type: "text/plain" }));
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.compression, "av1");
  assert.equal((await sharp(output).raw().toBuffer()).length > 0, true);
}
for (const invalid of [Buffer.alloc(0), Buffer.from("corrupt"), Buffer.from('<svg width="1" height="1"></svg>')]) {
  await assert.rejects(encodeAvif(invalid), PetPhotoError);
}
await assert.rejects(encodePetPhotoFile({ size: 20 * 1024 * 1024 + 1 }), /20 МБ/);
await assert.rejects(encodePetPhotoFile({ size: 1, arrayBuffer() { throw new Error("read failed"); } }), /прочитать/);
await assert.rejects(encodeAvif(source, { maxInputBytes: 1 }), /20 МБ/);
await assert.rejects(encodeAvif(source, { maxOutputBytes: 1 }), /1 МБ/);
const oversizedPixels = await sharp({ create: { width: 5000, height: 4001, channels: 3, background: "white" } }).png().toBuffer();
await assert.rejects(encodeAvif(oversizedPixels), PetPhotoError);
const frames = Buffer.alloc(8 * 16 * 3);
frames.fill(255, 8 * 8 * 3);
const animated = await sharp(frames, { raw: { width: 8, height: 16, channels: 3, pageHeight: 8 } })
  .webp({ loop: 0, delay: [100, 100] }).toBuffer();
assert.equal((await sharp(animated).metadata()).pages, 2);
await assert.rejects(encodeAvif(animated), /Анимированные/);
const previousQuality = process.env.IMAGE_AVIF_QUALITY;
try {
  delete process.env.IMAGE_AVIF_QUALITY;
  const defaultOutput = await encodeAvif(source);
  process.env.IMAGE_AVIF_QUALITY = "40";
  assert.deepEqual(await encodeAvif(source), defaultOutput);
  process.env.IMAGE_AVIF_QUALITY = "1";
  const low = await encodeAvif(source);
  process.env.IMAGE_AVIF_QUALITY = "100";
  assert.notDeepEqual(await encodeAvif(source), low);
  for (const value of ["", "0", "101", "40.5", "oops", " 40", "1e2"]) {
    process.env.IMAGE_AVIF_QUALITY = value;
    await assert.rejects(encodeAvif(source), (error) => error.status === 500 && /IMAGE_AVIF_QUALITY/.test(error.message));
  }
} finally {
  if (previousQuality === undefined) delete process.env.IMAGE_AVIF_QUALITY;
  else process.env.IMAGE_AVIF_QUALITY = previousQuality;
}
const missingEncoder = spawnSync(process.execPath, ["--input-type=module", "-e", `
  import assert from 'node:assert/strict';
  import { registerHooks } from 'node:module';
  registerHooks({ resolve(specifier, context, next) {
    if (specifier === 'sharp') return { url: 'data:text/javascript,export default function sharp(){throw new Error("AV1 unavailable")}', shortCircuit: true };
    return next(specifier, context);
  }});
  const { encodeAvif } = await import('./server/pet-photo.mjs');
  await assert.rejects(encodeAvif(Buffer.from('input')), error => error.status === 500 && /AVIF encoder/.test(error.message));
`], { encoding: "utf8", env: { ...process.env, IMAGE_AVIF_QUALITY: "40" } });
assert.equal(missingEncoder.status, 0, missingEncoder.stderr);

class FakeClient {
  rows = new Map([
    ["00000000-0000-4000-8000-000000000001", { photo: source, photo_type: "image/png", updated_at: new Date(0) }],
    ["00000000-0000-4000-8000-000000000002", { photo: encoded, photo_type: "image/avif", updated_at: new Date(0) }]
  ]);
  snapshot;

  async query(sql, values = []) {
    if (sql === "BEGIN") this.snapshot = [...this.rows].map(([id, row]) => [id, { ...row, photo: Buffer.from(row.photo) }]);
    if (sql === "ROLLBACK") this.rows = new Map(this.snapshot);
    if (sql === "COMMIT" || sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
    if (sql.includes("SELECT id FROM public.pets")) {
      const [cursor, limit, avifType] = values;
      const rows = [...this.rows]
        .filter(([id, row]) => row.photo && row.photo_type !== avifType && (!cursor || id > cursor))
        .map(([id]) => ({ id }))
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, limit);
      return { rows };
    }
    if (sql.startsWith("SELECT photo, photo_type")) {
      const row = this.rows.get(values[0]);
      return { rows: row ? [{ photo: row.photo, photo_type: row.photo_type }] : [] };
    }
    if (sql.includes("UPDATE public.pets SET photo")) {
      const [id, photo, photoType] = values;
      this.rows.set(id, { photo, photo_type: photoType, updated_at: new Date() });
      return { rowCount: 1, rows: [] };
    }
    throw new Error(`Unexpected query: ${sql}`);
  }
}

const client = new FakeClient();
let failOnce = true;
const failures = [];
const first = await migratePetPhotos(client, {
  encode: async (buffer) => {
    if (failOnce) {
      failOnce = false;
      throw new Error("simulated conversion failure");
    }
    return encodeAvif(buffer);
  },
  write: (message) => failures.push(message)
});
const originalRow = client.rows.get("00000000-0000-4000-8000-000000000001");
assert.equal(first.processed, 0);
assert.equal(first.errors, 1);
assert.equal(originalRow.photo_type, "image/png");
assert.deepEqual(originalRow.photo, source);

const second = await migratePetPhotos(client, { write: () => {} });
const migratedRow = client.rows.get("00000000-0000-4000-8000-000000000001");
const updatedAt = migratedRow.updated_at;
assert.equal(second.processed, 1);
assert.equal(migratedRow.photo_type, "image/avif");
assert.equal((await migratePetPhotos(client, { write: () => {} })).processed, 0);
assert.equal(migratedRow.updated_at, updatedAt);
assert.ok(failures.some((message) => message.includes("simulated conversion failure")));

console.log("Pet photo AVIF compression and migration retry checks passed.");
