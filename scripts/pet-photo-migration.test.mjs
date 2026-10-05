import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { prepareMigrationPhoto } from '../server/pet-photo-migration.mjs';
import { dryRun, applyManifest, hash } from './migrate-pet-photo-algorithm.mjs';

process.env.IMAGE_AVIF_QUALITY = '40';
const id = '00000000-0000-4000-8000-000000000001';
const png = await sharp({ create: { width: 32, height: 24, channels: 4, background: { r: 10, g: 100, b: 80, alpha: 0.5 } } }).png().toBuffer();
const avif = (await prepareMigrationPhoto(png)).output;

test('migration includes small AVIF, preserves alpha and strips metadata', async () => {
  const { output, source, target } = await prepareMigrationPhoto(avif);
  const metadata = await sharp(output).metadata();
  assert.equal(source.compression, 'av1');
  assert.deepEqual(target, { width: 32, height: 24, hasAlpha: true });
  assert.equal(metadata.exif, undefined);
  const pixels = await sharp(output).raw().toBuffer();
  assert.ok(Math.abs(pixels[3] - 128) <= 1);
});

test('large oriented photo uses 1600 edge and removes EXIF/GPS', async () => {
  const input = await sharp(png).resize(2100, 1400).jpeg().withMetadata({ orientation: 6 })
    .withExifMerge({ IFD0: { Artist: 'private' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '55/1 45/1 0/1' } }).toBuffer();
  const { output, target } = await prepareMigrationPhoto(input);
  assert.equal(target.width, 1067);
  assert.equal(target.height, 1600);
  const metadata = await sharp(output).metadata();
  for (const key of ['exif', 'xmp', 'icc', 'orientation']) assert.equal(metadata[key], undefined);
  const transparent = await sharp(png).resize(1700, 850).png().toBuffer();
  const alpha = await prepareMigrationPhoto(transparent);
  assert.deepEqual(alpha.target, { width: 1600, height: 800, hasAlpha: true });
  assert.ok(Math.abs((await sharp(alpha.output).raw().toBuffer())[3] - 128) <= 1);
});

test('invalid input, animation and excess pixels are rejected', async () => {
  await assert.rejects(prepareMigrationPhoto(Buffer.from('broken')));
  const huge = await sharp({ create: { width: 5000, height: 4001, channels: 3, background: 'white' } }).png().toBuffer();
  await assert.rejects(prepareMigrationPhoto(huge));
  const pixels = Buffer.alloc(8 * 16 * 3);
  pixels.fill(255, 8 * 8 * 3);
  const frames = await sharp(pixels, { raw: { width: 8, height: 16, channels: 3, pageHeight: 8 } }).webp({ loop: 0, delay: [100, 100] }).toBuffer();
  await assert.rejects(prepareMigrationPhoto(frames), /Анимации/);
});

class FakeClient {
  row = { id, photo: avif, photo_type: 'image/avif', updated_at: new Date(0) };
  writes = 0;
  async query(sql, values = []) {
    if (sql === 'BEGIN') this.snapshot = { ...this.row };
    else if (sql === 'ROLLBACK') this.row = this.snapshot;
    else if (sql === 'COMMIT') this.snapshot = null;
    else if (sql.startsWith('SELECT id')) return { rows: !values[0] ? [{ id }] : [] };
    else if (sql.startsWith('SELECT photo')) return { rows: [{ ...this.row }] };
    else if (sql.startsWith('UPDATE')) {
      this.row = { ...this.row, photo: values[1], photo_type: values[2], updated_at: new Date() };
      this.writes++;
    } else throw new Error(`Unexpected SQL: ${sql}`);
    return { rows: [] };
  }
}

test('dry-run writes no DB data; apply resumes and rollback protects subsequent changes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'photo-migration-'));
  const directory = join(root, 'run');
  try {
    const client = new FakeClient();
    // Different valid target bytes make idempotency and rollback checks deterministic.
    const output = await sharp(avif).avif({ quality: 80 }).toBuffer();
    const manifest = await dryRun(client, directory, { encode: async () => ({ output,
      source: { width: 32, height: 24, hasAlpha: true }, target: { width: 32, height: 24, hasAlpha: true } }) });
    assert.equal(client.writes, 0);
    assert.equal(manifest.entries[0].sourceHash, hash(avif));
    assert.deepEqual(await readFile(join(directory, 'originals', id)), avif);
    client.row.photo = png;
    assert.equal((await applyManifest(client, directory)).conflicts, 1);
    assert.equal(client.writes, 0);
    client.row.photo = avif;
    assert.equal((await applyManifest(client, directory)).applied, 1);
    assert.equal((await applyManifest(client, directory)).skipped, 1);
    assert.equal(client.writes, 1);
    assert.equal((await applyManifest(client, directory, { rollback: true })).applied, 1);
    assert.deepEqual(client.row.photo, avif);
    assert.notEqual(client.row.updated_at.getTime(), 0);
    await applyManifest(client, directory);
    client.row.photo = png;
    assert.equal((await applyManifest(client, directory, { rollback: true })).conflicts, 1);
    assert.deepEqual(client.row.photo, png);
    await writeFile(join(directory, 'candidates', `${id}.avif`), 'tampered');
    assert.equal((await applyManifest(client, directory)).errors, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('one encoding failure preserves original and continues to report', async () => {
  const root = await mkdtemp(join(tmpdir(), 'photo-migration-error-'));
  try {
    const client = new FakeClient();
    const manifest = await dryRun(client, join(root, 'run'), { encode: async () => { throw new Error('decode failed'); } });
    assert.equal(manifest.summary.errors, 1);
    assert.equal(client.writes, 0);
    assert.equal(manifest.entries[0].error, 'decode failed');
    assert.deepEqual(await readFile(join(root, 'run', 'originals', id)), avif);
  } finally { await rm(root, { recursive: true, force: true }); }
});
