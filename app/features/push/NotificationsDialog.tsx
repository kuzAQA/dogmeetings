"use client";

import { useEffect, useState } from "react";
import { DogmeetDialog } from "../../components/ui/DogmeetFrame";
import { requestJson } from "../api/client";
import type { usePushNotifications } from "./use-push-notifications";

type TelegramSettings = { enabled: boolean; subscribed: boolean };

export function NotificationsDialog({ push, onDismiss }: {
  push: ReturnType<typeof usePushNotifications>;
  onDismiss: () => void;
}) {
  const [channel, setChannel] = useState<"telegram" | null>(null);
  const [settings, setSettings] = useState<TelegramSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (busy) return;
    const controller = new AbortController();
    const load = () => {
      void requestJson<TelegramSettings>("/api/telegram/notifications", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
        .then(setSettings).catch(() => { if (!controller.signal.aborted) setError("Не удалось проверить Telegram-подписку. Откройте настройки повторно."); });
    };
    load();
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", onVisible);
    return () => { controller.abort(); window.removeEventListener("focus", load); document.removeEventListener("visibilitychange", onVisible); };
  }, [busy]);

  async function updateTelegram() {
    if (busy || !settings) return;
    setBusy(true); setError("");
    try {
      if (!settings.subscribed && !settings.enabled) {
        const { link } = await requestJson<{ link: string }>("/api/telegram/subscription-link", { method: "POST", signal: AbortSignal.timeout(15000) });
        window.location.assign(link);
      } else {
        setSettings(await requestJson<TelegramSettings>("/api/telegram/notifications", {
          method: "PATCH", headers: { "content-type": "application/json" },
          body: JSON.stringify({ enabled: !settings.enabled }), signal: AbortSignal.timeout(15000)
        }));
        setChannel(null);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось изменить настройки Telegram.");
    } finally { setBusy(false); }
  }

  return <DogmeetDialog title="Уведомления" busy={busy} onDismiss={onDismiss}
    footer={<>
      {channel === "telegram" && <button type="button" className="button" disabled={busy || !settings} onClick={() => { void updateTelegram(); }}>
        {busy ? "Подождите…" : settings?.enabled ? "Отключить Telegram" : settings?.subscribed ? "Подключить Telegram" : "Открыть Telegram-бота"}
      </button>}
      <button type="button" className="button quiet" disabled={busy} onClick={onDismiss}>Закрыть</button>
    </>}>
    <button type="button" className="menu-row" disabled={busy} onClick={() => { onDismiss(); push.openSettings(); }}>
      <span><strong>Push-уведомления</strong><small>Сообщения в этом браузере</small></span><small>{push.enabled ? "Включено" : "Отключено"}</small>
    </button>
    <button type="button" className="menu-row" disabled={busy} onClick={() => setChannel("telegram")}>
      <span><strong>Telegram</strong><small>Новые сообщения в боте</small></span><small>{settings ? settings.enabled && settings.subscribed ? "Включено" : "Отключено" : "Проверяем…"}</small>
    </button>
    {channel === "telegram" && <>
      <p>{settings?.enabled ? "Отключить уведомления о новых сообщениях в Telegram? Подписка на прогулки сохранится." : "Подключить уведомления о новых сообщениях в Telegram? Нужна активная подписка на прогулки ЖК."}</p>
      <p>В бот придут только имя отправителя и уведомление о новом сообщении. Текст сообщения останется на сайте.</p>
      {settings && !settings.subscribed && <p>Подтвердите подписку в боте, затем вернитесь сюда и подключите Telegram. Если подписка уже есть, откройте бота по этой кнопке, чтобы связать её с сайтом.</p>}
    </>}
    {error && <p className="field-error" role="alert">{error}</p>}
  </DogmeetDialog>;
}
