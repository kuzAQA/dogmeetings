import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

type StorageEnv = {
  DB: D1Database;
  PET_PHOTOS: R2Bucket;
};

const storageEnv = env as unknown as StorageEnv;
let schemaReady: Promise<void> | undefined;

export async function ensurePetStorage() {
  if (!storageEnv.DB) {
    throw new Error("Хранилище питомцев временно недоступно.");
  }

  schemaReady ??= storageEnv.DB
    .batch([
      storageEnv.DB.prepare(`
        CREATE TABLE IF NOT EXISTS pets (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          owner_name TEXT NOT NULL,
          photo_key TEXT NOT NULL,
          photo_type TEXT NOT NULL,
          created_at INTEGER DEFAULT (unixepoch() * 1000) NOT NULL
        )
      `),
      storageEnv.DB.prepare("CREATE INDEX IF NOT EXISTS pets_created_at_idx ON pets (created_at)")
    ])
    .then(() => undefined)
    .catch((error) => {
      schemaReady = undefined;
      throw error;
    });

  return schemaReady;
}

export function getDb() {
  if (!storageEnv.DB) {
    throw new Error("Хранилище питомцев временно недоступно.");
  }

  return drizzle(storageEnv.DB, { schema });
}

export function getPhotoBucket() {
  if (!storageEnv.PET_PHOTOS) {
    throw new Error("Хранилище фотографий временно недоступно.");
  }

  return storageEnv.PET_PHOTOS;
}
