import pg from "pg";
let blockedUntil = 0;

export class TelegramRetryError extends Error {
  constructor(message, retryAfter) {
    super(message);
    this.retryAfter = retryAfter;
    this.telegramStatus = 429;
  }
}

async function withRateDb(operation) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  await client.connect();
  try { return await operation(client); } finally { await client.end(); }
}

export async function reserveTelegramRequest(client, chatId, now = Date.now()) {
  const scopes = chatId == null ? ["global"] : ["global", `chat:${chatId}`];
  await client.query("BEGIN");
  try {
    await client.query("INSERT INTO telegram_api_limits (scope) SELECT unnest($1::text[]) ON CONFLICT DO NOTHING", [scopes]);
    const { rows } = await client.query("SELECT scope, next_at, blocked_until FROM telegram_api_limits WHERE scope = ANY($1::text[]) ORDER BY scope FOR UPDATE", [scopes]);
    const blockedUntil = Math.max(0, ...rows.map(row => new Date(row.blocked_until).getTime() || 0));
    if (blockedUntil > now) throw new TelegramRetryError("Telegram приостановлен после 429.", Math.ceil((blockedUntil - now) / 1000));
    const readyAt = Math.max(now, ...rows.map(row => new Date(row.next_at).getTime()));
    if (readyAt - now > 5000) throw new TelegramRetryError("Очередь запросов Telegram занята.", Math.ceil((readyAt - now) / 1000));
    await client.query("UPDATE telegram_api_limits SET next_at = $2 WHERE scope = $1", ["global", new Date(readyAt + 50)]);
    if (chatId != null) {
      await client.query("UPDATE telegram_api_limits SET next_at = $2 WHERE scope = $1", [`chat:${chatId}`, new Date(readyAt + (String(chatId).startsWith("-") ? 3000 : 1000))]);
    }
    await client.query("COMMIT");
    return readyAt - now;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function requestTelegramApi(token, method, body, fetcher = fetch, timeoutMs = 5000, rateDb = withRateDb) {
  if (blockedUntil > Date.now()) throw new TelegramRetryError("Telegram приостановлен после 429.", Math.ceil((blockedUntil - Date.now()) / 1000));
  const chatId = method === "deleteMessage" ? null : body instanceof FormData ? body.get("chat_id") : body.chat_id;
  const delay = await rateDb(client => reserveTelegramRequest(client, chatId));
  if (delay > 0) {
    await new Promise(resolve => setTimeout(resolve, delay));
    const { rows } = await rateDb(client => client.query("SELECT blocked_until FROM telegram_api_limits WHERE scope = 'global'"));
    const remaining = new Date(rows[0]?.blocked_until).getTime() - Date.now();
    if (remaining > 0) {
      blockedUntil = Date.now() + remaining;
      throw new TelegramRetryError("Telegram приостановлен после 429.", Math.ceil(remaining / 1000));
    }
  }
  const response = await fetcher(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
    body: body instanceof FormData ? body : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    const retryAfter = Number.isSafeInteger(payload.parameters?.retry_after) && payload.parameters.retry_after > 0 ? payload.parameters.retry_after : 60;
    const error = response.status === 429 || payload.error_code === 429
      ? new TelegramRetryError(payload.description || "Telegram ограничил запросы.", retryAfter)
      : new Error(payload.description || `Telegram API returned ${response.status}`);
    error.telegramStatus = response.status;
    if (error.retryAfter) {
      blockedUntil = Math.max(blockedUntil, Date.now() + error.retryAfter * 1000);
      try { await rateDb(client => client.query(`
        INSERT INTO telegram_api_limits (scope, blocked_until)
        VALUES ('global', CURRENT_TIMESTAMP + ($1 * INTERVAL '1 second'))
        ON CONFLICT (scope) DO UPDATE SET blocked_until = GREATEST(telegram_api_limits.blocked_until, EXCLUDED.blocked_until)
      `, [error.retryAfter])); } catch (storageError) {
        console.error("[telegram-rate] Не удалось сохранить общую паузу; текущий процесс и задание сохраняют retry_after.", storageError);
      }
    }
    throw error;
  }
  if (method === "deleteMessage" && payload.result !== true) throw new Error("Telegram не подтвердил удаление.");
  return payload.result;
}
