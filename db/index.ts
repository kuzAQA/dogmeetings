import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import * as schema from "./schema";

type StorageEnv = {
  DATABASE_URL?: string;
};

const storageEnv = env as unknown as StorageEnv;

function getConnectionString() {
  if (!storageEnv.DATABASE_URL) {
    throw new Error("Не задана строка подключения DATABASE_URL.");
  }

  return storageEnv.DATABASE_URL;
}

function createDb(client: Client) {
  return drizzle(client, { schema });
}

type Database = ReturnType<typeof createDb>;

export async function withDb<T>(operation: (db: Database) => Promise<T>) {
  const client = new Client({
    connectionString: getConnectionString(),
    connectionTimeoutMillis: 5000
  });
  await client.connect();

  try {
    return await operation(createDb(client));
  } finally {
    await client.end();
  }
}
