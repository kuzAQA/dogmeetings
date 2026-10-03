type LocationRequestNotification = {
  id: string;
  city?: string | null;
  district?: string | null;
  residentialComplex?: string | null;
};

let cachedBotUsername: string | undefined;

export function isTelegramWebhookRequest(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!secret || !/^[A-Za-z0-9_-]{32,256}$/.test(secret)) return false;

  const candidate = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  let difference = candidate.length ^ secret.length;
  for (let index = 0; index < Math.max(candidate.length, secret.length); index += 1) {
    difference |= (candidate.charCodeAt(index) || 0) ^ (secret.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function telegramConfiguration() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();
  if (!token || !chatId) return null;
  return { token, chatId };
}

function locationValue(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "—";
}

type WalkNotificationState = {
  petId: string;
  petName: string;
  ownerName: string;
  residentialComplex: string;
  place: string;
  comment?: string | null;
  walkTime: string;
  walkDate: string;
  scheduleType: string;
};

export function telegramWalkChangeMessage(previous: WalkNotificationState, current: WalkNotificationState) {
  const who = (walk: WalkNotificationState) => `${walk.petName} · ${walk.ownerName}`;
  const schedule = (walk: WalkNotificationState) => walk.scheduleType === "always" ? "каждый день" : walk.scheduleType === "tomorrow" ? "завтра" : "сегодня";
  const dateChanged = previous.scheduleType !== "always" && previous.walkDate !== current.walkDate;
  const time = (walk: WalkNotificationState) => `${walk.walkTime.slice(0, 5)} · ${schedule(walk)}${dateChanged && previous.scheduleType === current.scheduleType ? ` (${walk.walkDate.split("-").reverse().join(".")})` : ""}`;
  const changed = (oldValue: string, newValue: string) => oldValue === newValue
    ? locationValue(newValue)
    : `<s>${locationValue(oldValue)}</s> → ${locationValue(newValue)}`;

  if (previous.petId === current.petId && who(previous) === who(current) &&
    previous.residentialComplex === current.residentialComplex && previous.place === current.place &&
    previous.walkTime === current.walkTime && previous.scheduleType === current.scheduleType && !dateChanged) return null;

  return [
    `🐾 <b>Прогулка изменена в ЖК «${changed(previous.residentialComplex, current.residentialComplex)}»</b>`,
    "",
    `🐕 <b>Кто гуляет:</b> ${changed(who(previous), who(current))}`,
    `📍 <b>Где:</b> ${changed(previous.place, current.place)}`,
    `🕒 <b>Во сколько:</b> ${changed(time(previous), time(current))}`,
    ...(current.comment?.trim() ? [`💬 <b>Комментарий:</b> ${locationValue(current.comment)}`] : [])
  ].join("\n");
}

export function telegramLocationRequestMessage(location: LocationRequestNotification) {
  return [
    "🆕 Новая заявка на локацию",
    "",
    `🏙 <b>Город:</b> ${locationValue(location.city)}`,
    `📍 <b>Район:</b> ${locationValue(location.district)}`,
    `🏢 <b>Жилой комплекс:</b> ${locationValue(location.residentialComplex)}`,
    "",
    "🔗 Панель: <a href=\"https://dogmeet.ru/dogsfather\">https://dogmeet.ru/dogsfather</a>"
  ].join("\n");
}

export async function telegramBotRequest(method: string, body: Record<string, unknown>, fetcher: typeof fetch = fetch) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return false;

  try {
    const response = await fetcher(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5_000)
    });
    const payload = await response.json() as { ok?: boolean; description?: string };
    if (!response.ok || !payload.ok) throw new Error(payload.description || `Telegram API returned ${response.status}`);
    return true;
  } catch (error) {
    console.error(`[telegram] Не удалось вызвать ${method}.`, error);
    return false;
  }
}

export async function telegramBotUsername(fetcher: typeof fetch = fetch) {
  if (cachedBotUsername) return cachedBotUsername;

  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return null;

  try {
    const response = await fetcher(`https://api.telegram.org/bot${token}/getMe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(5_000)
    });
    const payload = await response.json() as { ok?: boolean; result?: { username?: unknown } };
    const username = typeof payload.result?.username === "string" ? payload.result.username.trim() : "";
    if (!response.ok || !payload.ok || !/^[A-Za-z0-9_]{5,32}$/.test(username)) {
      throw new Error("Telegram не вернул корректное имя бота.");
    }
    cachedBotUsername = username;
  } catch (error) {
    console.error("[telegram] Не удалось получить имя бота.", error);
    return null;
  }

  return cachedBotUsername ?? null;
}

export async function sendTelegramLocationRequestNotification(location: LocationRequestNotification, fetcher: typeof fetch = fetch) {
  const configuration = telegramConfiguration();
  if (!configuration) return false;

  return telegramBotRequest("sendMessage", {
    chat_id: configuration.chatId,
    text: telegramLocationRequestMessage(location),
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[
        { text: "✅ Одобрить", callback_data: `location-request:approve:${location.id}` },
        { text: "❌ Отклонить", callback_data: `location-request:reject:${location.id}` }
      ]]
    }
  }, fetcher);
}
