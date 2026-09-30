import assert from "node:assert/strict";
import sharp from "sharp";
import { encodeAvif } from "../server/pet-photo.mjs";
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
assert.ok(encoded.length < source.length, "AVIF should reduce this PNG fixture");
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
assert.ok(psnr >= 40, `Expected high visual quality, got ${psnr.toFixed(2)} dB`);
const alphaAt = (x) => decodedAvif[(64 * width + x) * 4 + 3];
assert.deepEqual([16, 48, 80, 112].map(alphaAt), [0, 85, 170, 255]);

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
