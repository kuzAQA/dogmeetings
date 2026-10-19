"use client";

import { Bell } from "lucide-react";
import { DogmeetDialog } from "../../components/ui/DogmeetFrame";
import type { usePushNotifications } from "./use-push-notifications";

export function PushDialog({ push }: { push: ReturnType<typeof usePushNotifications> }) {
  if (!push.mode) return push.notice ? <p className="push-notice" role="status">{push.notice}</p> : null;
  const disabling = push.mode === "disable";
  return <DogmeetDialog title={disabling ? "Отключить push-уведомления?" : "Получайте сообщения"}
    busy={push.busy} dismissible={!push.mandatory} onDismiss={push.dismiss}
    footer={<>
      <button className="button" type="button" disabled={push.busy} onClick={() => { void (disabling ? push.disable() : push.enable()); }}>
        {push.busy ? "Подождите…" : disabling ? "Отключить" : "Подключить"}
      </button>
      {!push.mandatory && <button className="button quiet" type="button" disabled={push.busy} onClick={push.dismiss}>Отмена</button>}
    </>}>
    <Bell className="state-icon" aria-hidden="true" />
    <h2>{disabling ? "Вы точно хотите отключить push-уведомления?" : "Не пропускайте сообщения"}</h2>
    {push.error && <p className="field-error" role="alert">{push.error}</p>}
    <p>{disabling ? "Тогда вы не сможете получать сообщения из Диалогов" : "Подключите push-уведомления, чтобы узнавать о новых сообщениях в Диалогах."}</p>
    <p>Сообщения останутся доступны на сайте</p>
    <p className="small-note">Настройка действует только в этом браузере или установленном приложении.</p>
  </DogmeetDialog>;
}
