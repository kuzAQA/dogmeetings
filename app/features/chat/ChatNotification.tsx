"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { dismissChatNotification } from "./use-unread";

export function ChatNotification({ onOpen }: { onOpen: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const auto = window.setTimeout(() => setLeaving(true), 5000);
    const finish = window.setTimeout(dismissChatNotification, 5280);
    return () => {
      window.clearTimeout(auto);
      window.clearTimeout(finish);
    };
  }, []);

  return (
    <div className={`d2-toast${leaving ? " d2-leaving" : ""}`}>
      <Image unoptimized className="d2-icon" src="/chat-notification.png" alt="" width={54} height={46} />
      <div className="d2-toast-content">
        <h3>Новое сообщение</h3>
        <p>Вам написали в dogmeet. Загляните в чат!</p>
        <div className="d2-actions">
          <button className="d2-open" type="button" disabled={leaving} onClick={onOpen}>Открыть диалог</button>
          <button className="d2-close" type="button" disabled={leaving} onClick={dismissChatNotification}>Закрыть</button>
        </div>
      </div>
      <button className="d2-cross" type="button" aria-label="Закрыть уведомление" disabled={leaving} onClick={dismissChatNotification}>×</button>
      <div className="d2-progress" aria-hidden="true" />
    </div>
  );
}
