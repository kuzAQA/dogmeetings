import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import * as schema from "./schema";

function getConnectionString() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("Не задана строка подключения DATABASE_URL.");
  }

  return connectionString;
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
