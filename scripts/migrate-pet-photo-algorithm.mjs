import { Client } from 'pg';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { prepareMigrationPhoto, PHOTO_ALGORITHM, migrationSharpOptions } from '../server/pet-photo-migration.mjs';
import { MAX_STORED_PHOTO_SIZE } from '../server/domain/pet-photo-limits.mjs';

export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function save(path, value) {
  await writeFile(`${path}.tmp`, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  await rename(`${path}.tmp`, path);
}
function safeError(error) {
  return String(error?.message ?? error).replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[redacted]').slice(0, 300);
}
export function summarize(entries) {
  const ready = entries.filter(e => e.status === 'ready');
  const before = ready.reduce((sum, e) => sum + e.bytesBefore, 0);
  const after = ready.reduce((sum, e) => sum + e.bytesAfter, 0);
  return { photos: entries.length, ready: ready.length, errors: entries.length - ready.length,
    growth: ready.filter(e => e.bytesAfter > e.bytesBefore).length, bytesBefore: before, bytesAfter: after,
    savedBytes: before - after, savingsPercent: before ? (1 - after / before) * 100 : 0, reductionFactor: after ? before / after : null };
}
export async function dryRun(client, directory, { limit = Infinity, encode = prepareMigrationPhoto } = {}) {
  await mkdir(directory, { mode: 0o700 }); // Exclusive run directory: never overwrite a previous manifest.
  await mkdir(join(directory, 'originals'), { mode: 0o700 });
  await mkdir(join(directory, 'candidates'), { mode: 0o700 });
  const manifest = { algorithm: PHOTO_ALGORITHM, quality: 40, createdAt: new Date().toISOString(), complete: false, entries: [] };
  const path = join(directory, 'manifest.json');
  const started = performance.now();
  let cursor = null;
  await save(path, manifest);
  while (manifest.entries.length < limit) {
    const { rows } = await client.query(`SELECT id FROM public.pets WHERE photo IS NOT NULL
      AND ($1::uuid IS NULL OR id > $1::uuid) ORDER BY id LIMIT $2`, [cursor, Math.min(10, limit - manifest.entries.length)]);
    if (!rows.length) break;
    for (const { id } of rows) {
      cursor = id;
      const { rows: [pet] } = await client.query('SELECT photo, photo_type, updated_at FROM public.pets WHERE id = $1 AND photo IS NOT NULL', [id]);
      if (!pet) continue;
      const entry = { id, sourceHash: hash(pet.photo), photoType: pet.photo_type, updatedAt: pet.updated_at,
        bytesBefore: pet.photo.length, startedAt: new Date().toISOString(), status: 'error' };
      await writeFile(join(directory, 'originals', id), pet.photo, { mode: 0o600, flag: 'wx' });
      const tick = performance.now();
      try {
        const { output, source, target } = await encode(pet.photo);
        await writeFile(join(directory, 'candidates', `${id}.avif`), output, { mode: 0o600, flag: 'wx' });
        Object.assign(entry, { status: 'ready', targetHash: hash(output), bytesAfter: output.length, source, target });
      } catch (error) { entry.error = safeError(error); }
      entry.durationMs = Math.round(performance.now() - tick);
      manifest.entries.push(entry);
      await save(path, manifest);
      console.log(JSON.stringify({ id, status: entry.status, bytesBefore: entry.bytesBefore, bytesAfter: entry.bytesAfter, durationMs: entry.durationMs, error: entry.error }));
    }
  }
  manifest.complete = true;
  manifest.durationMs = Math.round(performance.now() - started);
  manifest.summary = summarize(manifest.entries);
  await save(path, manifest);
  return manifest;
}
export async function applyManifest(client, directory, { rollback = false } = {}) {
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
  if (!manifest.complete || manifest.algorithm !== PHOTO_ALGORITHM || manifest.quality !== 40) throw new Error('Incomplete or incompatible manifest');
  const report = { algorithm: PHOTO_ALGORITHM, rollback, startedAt: new Date().toISOString(), applied: 0, skipped: 0, conflicts: 0, errors: 0, entries: [] };
  const reportPath = join(directory, rollback ? 'rollback-report.json' : 'apply-report.json');
  for (const entry of manifest.entries) {
    if (entry.status !== 'ready') { report.skipped++; continue; }
    const result = { id: entry.id };
    let transaction = false;
    try {
      if (!uuid.test(entry.id)) throw new Error('Invalid UUID');
      const target = await readFile(join(directory, 'candidates', `${entry.id}.avif`));
      if (hash(target) !== entry.targetHash || target.length !== entry.bytesAfter || target.length > MAX_STORED_PHOTO_SIZE) throw new Error('Candidate hash/size mismatch');
      const metadata = await sharp(target, migrationSharpOptions).metadata();
      if (metadata.format !== 'heif' || metadata.compression !== 'av1' || metadata.width !== entry.target.width
        || metadata.height !== entry.target.height || Math.max(metadata.width, metadata.height) > 1600
        || metadata.exif || metadata.xmp || metadata.icc || metadata.orientation || (entry.source.hasAlpha && !metadata.hasAlpha)) throw new Error('Invalid candidate metadata');
      await sharp(target, migrationSharpOptions).raw().toBuffer();
      const bytes = rollback ? await readFile(join(directory, 'originals', entry.id)) : target;
      if (rollback && hash(bytes) !== entry.sourceHash) throw new Error('Original hash mismatch');
      await client.query('BEGIN');
      transaction = true;
      const { rows: [pet] } = await client.query('SELECT photo, photo_type FROM public.pets WHERE id = $1 FOR UPDATE', [entry.id]);
      const current = pet?.photo ? hash(pet.photo) : null;
      const expected = rollback ? entry.targetHash : entry.sourceHash;
      const desired = rollback ? entry.sourceHash : entry.targetHash;
      const desiredType = rollback ? entry.photoType : 'image/avif';
      if (current === desired && pet.photo_type === desiredType) { result.status = 'skipped'; report.skipped++; }
      else if (current !== expected || pet.photo_type !== (rollback ? 'image/avif' : entry.photoType)) { result.status = 'conflict'; report.conflicts++; }
      else {
        await client.query('UPDATE public.pets SET photo = $2, photo_type = $3, updated_at = clock_timestamp() WHERE id = $1', [entry.id, bytes, desiredType]);
        result.status = 'applied'; report.applied++;
      }
      await client.query('COMMIT');
      transaction = false;
    } catch (error) {
      if (transaction) await client.query('ROLLBACK').catch(() => {});
      result.status = 'error'; result.error = safeError(error); report.errors++;
    }
    report.entries.push(result);
    await save(reportPath, report);
    console.log(JSON.stringify(result));
  }
  await save(reportPath, report);
  return report;
}
async function main() {
  const [mode, directory, limitValue] = process.argv.slice(2);
  if (!['dry-run', 'apply', 'rollback'].includes(mode) || !directory || (limitValue && (mode !== 'dry-run' || !/^[1-9]\d*$/.test(limitValue)))) {
    throw new Error('Usage: node scripts/migrate-pet-photo-algorithm.mjs dry-run|apply|rollback PRIVATE_DIRECTORY [dry-run limit]');
  }
  if (process.env.IMAGE_AVIF_QUALITY && process.env.IMAGE_AVIF_QUALITY !== '40') throw new Error('This algorithm requires IMAGE_AVIF_QUALITY=40');
  process.env.IMAGE_AVIF_QUALITY = '40';
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const result = mode === 'dry-run' ? await dryRun(client, resolve(directory), { limit: limitValue ? Number(limitValue) : Infinity })
      : await applyManifest(client, resolve(directory), { rollback: mode === 'rollback' });
    console.log(JSON.stringify(mode === 'dry-run' ? { ...result.summary, durationMs: result.durationMs } : result));
    if ((result.summary?.errors ?? result.errors) || result.conflicts) process.exitCode = 1;
  } finally { await client.end(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch(error => { console.error(safeError(error)); process.exitCode = 1; });
}
