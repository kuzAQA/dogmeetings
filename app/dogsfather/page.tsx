"use client";

import { Bell, BellOff, BellRing, Check, House, LogOut, MapPin, ShieldCheck, Trash2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

type LocationRequest = {
  id: string;
  city: string;
  district: string;
  complex: string;
  createdAt: string;
};

type PendingAction = {
  request: LocationRequest;
  type: "approve" | "reject";
};

type LoginChallenge = {
  challenge?: string;
  iterations?: number;
  salt?: string;
  error?: string;
};

type NotificationStatus = "checking" | "off" | "on" | "denied" | "unsupported" | "busy";

const loginEncoder = new TextEncoder();

function loginBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function loginBase64UrlBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function createLoginProof(
  username: string,
  password: string,
  challenge: Required<Pick<LoginChallenge, "challenge" | "iterations" | "salt">>
) {
  const accountHash = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    loginEncoder.encode(username.normalize("NFKC").trim())
  ));
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    loginEncoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const verifier = new Uint8Array(await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: loginBase64UrlBytes(challenge.salt),
      iterations: challenge.iterations
    },
    passwordKey,
    256
  ));
  const proofKey = await crypto.subtle.importKey(
    "raw",
    verifier,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const proof = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    proofKey,
    loginEncoder.encode(`dogmeet-login:v1:${challenge.challenge}`)
  ));

  verifier.fill(0);
  return { accountHash: loginBase64Url(accountHash), proof: loginBase64Url(proof) };
}

function formatRequestDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export default function AdminPage() {
  const [phase, setPhase] = useState<"checking" | "login" | "requests">("checking");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [requests, setRequests] = useState<LocationRequest[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [notificationStatus, setNotificationStatus] = useState<NotificationStatus>("checking");
  const [notificationHint, setNotificationHint] = useState("");

  const loadRequests = useCallback(async () => {
    const response = await fetch("/api/dogsfather/location-requests", {
      cache: "no-store",
      credentials: "same-origin"
    });
    if (response.status === 401) {
      setPhase("login");
      return;
    }
    const payload = await response.json().catch(() => null) as { requests?: LocationRequest[]; error?: string } | null;
    if (!response.ok) throw new Error(payload?.error || "Не удалось загрузить заявки.");
    setRequests(payload?.requests ?? []);
    setPhase("requests");
  }, []);

  useEffect(() => {
    let active = true;
    void fetch("/api/dogsfather/session", { cache: "no-store", credentials: "same-origin" })
      .then((response) => response.json())
      .then(async (payload: { authenticated?: boolean }) => {
        if (!active) return;
        if (!payload.authenticated) {
          setPhase("login");
          return;
        }
        await loadRequests();
      })
      .catch(() => {
        if (active) {
          setError("Не удалось проверить сессию администратора.");
          setPhase("login");
        }
      });
    return () => { active = false; };
  }, [loadRequests]);

  const savePushSubscription = useCallback(async (subscription: PushSubscription) => {
    const response = await fetch("/api/dogsfather/push-subscriptions", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON())
    });
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) throw new Error(payload?.error || "Не удалось включить уведомления.");
  }, []);

  useEffect(() => {
    if (phase !== "requests") return;
    let active = true;
    async function syncNotificationSubscription() {
      await Promise.resolve();
      if (!active) return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setNotificationStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setNotificationStatus("denied");
        return;
      }
      try {
        await navigator.serviceWorker.register("/admin-push-sw.js", { scope: "/" });
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!active) return;
        if (!subscription) {
          setNotificationStatus("off");
          return;
        }
        await savePushSubscription(subscription);
        if (active) setNotificationStatus("on");
      } catch {
        if (active) setNotificationStatus("off");
      }
    }
    void syncNotificationSubscription();
    return () => { active = false; };
  }, [phase, savePushSubscription]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password) return;
    setSubmitting(true);
    setError("");
    try {
      const challengeResponse = await fetch("/api/dogsfather/challenge", {
        cache: "no-store",
        credentials: "same-origin"
      });
      const challengePayload = await challengeResponse.json().catch(() => null) as LoginChallenge | null;
      if (
        !challengeResponse.ok
        || !challengePayload?.challenge
        || !challengePayload.salt
        || !Number.isSafeInteger(challengePayload.iterations)
      ) {
        throw new Error(challengePayload?.error || "Не удалось подготовить защищённый вход.");
      }
      const credentialsProof = await createLoginProof(username, password, {
        challenge: challengePayload.challenge,
        iterations: challengePayload.iterations!,
        salt: challengePayload.salt
      });
      setPassword("");
      const response = await fetch("/api/dogsfather/session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentialsProof)
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Не удалось выполнить вход.");
      await loadRequests();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Не удалось выполнить вход.");
    } finally {
      setSubmitting(false);
    }
  }

  async function signOut() {
    await disableNotifications().catch(() => undefined);
    await fetch("/api/dogsfather/session", { method: "DELETE", credentials: "same-origin" });
    setRequests([]);
    setUsername("");
    setPassword("");
    setPhase("login");
  }

  async function disableNotifications() {
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) {
      setNotificationStatus("off");
      return;
    }
    await fetch("/api/dogsfather/push-subscriptions", {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint })
    });
    await subscription.unsubscribe();
    setNotificationStatus("off");
  }

  async function toggleNotifications() {
    if (notificationStatus === "busy" || notificationStatus === "checking") return;
    setNotificationHint("");
    setNotificationStatus("busy");
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setNotificationStatus("unsupported");
        setNotificationHint("Этот браузер не поддерживает push-уведомления.");
        return;
      }
      if (notificationStatus === "on") {
        await disableNotifications();
        return;
      }
      const permission = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
      if (permission !== "granted") {
        setNotificationStatus(permission === "denied" ? "denied" : "off");
        setNotificationHint("Разрешите уведомления в настройках браузера. На iPhone сайт должен быть добавлен на экран «Домой».");
        return;
      }
      const keyResponse = await fetch("/api/dogsfather/push-subscriptions", {
        cache: "no-store",
        credentials: "same-origin"
      });
      const keyPayload = await keyResponse.json().catch(() => null) as { publicKey?: string; error?: string } | null;
      if (!keyResponse.ok || !keyPayload?.publicKey) {
        throw new Error(keyPayload?.error || "Уведомления ещё не настроены на сервере.");
      }
      await navigator.serviceWorker.register("/admin-push-sw.js", { scope: "/" });
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: loginBase64UrlBytes(keyPayload.publicKey)
      });
      await savePushSubscription(subscription);
      setNotificationStatus("on");
      setNotificationHint("Уведомления о новых заявках включены.");
    } catch (notificationError) {
      setNotificationStatus("off");
      setNotificationHint(notificationError instanceof Error
        ? notificationError.message
        : "Не удалось включить уведомления.");
    }
  }

  async function confirmAction() {
    if (!pendingAction) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/dogsfather/location-requests", {
        method: pendingAction.type === "approve" ? "PATCH" : "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pendingAction.request.id })
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Не удалось обработать заявку.");
      setRequests((current) => current.filter((item) => item.id !== pendingAction.request.id));
      setPendingAction(null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось обработать заявку.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="admin-page">
      <section className="admin-shell">
        {phase === "checking" && (
          <div className="admin-checking" aria-live="polite">
            <span className="saving-spinner" aria-hidden="true" />
            <p>Проверяем защищённую сессию…</p>
          </div>
        )}

        {phase === "login" && (
          <div className="admin-login-screen">
            <div className="admin-login-heading">
              <span className="admin-shield" aria-hidden="true"><ShieldCheck /></span>
              <h1>Авторизация</h1>
              <p>Введите данные доступа</p>
            </div>
            <form className="admin-login-form" onSubmit={signIn} noValidate>
              <label className="field text-field">
                <span>Логин</span>
                <input
                  autoComplete="username"
                  maxLength={128}
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Введите логин"
                />
              </label>
              <label className="field text-field">
                <span>Пароль</span>
                <input
                  type="password"
                  autoComplete="current-password"
                  maxLength={256}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Введите пароль"
                />
              </label>
              {error && <p className="error-message" role="alert">{error}</p>}
              <button className="primary-button admin-login-submit" type="submit" disabled={!username.trim() || !password || submitting}>
                {submitting ? "Входим…" : "Войти"}
              </button>
            </form>
          </div>
        )}

        {phase === "requests" && (
          <div className="admin-requests-screen">
            <header className="admin-requests-heading">
              <div>
                <h1>Заявки</h1>
                <p>Новые локации от пользователей</p>
              </div>
              <div className="admin-header-actions">
                <button
                  className={`admin-header-button admin-notification-button ${notificationStatus === "on" ? "active" : ""}`}
                  type="button"
                  onClick={toggleNotifications}
                  disabled={notificationStatus === "busy" || notificationStatus === "checking"}
                  aria-label={notificationStatus === "on" ? "Отключить уведомления" : "Включить уведомления"}
                  title={notificationStatus === "on" ? "Отключить уведомления" : "Включить уведомления"}
                >
                  {notificationStatus === "on" ? <BellRing /> : notificationStatus === "denied" || notificationStatus === "unsupported" ? <BellOff /> : <Bell />}
                </button>
                <form className="admin-home-form" action="/" method="get">
                  <button className="admin-header-button" type="submit" aria-label="Перейти на главную страницу" title="На главную">
                    <House />
                  </button>
                </form>
                <button className="admin-header-button" type="button" onClick={signOut} aria-label="Выйти из панели администратора" title="Выйти">
                  <LogOut />
                </button>
              </div>
            </header>
            {notificationHint && <p className="admin-notification-hint" role="status">{notificationHint}</p>}
            {error && <p className="error-message" role="alert">{error}</p>}
            <div className="admin-request-list">
              {requests.length === 0 && <p className="admin-empty">Новых заявок пока нет</p>}
              {requests.map((item) => (
                <article className="admin-request-card" key={item.id}>
                  <span className="admin-request-icon" aria-hidden="true"><MapPin /></span>
                  <div className="admin-request-info">
                    <strong>{item.city}</strong>
                    <span>{item.district}</span>
                    <span className="admin-request-complex"><House />{item.complex}</span>
                    <small>{formatRequestDate(item.createdAt)}</small>
                  </div>
                  <div className="admin-request-actions">
                    <button type="button" className="admin-approve-button" onClick={() => setPendingAction({ request: item, type: "approve" })}>
                      <Check /> <span>Добавить</span>
                    </button>
                    <button type="button" className="admin-reject-button" onClick={() => setPendingAction({ request: item, type: "reject" })}>
                      <Trash2 /> <span>Отклонить</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {pendingAction && (
          <div className="delete-confirm-overlay" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget && !submitting) setPendingAction(null);
          }}>
            <section className="delete-confirm admin-confirm" role="alertdialog" aria-modal="true" aria-labelledby="admin-confirm-title">
              <h2 id="admin-confirm-title">
                {pendingAction.type === "approve" ? "Добавить локацию?" : "Отклонить заявку?"}
              </h2>
              <p>
                {pendingAction.type === "approve"
                  ? `${pendingAction.request.city}, ${pendingAction.request.district}, ${pendingAction.request.complex} появится в общем списке`
                  : "Заявка будет удалена без добавления локации"}
              </p>
              {error && <p className="delete-confirm-error" role="alert">{error}</p>}
              <div className="delete-confirm-actions">
                <button
                  className={pendingAction.type === "approve" ? "admin-confirm-approve" : "delete-confirm-button"}
                  type="button"
                  disabled={submitting}
                  onClick={confirmAction}
                >
                  {submitting ? "Подождите…" : pendingAction.type === "approve" ? "Добавить" : "Отклонить"}
                </button>
                <button className="keep-walk-button" type="button" disabled={submitting} onClick={() => setPendingAction(null)}>
                  Отмена
                </button>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
