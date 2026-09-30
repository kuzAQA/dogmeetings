import { Client } from "pg";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { encodeAvif } from "../server/pet-photo.mjs";

const AVIF_TYPE = "image/avif";
const BATCH_SIZE = 10;

function safeErrorMessage(error) {
  if (error instanceof Error) {
    if (error.name === "PetPhotoError") return error.message;
    let message = error.message;
    for (const secret of [process.env.DATABASE_URL, process.env.POSTGRES_PASSWORD]) {
      if (secret) message = message.replaceAll(secret, "[redacted]");
    }
    return message.replace(/(?:postgres(?:ql)?:\/\/)[^\s'"`]+/gi, "[redacted connection string]").slice(0, 300);
  }
  return "Unknown error";
}

export async function migratePetPhotos(client, { encode = encodeAvif, write = console.log } = {}) {
  const stats = { processed: 0, errors: 0, bytesBefore: 0, bytesAfter: 0 };
  let cursor = null;

  while (true) {
    const { rows } = await client.query(
      `SELECT id FROM public.pets
       WHERE photo IS NOT NULL AND photo_type IS DISTINCT FROM $3
         AND ($1::uuid IS NULL OR id > $1::uuid)
       ORDER BY id LIMIT $2`,
      [cursor, BATCH_SIZE, AVIF_TYPE]
    );
    if (!rows.length) break;

    for (const { id } of rows) {
      cursor = id;
      await client.query("BEGIN");
      try {
        const { rows: [pet] } = await client.query(
          "SELECT photo, photo_type FROM public.pets WHERE id = $1 AND photo IS NOT NULL FOR UPDATE",
          [id]
        );
        if (!pet || pet.photo_type === AVIF_TYPE) {
          await client.query("COMMIT");
          continue;
        }

        let converted;
        try {
          converted = await encode(pet.photo);
        } catch (error) {
          await client.query("ROLLBACK");
          stats.errors += 1;
          write(`ERROR pet=${id} before=${pet.photo.length} bytes: ${safeErrorMessage(error)}`);
          continue;
        }

        await client.query(
          `UPDATE public.pets SET photo = $2, photo_type = $3, updated_at = now()
           WHERE id = $1`,
          [id, converted, AVIF_TYPE]
        );
        await client.query("COMMIT");
        stats.processed += 1;
        stats.bytesBefore += pet.photo.length;
        stats.bytesAfter += converted.length;
        write(`Converted pet=${id} ${pet.photo.length} -> ${converted.length} bytes`);
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      }
    }
  }

  write(`AVIF migration: processed=${stats.processed}, errors=${stats.errors}, before=${stats.bytesBefore} bytes, after=${stats.bytesAfter} bytes`);
  return stats;
}

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const stats = await migratePetPhotos(client);
    if (stats.errors) process.exitCode = 1;
  } catch (error) {
    console.error(`AVIF migration failed: ${safeErrorMessage(error)}`);
    process.exitCode = 1;
  } finally {
    await client.end().catch((error) => {
      console.error(`AVIF migration disconnect failed: ${safeErrorMessage(error)}`);
      process.exitCode = 1;
    });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
