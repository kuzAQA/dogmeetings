type LocationRequestNotification = {
  id: string;
  city?: string | null;
  district?: string | null;
  residentialComplex?: string | null;
};

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
