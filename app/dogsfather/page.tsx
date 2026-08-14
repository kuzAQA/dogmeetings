"use client";

import Image from "next/image";
import {
  ArrowLeft,
  Bell,
  BellOff,
  BellRing,
  Camera,
  Check,
  ChevronRight,
  ClipboardList,
  Dog,
  House,
  LogOut,
  MapPin,
  Pencil,
  ShieldCheck,
  Trash2,
  UserRound
} from "lucide-react";
import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from "react";

type AdminPhase = "checking" | "login" | "dashboard" | "requests" | "pets" | "edit-pet";

type LocationRequest = {
  id: string;
  city: string;
  district: string;
  complex: string;
  createdAt: string;
};

type AdminPet = {
  id: string;
  name: string;
  breed: string;
  ownerName: string;
  photoUrl: string;
  createdAt: string;
  updatedAt: string;
};

type PendingRequestAction = {
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
const allowedPhotoTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SOURCE_PHOTO_SIZE = 10 * 1024 * 1024;
const MAX_COMPRESSED_PHOTO_SIZE = 700 * 1024;
const MAX_PHOTO_DIMENSION = 1024;
const containsLetter = /\p{L}/u;

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

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Не удалось обработать фотографию."));
    }, type, quality);
  });
}

async function compressPetPhoto(file: File) {
  const sourceUrl = URL.createObjectURL(file);
  const image = new window.Image();
  image.decoding = "async";
  image.src = sourceUrl;

  try {
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error("Не удалось определить размер фотографии.");
    }

    if (
      file.type === "image/webp"
      && file.size <= MAX_COMPRESSED_PHOTO_SIZE
      && Math.max(image.naturalWidth, image.naturalHeight) <= MAX_PHOTO_DIMENSION
    ) {
      return file;
    }

    const initialScale = Math.min(1, MAX_PHOTO_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
    let width = Math.max(1, Math.round(image.naturalWidth * initialScale));
    let height = Math.max(1, Math.round(image.naturalHeight * initialScale));
    let smallestBlob: Blob | null = null;
    const canvas = document.createElement("canvas");

    for (let resizeAttempt = 0; resizeAttempt < 4; resizeAttempt += 1) {
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Браузер не смог обработать фотографию.");

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);

      for (const quality of [0.82, 0.74, 0.66, 0.58]) {
        let blob = await canvasToBlob(canvas, "image/webp", quality);
        if (blob.type !== "image/webp") blob = await canvasToBlob(canvas, "image/jpeg", quality);
        if (!smallestBlob || blob.size < smallestBlob.size) smallestBlob = blob;
        if (blob.size <= MAX_COMPRESSED_PHOTO_SIZE) {
          const extension = blob.type === "image/webp" ? "webp" : "jpg";
          return new File([blob], `pet-photo.${extension}`, { type: blob.type, lastModified: Date.now() });
        }
      }

      width = Math.max(1, Math.round(width * 0.8));
      height = Math.max(1, Math.round(height * 0.8));
    }

    if (!smallestBlob || smallestBlob.size > MAX_COMPRESSED_PHOTO_SIZE) {
      throw new Error("Не удалось достаточно сжать фотографию. Выберите другое изображение.");
    }
    const extension = smallestBlob.type === "image/webp" ? "webp" : "jpg";
    return new File([smallestBlob], `pet-photo.${extension}`, { type: smallestBlob.type, lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export default function AdminPage() {
  const [phase, setPhase] = useState<AdminPhase>("checking");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [requests, setRequests] = useState<LocationRequest[]>([]);
  const [pets, setPets] = useState<AdminPet[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [contentLoading, setContentLoading] = useState(false);
  const [pendingRequestAction, setPendingRequestAction] = useState<PendingRequestAction | null>(null);
  const [petPendingDelete, setPetPendingDelete] = useState<AdminPet | null>(null);
  const [petBeingEdited, setPetBeingEdited] = useState<AdminPet | null>(null);
  const [petName, setPetName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [breed, setBreed] = useState("");
  const [petPhoto, setPetPhoto] = useState<File | null>(null);
  const [petPhotoPreview, setPetPhotoPreview] = useState("");
  const [petPhotoObjectUrl, setPetPhotoObjectUrl] = useState("");
  const [notificationStatus, setNotificationStatus] = useState<NotificationStatus>("checking");
  const [notificationHint, setNotificationHint] = useState("");

  const returnToLogin = useCallback(() => {
    setPhase("login");
    setRequests([]);
    setPets([]);
  }, []);

  const loadRequests = useCallback(async () => {
    setContentLoading(true);
    setError("");
    try {
      const response = await fetch("/api/dogsfather/location-requests", {
        cache: "no-store",
        credentials: "same-origin"
      });
      if (response.status === 401) {
        returnToLogin();
        return;
      }
      const payload = await response.json().catch(() => null) as { requests?: LocationRequest[]; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Не удалось загрузить заявки.");
      setRequests(payload?.requests ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить заявки.");
    } finally {
      setContentLoading(false);
    }
  }, [returnToLogin]);

  const loadPets = useCallback(async () => {
    setContentLoading(true);
    setError("");
    try {
      const response = await fetch("/api/dogsfather/pets", {
        cache: "no-store",
        credentials: "same-origin"
      });
      if (response.status === 401) {
        returnToLogin();
        return;
      }
      const payload = await response.json().catch(() => null) as { pets?: AdminPet[]; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Не удалось загрузить питомцев.");
      setPets(payload?.pets ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить питомцев.");
    } finally {
      setContentLoading(false);
    }
  }, [returnToLogin]);

  useEffect(() => {
    let active = true;
    void fetch("/api/dogsfather/session", { cache: "no-store", credentials: "same-origin" })
      .then((response) => response.json())
      .then((payload: { authenticated?: boolean }) => {
        if (!active) return;
        setPhase(payload.authenticated ? "dashboard" : "login");
      })
      .catch(() => {
        if (active) {
          setError("Не удалось проверить сессию администратора.");
          setPhase("login");
        }
      });
    return () => { active = false; };
  }, []);

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
    if (phase === "checking" || phase === "login") return;
    let active = true;
    async function syncNotificationSubscription() {
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

  useEffect(() => () => {
    if (petPhotoObjectUrl) URL.revokeObjectURL(petPhotoObjectUrl);
  }, [petPhotoObjectUrl]);

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
      setPhase("dashboard");
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
    setPets([]);
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
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
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
      setNotificationHint(notificationError instanceof Error ? notificationError.message : "Не удалось включить уведомления.");
    }
  }

  function openRequests() {
    setPhase("requests");
    void loadRequests();
  }

  function openPets() {
    setPhase("pets");
    void loadPets();
  }

  function openPetEditor(pet: AdminPet) {
    if (petPhotoObjectUrl) URL.revokeObjectURL(petPhotoObjectUrl);
    setPetPhotoObjectUrl("");
    setPetPhoto(null);
    setPetPhotoPreview(pet.photoUrl);
    setPetBeingEdited(pet);
    setPetName(pet.name);
    setOwnerName(pet.ownerName);
    setBreed(pet.breed);
    setError("");
    setPhase("edit-pet");
  }

  function closePetEditor() {
    if (petPhotoObjectUrl) URL.revokeObjectURL(petPhotoObjectUrl);
    setPetPhotoObjectUrl("");
    setPetPhoto(null);
    setPetPhotoPreview("");
    setPetBeingEdited(null);
    setError("");
    setPhase("pets");
  }

  function handleAdminPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError("");
    if (!file) return;
    if (!allowedPhotoTypes.has(file.type)) {
      setError("Выберите изображение в формате JPEG, PNG или WebP.");
      return;
    }
    if (file.size > MAX_SOURCE_PHOTO_SIZE) {
      setError("Исходная фотография должна быть меньше 10 МБ.");
      return;
    }
    if (petPhotoObjectUrl) URL.revokeObjectURL(petPhotoObjectUrl);
    const objectUrl = URL.createObjectURL(file);
    setPetPhotoObjectUrl(objectUrl);
    setPetPhotoPreview(objectUrl);
    setPetPhoto(file);
  }

  async function confirmRequestAction() {
    if (!pendingRequestAction) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/dogsfather/location-requests", {
        method: pendingRequestAction.type === "approve" ? "PATCH" : "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pendingRequestAction.request.id })
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (response.status === 401) {
        returnToLogin();
        setPendingRequestAction(null);
        return;
      }
      if (!response.ok) throw new Error(payload?.error || "Не удалось обработать заявку.");
      setRequests((current) => current.filter((item) => item.id !== pendingRequestAction.request.id));
      setPendingRequestAction(null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось обработать заявку.");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveAdminPet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!petBeingEdited || submitting) return;
    if (!containsLetter.test(petName.trim()) || !containsLetter.test(ownerName.trim()) || !containsLetter.test(breed.trim())) {
      setError("Заполните имя питомца, имя хозяина и породу.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const formData = new FormData();
      formData.set("petId", petBeingEdited.id);
      formData.set("petName", petName);
      formData.set("ownerName", ownerName);
      formData.set("breed", breed);
      if (petPhoto) {
        const compressedPhoto = await compressPetPhoto(petPhoto);
        formData.set("photo", compressedPhoto, compressedPhoto.name);
      }

      const response = await fetch("/api/dogsfather/pets", {
        method: "PATCH",
        credentials: "same-origin",
        body: formData
      });
      const payload = await response.json().catch(() => null) as { pet?: AdminPet; error?: string } | null;
      if (response.status === 401) {
        returnToLogin();
        return;
      }
      if (!response.ok || !payload?.pet) throw new Error(payload?.error || "Не удалось сохранить питомца.");
      setPets((current) => current.map((pet) => pet.id === payload.pet!.id ? payload.pet! : pet));
      closePetEditor();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить питомца.");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmPetDelete() {
    if (!petPendingDelete || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/dogsfather/pets", {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ petId: petPendingDelete.id })
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (response.status === 401) {
        returnToLogin();
        setPetPendingDelete(null);
        return;
      }
      if (!response.ok) throw new Error(payload?.error || "Не удалось удалить питомца.");
      setPets((current) => current.filter((pet) => pet.id !== petPendingDelete.id));
      setPetPendingDelete(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить питомца.");
    } finally {
      setSubmitting(false);
    }
  }

  function adminHeaderActions() {
    return (
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
    );
  }

  function sectionHeading(title: string, subtitle: string, showBack = false) {
    return (
      <header className={`admin-screen-heading ${showBack ? "has-back" : ""}`}>
        {showBack && (
          <button className="admin-section-back" type="button" onClick={() => { setError(""); setPhase("dashboard"); }} aria-label="Назад к разделам">
            <ArrowLeft />
          </button>
        )}
        <div className="admin-heading-copy">
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {adminHeaderActions()}
      </header>
    );
  }

  const petFormIsValid = containsLetter.test(petName.trim())
    && containsLetter.test(ownerName.trim())
    && containsLetter.test(breed.trim())
    && petName.trim().length <= 40
    && ownerName.trim().length <= 60
    && breed.trim().length <= 20;

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
                <input autoComplete="username" maxLength={128} value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Введите логин" />
              </label>
              <label className="field text-field">
                <span>Пароль</span>
                <input type="password" autoComplete="current-password" maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Введите пароль" />
              </label>
              {error && <p className="error-message" role="alert">{error}</p>}
              <button className="primary-button admin-login-submit" type="submit" disabled={!username.trim() || !password || submitting}>
                {submitting ? "Входим…" : "Войти"}
              </button>
            </form>
          </div>
        )}

        {phase === "dashboard" && (
          <div className="admin-dashboard-screen">
            {sectionHeading("Управление", "Выберите раздел")}
            {notificationHint && <p className="admin-notification-hint" role="status">{notificationHint}</p>}
            <nav className="admin-dashboard-menu" aria-label="Разделы панели администратора">
              <button type="button" onClick={openRequests}>
                <span className="admin-dashboard-icon"><ClipboardList /></span>
                <span><strong>Заявки</strong><small>Добавление новых локаций</small></span>
                <ChevronRight aria-hidden="true" />
              </button>
              <button type="button" onClick={openPets}>
                <span className="admin-dashboard-icon"><Dog /></span>
                <span><strong>Питомцы</strong><small>Все питомцы сайта</small></span>
                <ChevronRight aria-hidden="true" />
              </button>
            </nav>
          </div>
        )}

        {phase === "requests" && (
          <div className="admin-requests-screen admin-section-screen">
            {sectionHeading("Заявки", "Новые локации от пользователей", true)}
            {notificationHint && <p className="admin-notification-hint" role="status">{notificationHint}</p>}
            {error && <p className="error-message admin-section-error" role="alert">{error}</p>}
            <div className="admin-request-list" aria-busy={contentLoading}>
              {contentLoading && <div className="admin-content-loading"><span className="saving-spinner" /><span>Загружаем заявки…</span></div>}
              {!contentLoading && requests.length === 0 && !error && <p className="admin-empty">Новых заявок пока нет</p>}
              {!contentLoading && requests.map((item) => (
                <article className="admin-request-card" key={item.id}>
                  <span className="admin-request-icon" aria-hidden="true"><MapPin /></span>
                  <div className="admin-request-info">
                    <strong>{item.city}</strong>
                    <span>{item.district}</span>
                    <span className="admin-request-complex"><House />{item.complex}</span>
                    <small>{formatRequestDate(item.createdAt)}</small>
                  </div>
                  <div className="admin-request-actions">
                    <button type="button" className="admin-approve-button" onClick={() => setPendingRequestAction({ request: item, type: "approve" })}>
                      <Check /> <span>Добавить</span>
                    </button>
                    <button type="button" className="admin-reject-button" onClick={() => setPendingRequestAction({ request: item, type: "reject" })}>
                      <Trash2 /> <span>Отклонить</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {phase === "pets" && (
          <div className="admin-pets-screen admin-section-screen">
            {sectionHeading("Питомцы", "Все добавленные питомцы", true)}
            {error && <p className="error-message admin-section-error" role="alert">{error}</p>}
            <div className="admin-pet-list" aria-busy={contentLoading}>
              {contentLoading && <div className="admin-content-loading"><span className="saving-spinner" /><span>Загружаем питомцев…</span></div>}
              {!contentLoading && pets.length === 0 && !error && <p className="admin-empty">Добавленных питомцев пока нет</p>}
              {!contentLoading && pets.map((pet) => (
                <article className="admin-pet-card" key={pet.id}>
                  <Image className="admin-pet-photo" src={pet.photoUrl} alt={`Питомец ${pet.name}`} width={68} height={68} unoptimized />
                  <span className="admin-pet-info">
                    <strong>{pet.name}</strong>
                    <small><Dog aria-hidden="true" />{pet.breed}</small>
                    <small><UserRound aria-hidden="true" />{pet.ownerName}</small>
                  </span>
                  <span className="admin-pet-actions">
                    <button type="button" onClick={() => openPetEditor(pet)} aria-label={`Редактировать питомца ${pet.name}`} title="Редактировать">
                      <Pencil />
                    </button>
                    <button type="button" onClick={() => { setError(""); setPetPendingDelete(pet); }} aria-label={`Удалить питомца ${pet.name}`} title="Удалить">
                      <Trash2 />
                    </button>
                  </span>
                </article>
              ))}
            </div>
          </div>
        )}

        {phase === "edit-pet" && petBeingEdited && (
          <div className="admin-pet-edit-screen admin-section-screen">
            <button className="icon-button back-button admin-edit-back" type="button" onClick={closePetEditor} aria-label="Назад к питомцам">
              <ArrowLeft />
            </button>
            <div className="admin-edit-heading">
              <h1>Редактировать питомца</h1>
              <p>Обновите информацию о питомце</p>
            </div>
            <form className="admin-pet-edit-form" onSubmit={saveAdminPet} aria-busy={submitting} noValidate>
              <label className="admin-pet-photo-upload">
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAdminPhoto} aria-label="Выбрать новую фотографию питомца" />
                {petPhotoPreview ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={petPhotoPreview} alt="Предпросмотр фотографии питомца" />
                    <span>Нажмите, чтобы изменить фото</span>
                  </>
                ) : <Camera aria-hidden="true" />}
              </label>
              <label className="field text-field">
                <span>Имя питомца</span>
                <input value={petName} maxLength={40} onChange={(event) => { setPetName(event.target.value); setError(""); }} />
              </label>
              <label className="field text-field">
                <span>Имя хозяина</span>
                <input value={ownerName} maxLength={60} onChange={(event) => { setOwnerName(event.target.value); setError(""); }} />
              </label>
              <label className="field text-field">
                <span>Порода</span>
                <input value={breed} maxLength={20} onChange={(event) => { setBreed(event.target.value); setError(""); }} />
              </label>
              {error && <p className="error-message" role="alert">{error}</p>}
              <button className="primary-button admin-pet-save" type="submit" disabled={!petFormIsValid || submitting}>
                {submitting ? "Сохраняем…" : "Сохранить"}
              </button>
            </form>
          </div>
        )}

        {pendingRequestAction && (
          <div className="delete-confirm-overlay" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget && !submitting) setPendingRequestAction(null);
          }}>
            <section className="delete-confirm admin-confirm" role="alertdialog" aria-modal="true" aria-labelledby="admin-confirm-title">
              <h2 id="admin-confirm-title">{pendingRequestAction.type === "approve" ? "Добавить локацию?" : "Отклонить заявку?"}</h2>
              <p>{pendingRequestAction.type === "approve"
                ? `${pendingRequestAction.request.city}, ${pendingRequestAction.request.district}, ${pendingRequestAction.request.complex} появится в общем списке`
                : "Заявка будет удалена без добавления локации"}</p>
              {error && <p className="delete-confirm-error" role="alert">{error}</p>}
              <div className="delete-confirm-actions">
                <button className={pendingRequestAction.type === "approve" ? "admin-confirm-approve" : "delete-confirm-button"} type="button" disabled={submitting} onClick={confirmRequestAction}>
                  {submitting ? "Подождите…" : pendingRequestAction.type === "approve" ? "Добавить" : "Отклонить"}
                </button>
                <button className="keep-walk-button" type="button" disabled={submitting} onClick={() => setPendingRequestAction(null)}>Отмена</button>
              </div>
            </section>
          </div>
        )}

        {petPendingDelete && (
          <div className="delete-confirm-overlay" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget && !submitting) setPetPendingDelete(null);
          }}>
            <section className="delete-confirm admin-confirm" role="alertdialog" aria-modal="true" aria-labelledby="admin-pet-delete-title">
              <h2 id="admin-pet-delete-title">Удалить питомца?</h2>
              <p>Питомец «{petPendingDelete.name}» и связанные с ним прогулки будут удалены без возможности восстановления</p>
              {error && <p className="delete-confirm-error" role="alert">{error}</p>}
              <div className="delete-confirm-actions">
                <button className="delete-confirm-button" type="button" disabled={submitting} onClick={confirmPetDelete}>
                  {submitting ? "Удаляем…" : "Удалить"}
                </button>
                <button className="keep-walk-button" type="button" disabled={submitting} onClick={() => setPetPendingDelete(null)}>Оставить</button>
              </div>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
