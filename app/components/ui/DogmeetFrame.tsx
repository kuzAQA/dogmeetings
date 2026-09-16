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

export function DogmeetDialog({ children, onDismiss, title, busy = false, className = "", ...props }: DogmeetDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closing = useRef(false);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog) return;
    dialog.showModal();
    dialog.querySelector<HTMLButtonElement>(".sheet-header button")?.focus({ preventScroll: true });
    return () => {
      if (dialog.open) dialog.close();
      returnFocus?.focus({ preventScroll: true });
    };
  }, []);

  async function dismiss(keyboard = false) {
    if (busy || closing.current) return;
    closing.current = true;
    await closeSheet(dialogRef.current, keyboard);
    onDismiss();
    dialogRef.current?.getAnimations().forEach((animation) => animation.cancel());
    dialogRef.current?.classList.remove("is-closing");
    closing.current = false;
  }

  return <dialog ref={dialogRef} className={`sheet ${className}`} {...props} aria-labelledby={title ? titleId : props["aria-labelledby"]} onCancel={(event) => { event.preventDefault(); void dismiss(true); }}>
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
