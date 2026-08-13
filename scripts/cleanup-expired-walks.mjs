import pg from "pg";

const { Client } = pg;

const MOSCOW_TIME_ZONE = "Europe/Moscow";
const MOSCOW_RUN_HOUR = 6;
const MOSCOW_RUN_UTC_HOUR = 3;
const RETRY_DELAY_MS = 5 * 60 * 1000;
const runOnce = process.argv.includes("--run-once");

let timer;

function connectionString() {
  const value = process.env.DATABASE_URL?.trim();

  if (!value) {
    throw new Error("Не задана строка подключения DATABASE_URL.");
  }

  return value;
}

function nextRunAt(now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(MOSCOW_RUN_UTC_HOUR, 0, 0, 0);

  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next;
}

function hasPassedRunTimeToday(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: MOSCOW_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23"
  }).format(now));

  return hour >= MOSCOW_RUN_HOUR;
}

function formatMoscowDateTime(value) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: MOSCOW_TIME_ZONE,
    dateStyle: "short",
    timeStyle: "medium"
  }).format(value);
}

async function cleanupExpiredData() {
  const client = new Client({
    connectionString: connectionString(),
    connectionTimeoutMillis: 5000
  });

  await client.connect();

  try {
    const walksResult = await client.query(`
      DELETE FROM walks
      WHERE walk_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')::date
        AND schedule_type IN ('today', 'tomorrow')
    `);
    const sessionsResult = await client.query(`
      DELETE FROM client_sessions
      WHERE expires_at < CURRENT_TIMESTAMP
    `);

    console.info(
      `[walk-cleanup] ${formatMoscowDateTime(new Date())}: удалено прогулок — ${walksResult.rowCount ?? 0}, истёкших сессий — ${sessionsResult.rowCount ?? 0}`
    );
  } finally {
    await client.end();
  }
}

function scheduleNextRun() {
  const next = nextRunAt();
  const delay = next.getTime() - Date.now();

  console.info(`[walk-cleanup] Следующий запуск: ${formatMoscowDateTime(next)}`);
  timer = setTimeout(runAndSchedule, delay);
}

async function runAndSchedule() {
  try {
    await cleanupExpiredData();
    scheduleNextRun();
  } catch (error) {
    console.error("[walk-cleanup] Не удалось удалить устаревшие прогулки. Повтор через 5 минут.", error);
    timer = setTimeout(runAndSchedule, RETRY_DELAY_MS);
  }
}

function shutdown(signal) {
  if (timer) clearTimeout(timer);
  console.info(`[walk-cleanup] Получен ${signal}, планировщик остановлен.`);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

if (runOnce) {
  cleanupExpiredData().catch((error) => {
    console.error("[walk-cleanup] Не удалось удалить устаревшие прогулки.", error);
    process.exitCode = 1;
  });
} else if (hasPassedRunTimeToday()) {
  runAndSchedule();
} else {
  scheduleNextRun();
}
