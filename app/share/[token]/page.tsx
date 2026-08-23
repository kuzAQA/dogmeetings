"use client";

import { ArrowLeft, ChevronDown, Compass, Dog, EllipsisVertical, Share2, UserRound, X } from "lucide-react";
import Image from "next/image";
import { use, useEffect, useRef, useState } from "react";

type SharedPet = {
  id: string;
  name: string;
  breed: string;
  ownerName: string;
  photoUrl: string;
};

type ShareStage = "guide" | "checking" | "preview" | "already-added" | "error";
type GuidePlatform = "ios" | "android";

async function ensureClientSession() {
  const current = await fetch("/api/session", { cache: "no-store" });
  if (current.ok) return;
  if (current.status !== 401) throw new Error("Не удалось восстановить сессию.");

  const created = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  if (!created.ok) {
    const data = await created.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || "Браузер не сохранил безопасную сессию.");
  }
}

export default function SharedPetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [pet, setPet] = useState<SharedPet | null>(null);
  const [stage, setStage] = useState<ShareStage>("guide");
  const [guidePlatform, setGuidePlatform] = useState<GuidePlatform>("ios");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [linkInactive, setLinkInactive] = useState(false);
  const guidePlatformSelected = useRef(false);

  useEffect(() => {
    if (guidePlatformSelected.current) return;
    const isIPadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    setGuidePlatform(/Android/i.test(navigator.userAgent) && !isIPadOs ? "android" : "ios");
  }, []);

  function selectGuidePlatform(platform: GuidePlatform) {
    guidePlatformSelected.current = true;
    setGuidePlatform(platform);
  }

  async function continueFromBrowserGuide() {
    setStage("checking");
    setError("");
    setLinkInactive(false);
    try {
      await ensureClientSession();
      const response = await fetch(`/api/pet-shares/${encodeURIComponent(token)}`, { cache: "no-store" });
      const data = await response.json() as { pet?: SharedPet; alreadyAdded?: boolean; inactive?: boolean; error?: string };
      if (data.inactive || response.status === 410) setLinkInactive(true);
      if (!response.ok || !data.pet) throw new Error(data.error || "Ссылка недействительна.");
      setPet(data.pet);
      setStage(data.alreadyAdded ? "already-added" : "preview");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось открыть питомца.");
      setStage("error");
    }
  }

  async function acceptPet() {
    if (!pet || adding) return;
    setAdding(true);
    setError("");
    try {
      await ensureClientSession();
      const response = await fetch(`/api/pet-shares/${encodeURIComponent(token)}`, { method: "POST" });
      const data = await response.json() as { petId?: string; added?: boolean; alreadyAdded?: boolean; inactive?: boolean; error?: string };
      if (data.inactive || response.status === 410) setLinkInactive(true);
      if (!response.ok || !data.petId) throw new Error(data.error || "Не удалось добавить питомца.");
      if (data.alreadyAdded) {
        setStage("already-added");
        setAdding(false);
        return;
      }
      window.location.replace(`/?sharedPet=${encodeURIComponent(data.petId)}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось добавить питомца.");
      setAdding(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="app-shell shared-pet-page" aria-label="Добавление питомца по ссылке">
        {stage === "guide" && (
          <div className="screen browser-guide-screen shared-pet-browser-guide">
            <button className="icon-button back-button" type="button" aria-label="Назад на главную" onClick={() => window.location.replace("/")}>
              <ArrowLeft />
            </button>
            <div className="screen-heading browser-guide-heading">
              <h1>Откройте сайт в браузере</h1>
              <p>Если ссылка открылась внутри Telegram или другого мессенджера, перейдите в обычный браузер</p>
            </div>
            <div className="browser-guide-content">
              <div className="browser-guide-platforms" role="group" aria-label="Выберите устройство">
                <span className="filter-indicator browser-guide-platform-indicator" aria-hidden="true" style={{ left: guidePlatform === "ios" ? "var(--space-1)" : "50%" }} />
                <button className={`filter-button browser-guide-platform-button ${guidePlatform === "ios" ? "is-active" : ""}`} type="button" aria-pressed={guidePlatform === "ios"} onClick={() => selectGuidePlatform("ios")}><span>iPhone</span></button>
                <button className={`filter-button browser-guide-platform-button ${guidePlatform === "android" ? "is-active" : ""}`} type="button" aria-pressed={guidePlatform === "android"} onClick={() => selectGuidePlatform("android")}><span>Android</span></button>
              </div>
              {guidePlatform === "ios" ? (
                <section className="browser-tip-card browser-tip-card--ios">
                  <div className="browser-tip-copy">
                    <span className="browser-tip-number" aria-hidden="true">1</span>
                    <div><h2>Откройте в Safari</h2><p>Нажмите значок компаса внизу предварительного окна</p></div>
                  </div>
                  <div className="browser-preview browser-preview--ios" aria-hidden="true">
                    <span className="browser-preview-label">Нажмите сюда</span>
                    <span className="browser-preview-arrow browser-preview-arrow--down" />
                    <span className="browser-preview-action"><Compass /></span>
                  </div>
                </section>
              ) : (
                <section className="browser-tip-card browser-tip-card--android">
                  <div className="browser-preview browser-preview--android" aria-hidden="true">
                    <div className="android-inapp-toolbar">
                      <span className="android-status-time">11:29</span>
                      <span className="android-status-icons">● ◒ ▮</span>
                      <span className="android-toolbar-actions"><X /><ChevronDown /></span>
                      <span className="android-toolbar-identity"><strong>Гулять вместе</strong><small>dogmeet.ru</small></span>
                      <Share2 className="android-toolbar-share" />
                      <span className="browser-preview-action"><EllipsisVertical /></span>
                    </div>
                    <span className="browser-preview-label">Нажмите сюда</span>
                    <span className="browser-preview-arrow browser-preview-arrow--android" />
                  </div>
                  <div className="browser-tip-copy">
                    <span className="browser-tip-number" aria-hidden="true">1</span>
                    <div><h2>Откройте в браузере</h2><p>Нажмите три точки справа сверху, затем выберите «Открыть в браузере»</p></div>
                  </div>
                </section>
              )}
            </div>
            <p className="browser-guide-note">Если сайт уже открыт в Safari или Chrome,<br />просто продолжите</p>
            <button className="primary-button browser-guide-continue" type="button" onClick={continueFromBrowserGuide}>Продолжить</button>
          </div>
        )}

        {stage === "checking" && (
          <div className="share-page-status" role="status">
            <span className="saving-spinner" aria-hidden="true" />
            <p>Загружаем</p>
          </div>
        )}

        {stage === "preview" && pet && (
          <>
            <button className="icon-button back-button" type="button" aria-label="Отказаться и вернуться на главную" onClick={() => window.location.replace("/")}>
              <ArrowLeft />
            </button>
          <div className="shared-pet-content">
            <div className="screen-heading shared-pet-heading">
              <h1>С вами поделились питомцем!</h1>
              <p>Хотите добавить его к себе?</p>
            </div>
            <article className="shared-pet-preview">
              <Image src={pet.photoUrl} alt={`Питомец ${pet.name}`} width={112} height={112} unoptimized />
              <span className="shared-pet-preview-info">
                <strong>{pet.name}</strong>
                <small><Dog aria-hidden="true" />{pet.breed}</small>
                <small><UserRound aria-hidden="true" />{pet.ownerName}</small>
              </span>
            </article>
            {error && <p className="form-error shared-pet-error" role="alert">{error}</p>}
            <div className="shared-pet-actions">
              <button className="primary-button" type="button" disabled={adding} onClick={acceptPet}>
                {adding ? "Добавляем…" : "Добавить"}
              </button>
              <button className="decline-share-button" type="button" disabled={adding} onClick={() => window.location.replace("/")}>
                Отказаться
              </button>
            </div>
          </div>
          </>
        )}

        {stage === "error" && (
          <div className="share-page-status share-page-status--error">
            <h1>{linkInactive ? "Ссылка неактивна" : "Ссылка недействительна"}</h1>
            <p>{linkInactive ? "По этой ссылке питомец уже добавлен" : (error || "Владелец мог получить новую ссылку.")}</p>
            <button className="primary-button" type="button" onClick={() => window.location.replace("/")}>На главную</button>
          </div>
        )}

        {stage === "already-added" && pet && (
          <div className="information-overlay">
            <section className="information-dialog shared-pet-already-added-dialog" role="alertdialog" aria-modal="true" aria-describedby="shared-pet-already-added-description">
              <Image className="shared-pet-already-added-photo" src={pet.photoUrl} alt={`Питомец ${pet.name}`} width={80} height={80} unoptimized />
              <p id="shared-pet-already-added-description">{pet.name} уже добавлен в ваш список питомцев</p>
              <button className="primary-button" type="button" onClick={() => window.location.replace("/")}>Хорошо</button>
            </section>
          </div>
        )}

        {adding && (
          <div className="saving-overlay" role="status" aria-live="polite">
            <span className="saving-spinner" aria-hidden="true" />
            <p>Добавляем питомца</p>
          </div>
        )}
      </section>
    </main>
  );
}
