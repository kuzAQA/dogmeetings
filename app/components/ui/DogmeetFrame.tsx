"use client";

import { ArrowLeft, MapPin, MoreHorizontal, PawPrint, X } from "lucide-react";
import { type DialogHTMLAttributes, type ReactNode, useEffect, useId, useRef } from "react";
import { closeSheet } from "./motion.mjs";

export function DogmeetFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`studio production ${className}`}>
      <div className="phone">
        {children}
      </div>
    </div>
  );
}

type DogmeetDialogProps = DialogHTMLAttributes<HTMLDialogElement> & {
  children: ReactNode;
  onDismiss: () => void;
  title?: string;
  busy?: boolean;
};

let pageScrollLockCount = 0;
let pageScrollUnlockTimer: number | null = null;
let pageScrollLockState: {
  scrollY: number;
  htmlOverflow: string;
  bodyOverflow: string;
  bodyPosition: string;
  bodyTop: string;
  bodyWidth: string;
  bodyPaddingRight: string;
} | null = null;

function lockPageScroll() {
  if (pageScrollUnlockTimer !== null) {
    window.clearTimeout(pageScrollUnlockTimer);
    pageScrollUnlockTimer = null;
  }
  if (pageScrollLockCount === 0) {
    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;
    pageScrollLockState = {
      scrollY,
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyWidth: body.style.width,
      bodyPaddingRight: body.style.paddingRight
    };
    html.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    const scrollbarWidth = window.innerWidth - html.clientWidth;
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
  }
  pageScrollLockCount += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    pageScrollLockCount = Math.max(0, pageScrollLockCount - 1);
    if (pageScrollLockCount > 0 || !pageScrollLockState) return;
    const state = pageScrollLockState;
    pageScrollUnlockTimer = window.setTimeout(() => {
      pageScrollUnlockTimer = null;
      if (pageScrollLockCount > 0 || pageScrollLockState !== state) return;
      pageScrollLockState = null;
      const html = document.documentElement;
      const body = document.body;
      html.style.overflow = state.htmlOverflow;
      body.style.overflow = state.bodyOverflow;
      body.style.position = state.bodyPosition;
      body.style.top = state.bodyTop;
      body.style.width = state.bodyWidth;
      body.style.paddingRight = state.bodyPaddingRight;
      window.scrollTo(0, state.scrollY);
    }, 0);
  };
}

type DialogDismissHandler = (afterClose?: () => void, force?: boolean) => Promise<void>;
const dialogDismissers = new WeakMap<HTMLDialogElement, DialogDismissHandler>();

export function requestDialogClose(target: EventTarget | null, afterClose?: () => void, force = false) {
  const element = typeof Element !== "undefined" && target instanceof Element ? target.closest("dialog") : null;
  const dismiss = element && dialogDismissers.get(element);
  if (dismiss) return dismiss(afterClose, force);
  afterClose?.();
  return Promise.resolve();
}

export function DogmeetDialog({ children, onDismiss, title, busy = false, className = "", ...props }: DogmeetDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closing = useRef(false);
  const dismissRef = useRef<DialogDismissHandler>(() => Promise.resolve());
  const titleId = useId();

  useEffect(() => {
    dismissRef.current = (afterClose, force) => dismiss(afterClose, force);
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog) return;
    dialog.showModal();
    dialog.querySelector<HTMLButtonElement>(".sheet-header button")?.focus({ preventScroll: true });
    const unlockPageScroll = lockPageScroll();
    dialogDismissers.set(dialog, (afterClose, force) => dismissRef.current(afterClose, force));
    return () => {
      dialogDismissers.delete(dialog);
      if (dialog.open) dialog.close();
      unlockPageScroll();
      returnFocus?.focus({ preventScroll: true });
    };
  }, []);

  async function dismiss(afterClose?: () => void, force = false) {
    if ((!force && busy) || closing.current) return;
    closing.current = true;
    await closeSheet(dialogRef.current);
    onDismiss();
    afterClose?.();
    dialogRef.current?.getAnimations().forEach((animation) => animation.cancel());
    dialogRef.current?.classList.remove("is-closing");
    closing.current = false;
  }

  return <dialog ref={dialogRef} className={`sheet ${className}`} {...props} aria-labelledby={title ? titleId : props["aria-labelledby"]} onCancel={(event) => { event.preventDefault(); void dismiss(); }}>
    <div className="sheet-grip" aria-hidden="true" />
    <div className="sheet-header">{title && <h1 id={titleId}>{title}</h1>}<button type="button" className="icon-button" aria-label="Закрыть панель" disabled={busy} onClick={() => { void dismiss(); }}><X aria-hidden="true" /></button></div>
    <div className="sheet-content">{children}</div>
  </dialog>;
}

export function DogmeetBrand({ tagline }: { tagline?: string }) {
  return (
    <span className="brand">
      <PawPrint aria-hidden="true" />
      dogmeet
      {tagline && <span>{tagline}</span>}
    </span>
  );
}

type DogmeetHeaderProps = {
  onBack?: () => void;
  location?: string;
  onLocation?: () => void;
  onProfile?: () => void;
  admin?: boolean;
};

export function DogmeetHeader({ onBack, location, onLocation, onProfile, admin = false }: DogmeetHeaderProps) {
  return (
    <header className={`page-header ${location ? "nearby-toolbar" : ""}`}>
      {onBack && <button type="button" className="icon-button header-back" aria-label="Назад" onClick={onBack}><ArrowLeft aria-hidden="true" /></button>}
      {admin ? <span>Управление Dogmeet</span> : <DogmeetBrand />}
      {location && (
        <button type="button" className="location-switch" onClick={onLocation}>
          <MapPin aria-hidden="true" /><span>{location}</span>
        </button>
      )}
      {onProfile && <button type="button" className="icon-button" aria-label="Мой район и настройки" onClick={onProfile}><MoreHorizontal aria-hidden="true" /></button>}
    </header>
  );
}
