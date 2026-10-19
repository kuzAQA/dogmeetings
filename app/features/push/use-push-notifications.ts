"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError, requestJson } from "../api/client";

const pendingPrompt = "dogmeet-push-prompt-pending";
const firstOwnPetSeen = "dogmeet-push-first-own-pet-seen";
const permissionHelp = "Уведомления запрещены в настройках браузера. Разрешите их для Dogmeet и вернитесь сюда. На iPhone/iPad откройте Настройки → Уведомления → Dogmeet. Если Dogmeet нет в списке, добавьте сайт на экран «Домой» через меню «Поделиться» в Safari и откройте его оттуда.";

function supported() {
  return window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function pushRequest(body: object) {
  return requestJson<{ enabled: boolean }>("/api/push", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
}

function promptPending(value: boolean) {
  try { if (value) localStorage.setItem(pendingPrompt, "1"); else localStorage.removeItem(pendingPrompt); } catch { /* Storage is optional. */ }
}

export function usePushNotifications(sessionReady: boolean, hasOwnPet: boolean) {
  const [enabled, setEnabled] = useState(false);
  const [checked, setChecked] = useState(false);
  const [mode, setMode] = useState<"enable" | "disable" | null>(null);
  const [mandatory, setMandatory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const running = useRef(false);
  const revision = useRef(0);
  const ownPetSeen = useRef(false);

  useEffect(() => {
    if (!hasOwnPet) return;
    ownPetSeen.current = true;
    try {
      if (!localStorage.getItem(firstOwnPetSeen)) localStorage.removeItem(pendingPrompt);
      localStorage.setItem(firstOwnPetSeen, "1");
    } catch { /* Storage is optional. */ }
  }, [hasOwnPet]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 8000);
    return () => clearTimeout(timer);
  }, [notice]);

  const sync = useCallback(async () => {
    if (running.current) return;
    const version = ++revision.current;
    try {
      let active = false;
      if (supported()) {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          const config = await requestJson<{ publicKey: string; configured: boolean }>("/api/push", { cache: "no-store", signal: AbortSignal.timeout(15000) });
          const status = await pushRequest({ action: "status", endpoint: subscription.endpoint });
          const serverKey = config.publicKey ? publicKeyBytes(config.publicKey) : new Uint8Array();
          const matchingKey = !subscription.options.applicationServerKey || equalKey(subscription.options.applicationServerKey, serverKey);
          active = Notification.permission === "granted" && status.enabled && config.configured && matchingKey;
          if (Notification.permission !== "granted" && status.enabled) await pushRequest({ action: "disable", endpoint: subscription.endpoint });
        }
      }
      if (revision.current === version) { setEnabled(active); setChecked(true); }
    } catch { if (revision.current === version) { setChecked(false); setError("Не удалось проверить push-подписку. Проверьте соединение и повторите попытку."); } }
  }, []);

  useEffect(() => {
    if (!sessionReady) return;
    let pending = false;
    try { pending = localStorage.getItem(pendingPrompt) === "1" && localStorage.getItem(firstOwnPetSeen) === "1"; } catch { /* Storage is optional. */ }
    let mounted = true;
    if (pending) queueMicrotask(() => { if (mounted) { setMandatory(true); setMode("enable"); } });
    queueMicrotask(() => { if (mounted) void sync(); });
    const check = () => { if (document.visibilityState === "visible") void sync(); };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => { mounted = false; document.removeEventListener("visibilitychange", check); window.removeEventListener("focus", check); };
  }, [sessionReady, sync]);

  function offer() {
    let seen = ownPetSeen.current;
    ownPetSeen.current = true;
    try {
      seen ||= localStorage.getItem(firstOwnPetSeen) === "1";
      localStorage.setItem(firstOwnPetSeen, "1");
    } catch { /* Storage is optional. */ }
    if (seen || enabled) return;
    promptPending(true); setMandatory(true); setMode("enable"); setError(""); setNotice("");
  }

  async function enable() {
    if (running.current) return;
    running.current = true; revision.current++; setBusy(true); setError(""); setNotice("");
    try {
      if (!window.isSecureContext) throw new Error("Этот адрес открыт по HTTP. Браузер блокирует push-уведомления на HTTP-адресах локальной сети. Откройте сайт по HTTPS, чтобы подключить уведомления.");
      if (!supported()) throw new Error("Для push нужен поддерживаемый браузер и HTTPS. На iPhone/iPad добавьте Dogmeet на экран «Домой» через «Поделиться» в Safari, затем откройте его оттуда (iOS/iPadOS 16.4 или новее).");
      // Request permission directly in the button handler, before any asynchronous work.
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission === "denied") throw new Error(permissionHelp);
      if (permission !== "granted") throw new Error("Разрешение не получено. Нажмите «Подключить» и разрешите уведомления браузера.");
      const config = await requestJson<{ publicKey: string; configured: boolean }>("/api/push", { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!config.configured) throw new Error("Push-уведомления пока не настроены на сервере. Повторите попытку позже.");
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      let readyTimer: ReturnType<typeof setTimeout> | undefined;
      const registration = await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, reject) => {
        readyTimer = setTimeout(() => reject(new Error("Не удалось запустить службу уведомлений. Повторите попытку.")), 15000);
      })]).finally(() => clearTimeout(readyTimer));
      let subscription = await registration.pushManager.getSubscription();
      const bytes = publicKeyBytes(config.publicKey);
      if (subscription?.options.applicationServerKey && !equalKey(subscription.options.applicationServerKey, bytes)) {
        await pushRequest({ action: "disable", endpoint: subscription.endpoint });
        if (!await subscription.unsubscribe()) throw new Error("Не удалось обновить ключ уведомлений. Повторите попытку.");
        subscription = null;
      }
      subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
      let status;
      try { status = await pushRequest({ action: "subscribe", subscription: subscription.toJSON() }); }
      catch (error) {
        if (!(error instanceof ApiRequestError) || error.status !== 409) throw error;
        // A cleared session cookie can leave this browser's old subscription behind.
        if (!await subscription.unsubscribe()) throw new Error("Не удалось удалить подписку прежней сессии. Повторите попытку.");
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
        status = await pushRequest({ action: "subscribe", subscription: subscription.toJSON() });
      }
      if (!status.enabled) throw new Error("Сервер не подтвердил подписку. Повторите попытку.");
      setEnabled(true); setChecked(true); setMode(null); setMandatory(false); promptPending(false);
      setNotice("Push-уведомления подключены в этом браузере.");
    } catch (error) { setError(error instanceof Error ? error.message : "Не удалось подключить уведомления. Повторите попытку."); }
    finally { running.current = false; setBusy(false); }
  }

  async function disable() {
    if (running.current) return;
    running.current = true; revision.current++; setBusy(true); setError(""); setNotice("");
    let serverDisabled = false;
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await pushRequest({ action: "disable", endpoint: subscription.endpoint });
        serverDisabled = true; setEnabled(false); setChecked(true);
        if (!await subscription.unsubscribe()) throw new Error("Подписка осталась в браузере.");
      }
      setEnabled(false); setChecked(true); setMode(null); setNotice("Push-уведомления отключены в этом браузере.");
    } catch {
      if (serverDisabled) { setMode(null); setNotice("Доставка отключена на сервере. Браузер не удалил подписку; повторное включение доступно через меню."); }
      else setError("Не удалось отключить доставку на сервере. Подписка сохранена; повторите попытку.");
    } finally { running.current = false; setBusy(false); }
  }

  function openSettings() {
    if (running.current) return;
    setError(""); setNotice("");
    if (enabled) setMode("disable");
    else setMode("enable");
  }

  return { enabled, checked, mode, mandatory, busy, error, notice, offer, enable, disable, openSettings,
    dismiss: () => { if (!running.current && !mandatory) setMode(null); } };
}

function equalKey(key: ArrayBuffer, expected: Uint8Array) {
  const actual = new Uint8Array(key);
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function publicKeyBytes(key: string) {
  return Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));
}
