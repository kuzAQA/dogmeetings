type LocationRequestNotification = {
  id: string;
  clientId: string;
  city: string;
  district: string;
  residentialComplex: string;
};

function telegramConfiguration() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!token || !chatId) return null;
  return { token, chatId };
}

export async function sendTelegramLocationRequestNotification(location: LocationRequestNotification, fetcher: typeof fetch = fetch) {
  const configuration = telegramConfiguration();
  if (!configuration) return false;

  const text = [
    "Новая заявка на локацию",
    `Локация: ${location.residentialComplex}`,
    `Адрес: ${location.city}, ${location.district}`,
    `Автор: ${location.clientId}`,
    `ID заявки: ${location.id}`,
    "Панель: https://dogmeet.ru/dogsfather"
  ].join("\n");

  try {
    const response = await fetcher(`https://api.telegram.org/bot${configuration.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: configuration.chatId, text }),
      signal: AbortSignal.timeout(5_000)
    });
    if (!response.ok) throw new Error(`Telegram API returned ${response.status}`);
    return true;
  } catch (error) {
    console.error("[telegram] Не удалось отправить уведомление о новой заявке на локацию.", error);
    return false;
  }
}
