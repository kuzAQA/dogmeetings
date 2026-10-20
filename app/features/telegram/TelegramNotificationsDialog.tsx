"use client";

import { useState } from "react";
import { DogmeetDialog } from "../../components/ui/DogmeetFrame";
import { requestJson } from "../api/client";
import { telegramStatusText, type TelegramSettings } from "./useTelegramSettings";

export function TelegramNotificationsDialog({ onDismiss, settings }: {
  onDismiss: () => void;
  settings: TelegramSettings | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const status = settings?.status ?? "unknown";
  const action = status === "active" ? "Отписаться" : status === "inactive" ? "Подключить" : "Проверить";

  async function openTelegram() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const purpose = status === "active" ? "messages-unsubscribe" : status === "inactive" ? "messages-subscribe" : "messages-check";
      const { link } = await requestJson<{ link: string }>("/api/telegram/subscription-link", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ purpose }), signal: AbortSignal.timeout(15000)
      });
      window.location.assign(link);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось открыть Telegram.");
    } finally { setBusy(false); }
  }

  return <DogmeetDialog title="Уведомления" busy={busy} onDismiss={onDismiss}
    footer={<>
      <button type="button" className="button" disabled={busy} onClick={() => { void openTelegram(); }}>{busy ? "Подождите…" : action}</button>
      <button type="button" className="button quiet" disabled={busy} onClick={onDismiss}>Закрыть</button>
    </>}>
    <div className="menu-row"><span><strong>Telegram</strong><small>Новые личные сообщения</small></span><small>{telegramStatusText[status]}</small></div>
    <p>{status === "active" ? "Отписку нужно подтвердить в Telegram. Подписки на прогулки сохранятся." : status === "inactive" ? "Подключите уведомления о личных сообщениях в Telegram. Выбирать ЖК не нужно." : "Проверьте подписку в Telegram. Проверка не подключает и не отключает уведомления."}</p>
    <p>В бот придут только имя отправителя и уведомление о новом сообщении. Текст сообщения останется на сайте.</p>
    {error && <p className="field-error" role="alert">{error}</p>}
  </DogmeetDialog>;
}
