"use client";

import { Clock3, GalleryHorizontalEnd, Menu, SlidersHorizontal, Sun, Sunrise, Sunset, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Announcement, AnnouncementsResponse } from "../../../lib/announcement-types";
import { telegramReconnectCampaignId } from "../../../lib/announcement-types";
import { DogmeetBrand, trapDialogTab } from "../../components/ui/DogmeetFrame";
import { BottomDockExample } from "../home/BottomDock";
import { ShareMenuRow } from "../../components/ui/ShareMenuRow";
import { MyPlacesMenuRow } from "../../components/ui/MyPlacesMenuRow";
import { ApiRequestError, requestJson } from "../api/client";

type TimedAnnouncement = Announcement & { deadline: number };
const reconnectSeenKey = `dogmeet.announcementSeen.${telegramReconnectCampaignId}`;

async function loadAnnouncements(information = false, reconnectOnly = false): Promise<TimedAnnouncement[]> {
  const started = performance.now();
  const data = await requestJson<AnnouncementsResponse>(`/api/announcements${information ? "?information=1" : ""}`, { cache: "no-store" });
  let reconnectSeen = false;
  try { reconnectSeen = localStorage.getItem(reconnectSeenKey) === "1"; } catch { /* Server receipts still prevent repeats when storage is blocked. */ }
  return data.banners.filter((banner) => (!reconnectOnly || banner.id === telegramReconnectCampaignId) && (information || !reconnectSeen || banner.id !== telegramReconnectCampaignId) && banner.id !== "pet-owner-contact-2026-10" && !banner.pages.some((page) => page.example === "pet-contact")).map((banner) => ({
    ...banner,
    // A slow response must shorten the remaining lifetime, never extend it.
    deadline: information || !banner.endsAt ? Infinity : started + Date.parse(banner.endsAt) - Date.parse(data.serverTime)
  })).filter((banner) => banner.deadline > performance.now());
}

export function AnnouncementPreview() {
  const [banners, setBanners] = useState<TimedAnnouncement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function open() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const active = await loadAnnouncements(true);
      if (active.length) setBanners(active);
      else setError("Пока нет информации.");
    } catch {
      setError("Не удалось загрузить баннер. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }
  return <>
    <button className="menu-row" type="button" aria-disabled={loading} aria-busy={loading} aria-label="Информация" onClick={() => { void open(); }}><GalleryHorizontalEnd aria-hidden="true" /><span><strong>{loading ? "Загружаем…" : "Информация"}</strong><small>Полезная информация</small></span></button>
    {error && <p className="field-error" role="status">{error}</p>}
    {banners.length > 0 && <AnnouncementDialog manual banners={banners} onDismiss={(ids) => setBanners((current) => current.filter((banner) => !ids.includes(banner.id)))} />}
  </>;
}

export function Announcements({ enabled, reconnectOnly = false }: { enabled: boolean; reconnectOnly?: boolean }) {
  const [banners, setBanners] = useState<TimedAnnouncement[]>([]);
  const dismissed = useRef(new Set<string>());
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let loading = false;
    const showAfter = performance.now() + 3000;
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        const banners = await loadAnnouncements(false, reconnectOnly);
        if (!active) return;
        setBanners(banners.filter((banner) => !dismissed.current.has(banner.id)));
      } catch (error) {
        if (active && error instanceof ApiRequestError && error.status === 401) setBanners([]);
      } finally {
        loading = false;
      }
    };
    const onVisible = () => { if (!document.hidden && performance.now() >= showAfter) void load(); };
    const delay = window.setTimeout(onVisible, 3000);
    const timer = window.setInterval(onVisible, 60_000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      active = false;
      window.clearTimeout(delay);
      window.clearInterval(timer);
      setBanners([]);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [enabled, reconnectOnly]);

  const dismiss = useCallback((ids: string[]) => {
    ids.forEach((id) => dismissed.current.add(id));
    setBanners((current) => current.filter((banner) => !ids.includes(banner.id) && banner.deadline > performance.now()));
  }, []);
  return enabled && banners.length > 0 ? <AnnouncementDialog banners={banners} onDismiss={dismiss} /> : null;
}

function AnnouncementDialog({ banners, onDismiss, manual = false }: { manual?: boolean; banners: TimedAnnouncement[]; onDismiss: (ids: string[]) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const savingRef = useRef(false);
  const [selectedSlide, setSelectedSlide] = useState<string | null>(null);
  const acknowledged = useRef(new Set<string>());
  const reconnectDisplayed = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pages = banners.flatMap((banner) => banner.pages.map((page, index) => ({ ...page, key: `${banner.id}:${index}` })));
  const pageIndex = Math.max(0, pages.findIndex((page) => page.key === selectedSlide));
  const lastPage = pageIndex === pages.length - 1;
  const reconnectVisible = pages[pageIndex]?.key.startsWith(`${telegramReconnectCampaignId}:`);
  const reconnectDeadline = banners.find(banner => banner.id === telegramReconnectCampaignId)?.deadline ?? 0;

  useEffect(() => {
    if (manual || !reconnectVisible) return;
    let frame = 0;
    let recording = false;
    const rememberDisplay = () => {
      if (document.hidden || recording || acknowledged.current.has(telegramReconnectCampaignId)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          if (document.hidden || !dialogRef.current?.open || performance.now() >= reconnectDeadline) return;
          reconnectDisplayed.current = true;
          try { localStorage.setItem(reconnectSeenKey, "1"); } catch { /* Persist through the trusted session below. */ }
          recording = true;
          void requestJson<{ acknowledged: boolean }>("/api/announcements", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: telegramReconnectCampaignId })
          }).then(result => {
            if (result.acknowledged) acknowledged.current.add(telegramReconnectCampaignId);
          }).catch(() => { /* Retry while the slide remains visible. */ }).finally(() => { recording = false; });
        });
      });
    };
    rememberDisplay();
    const retry = window.setInterval(rememberDisplay, 5000);
    document.addEventListener("visibilitychange", rememberDisplay);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(retry);
      document.removeEventListener("visibilitychange", rememberDisplay);
    };
  }, [manual, reconnectVisible, reconnectDeadline]);

  const touchStart = useRef<{ x: number; y: number } | null>(null);

  function goTo(index: number) {
    if (savingRef.current) return;
    setSelectedSlide(pages[Math.max(0, Math.min(pages.length - 1, index))].key);
  }

  useEffect(() => {
    let timer: number;
    const expire = () => {
      window.clearTimeout(timer);
      const now = performance.now();
      const expired = banners.filter((banner) => banner.deadline <= now);
      if (expired.length) onDismiss(expired.map((banner) => banner.id));
      else if (banners.some((banner) => Number.isFinite(banner.deadline))) timer = window.setTimeout(expire, Math.min(2_147_483_647, ...banners.map((banner) => banner.deadline - now)));
    };
    expire();
    document.addEventListener("visibilitychange", expire);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", expire);
    };
  }, [banners, onDismiss]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current!;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const { scrollX, scrollY } = window;
    const body = document.body;
    const previous = { position: body.style.position, top: body.style.top, left: body.style.left, width: body.style.width, overflow: body.style.overflow };
    Object.assign(body.style, { position: "fixed", top: `${-scrollY}px`, left: `${-scrollX}px`, width: "100%", overflow: "hidden" });
    dialog.showModal();
    dialog.scrollTop = 0;
    buttonRef.current?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      Object.assign(body.style, previous);
      window.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" });
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  useLayoutEffect(() => {
    const cards = Array.from(trackRef.current!.querySelectorAll<HTMLDivElement>(".announcement-card"));
    const fit = () => {
      for (const card of cards) {
        const content = card.querySelector<HTMLDivElement>(".announcement-content")!;
        const style = getComputedStyle(card);
        const available = Math.max(0, card.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom));
        content.style.minHeight = "0px";
        content.style.width = "100%";
        const naturalHeight = content.offsetHeight;
        const scale = Math.min(1, available / Math.max(1, naturalHeight));
        // Compensate for scaling so long slides keep the same horizontal insets.
        content.style.width = `${100 / Math.max(scale, Number.EPSILON)}%`;
        content.style.minHeight = `${Math.max(available, naturalHeight)}px`;
        content.style.setProperty("--announcement-content-scale", String(scale));
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    for (const card of cards) {
      observer.observe(card);
      observer.observe(card.querySelector(".announcement-content")!);
    }
    return () => observer.disconnect();
  }, [banners]);

  async function advance() {
    if (!lastPage) {
      goTo(pageIndex + 1);
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      for (const banner of banners) {
        if (banner.id === telegramReconnectCampaignId && !reconnectDisplayed.current) continue;
        if (acknowledged.current.has(banner.id)) continue;
        try {
          const result = await requestJson<{ acknowledged: boolean }>("/api/announcements", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: banner.id })
          });
          if (!result.acknowledged) throw new Error("Подтверждение не сохранено.");
        } catch (failure) {
          if (!(failure instanceof ApiRequestError && failure.status === 410)) throw failure;
        }
        acknowledged.current.add(banner.id);
      }
      onDismiss(banners.map((banner) => banner.id));
    } catch {
      setError("Не удалось сохранить подтверждение. Нажмите «Понятно», чтобы повторить попытку.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return <dialog ref={dialogRef} className="announcement-dialog" aria-labelledby="announcement-title" aria-describedby="announcement-text" onCancel={(event) => { event.preventDefault(); if (manual) onDismiss(banners.map((banner) => banner.id)); }} onKeyDown={(event) => { event.stopPropagation(); trapDialogTab(event, event.currentTarget); }}>
    <header className="announcement-header"><DogmeetBrand />{manual && <button type="button" className="icon-button" aria-label="Закрыть информацию" onClick={() => onDismiss(banners.map((banner) => banner.id))}><X aria-hidden="true" /></button>}</header>
    <div className="announcement-viewport" onTouchStart={(event) => {
      touchStart.current = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
    }} onTouchCancel={() => { touchStart.current = null; }} onTouchEnd={(event) => {
      const start = touchStart.current;
      touchStart.current = null;
      const end = event.changedTouches[0];
      if (!start || !end) return;
      const dx = end.clientX - start.x;
      const dy = end.clientY - start.y;
      if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.5) goTo(pageIndex + (dx < 0 ? 1 : -1));
    }}>
    <div ref={trackRef} className="announcement-track" style={{ transform: `translateX(${-pageIndex * 100}%)` }}>
      {pages.map((slide, index) => <div key={slide.key} className="announcement-slide announcement-card" inert={index !== pageIndex} aria-hidden={index !== pageIndex}>
        <div className="announcement-content" aria-live="polite" aria-atomic="true" role="region" aria-label="Содержимое слайда">
          <p className="small-note">{index + 1} из {pages.length}</p>
          <h1 id={index === pageIndex ? "announcement-title" : undefined}>{slide.title}</h1>
          <p id={index === pageIndex ? "announcement-text" : undefined}>{slide.text.split(/(\{\{menu\}\}|\{\{period\}\})/).map((part, partIndex) => <Fragment key={partIndex}>{part === "{{menu}}" ? <Menu className="announcement-menu-icon" role="img" aria-label="значок меню" /> : part === "{{period}}" ? <span className="announcement-period-filter"><SlidersHorizontal aria-hidden="true" />День</span> : part}</Fragment>)}</p>
          {slide.example && <div className="announcement-example">
            {slide.example === "walk-periods" && <div className="announcement-periods">{["Весь день", "День", "Утро", "Вечер"].map((period, index) => { const Icon = [Clock3, Sun, Sunrise, Sunset][index]!; return <span key={period} className="announcement-period-filter"><Icon aria-hidden="true" />{period}</span>; })}</div>}
            {slide.example === "places-help" && <MyPlacesMenuRow />}
            {slide.example === "telegram-dock" && <BottomDockExample />}
            {(slide.example === "site-share" || slide.example === "pet-share") && <ShareMenuRow kind={slide.example === "pet-share" ? "pet" : "site"} />}
          </div>}
        </div>
      </div>)}
    </div>
    </div>
    <div className="announcement-dots" role="group" aria-label="Слайды баннера">
      {pages.map((slide, index) => <button key={slide.key} type="button" className="announcement-dot" aria-label={`Слайд ${index + 1} из ${pages.length}`} aria-current={index === pageIndex ? "step" : undefined} tabIndex={pages.length === 1 ? -1 : 0} disabled={saving} onClick={() => goTo(index)}><span /></button>)}
    </div>
    <footer className="announcement-footer">
      {error && <p className="field-error" role="alert">{error}</p>}
      <button ref={buttonRef} className="button" type="button" disabled={saving} onClick={() => { void advance(); }}>{saving ? "Сохраняем…" : lastPage ? "Понятно" : "Далее"}</button>
    </footer>
  </dialog>;
}
