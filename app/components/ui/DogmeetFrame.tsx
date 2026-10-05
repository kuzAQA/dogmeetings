"use client";

import { ArrowLeft, BellRing, MapPin, MoreHorizontal, X } from "lucide-react";
import { type DialogHTMLAttributes, type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Sheet, type SheetProps, useVirtualKeyboard } from "react-modal-sheet";

export function DogmeetFrame({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`studio production ${className}`}>
      <div className="phone">
        {children}
      </div>
    </div>
  );
}

type SheetAccessibilityProps = Pick<DialogHTMLAttributes<HTMLDialogElement>, "aria-label" | "aria-labelledby" | "role">;
type SheetRef = { y: { on: (event: "animationComplete", callback: () => void) => () => void } };

type AppBottomSheetProps = SheetAccessibilityProps & {
  children: ReactNode;
  footer?: ReactNode;
  open: boolean;
  onClose: () => void;
  onCloseStart?: () => void;
  title?: string;
  busy?: boolean;
  className?: string;
  snapPoints?: SheetProps["snapPoints"];
  initialSnap?: SheetProps["initialSnap"];
  detent?: SheetProps["detent"];
};

type DialogDismissHandler = (afterClose?: () => void, force?: boolean) => Promise<void>;
const dialogDismissers = new WeakMap<HTMLElement, DialogDismissHandler>();
const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableChildren(element: HTMLElement) {
  return Array.from(element.querySelectorAll<HTMLElement>(focusableSelector)).filter((child) => !child.hidden && child.getClientRects().length > 0);
}

export function requestDialogClose(target: EventTarget | null, afterClose?: () => void, force = false) {
  const element = typeof Element !== "undefined" && target instanceof Element ? target.closest<HTMLElement>("[data-app-bottom-sheet]") : null;
  const dismiss = element && dialogDismissers.get(element);
  if (dismiss) return dismiss(afterClose, force);
  afterClose?.();
  return Promise.resolve();
}

export function AppBottomSheet({ children, footer, open, onClose, onCloseStart, title, busy = false, className = "", snapPoints, initialSnap, detent = "content", ...props }: AppBottomSheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [dialog, setDialog] = useState<HTMLDivElement | null>(null);
  const setDialogRef = useCallback((element: HTMLDivElement | null) => {
    dialogRef.current = element;
    setDialog(element);
  }, []);
  const sheetRef = useRef<SheetRef>(null);
  const dragClosePending = useRef(false);
  const closingRef = useRef(false);
  const [isOpen, setIsOpen] = useState(open);
  const [previousOpen, setPreviousOpen] = useState(open);
  const [closing, setClosing] = useState(false);
  const afterCloseCallbacks = useRef<(() => void)[]>([]);
  const closeResolvers = useRef<(() => void)[]>([]);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(busy);
  const onCloseStartRef = useRef(onCloseStart);
  const isPlacePicker = className.includes("sheet--place-picker");
  const mountPoint = typeof document === "undefined" ? undefined : document.querySelector(".production") ?? undefined;
  useVirtualKeyboard({ containerRef: dialogRef, isEnabled: isOpen && isPlacePicker });

  useLayoutEffect(() => {
    busyRef.current = busy;
    onCloseStartRef.current = onCloseStart;
  }, [busy, onCloseStart]);

  if (open !== previousOpen) {
    setPreviousOpen(open);
    setIsOpen(open);
    if (open) {
      setClosing(false);
    }
  }

  useLayoutEffect(() => {
    if (open) {
      closingRef.current = false;
      dragClosePending.current = false;
    }
  }, [open]);

  const dismiss = useCallback((afterClose?: () => void, force = false) => {
    if ((!force && busyRef.current) || closingRef.current || dragClosePending.current) return Promise.resolve();
    closingRef.current = true;
    setClosing(true);
    onCloseStartRef.current?.();
    return new Promise<void>((resolve) => {
      if (afterClose) afterCloseCallbacks.current.push(afterClose);
      closeResolvers.current.push(resolve);
      setIsOpen(false);
    });
  }, []);

  const finishDragClose = useCallback(() => {
    if (!dragClosePending.current) return;
    dragClosePending.current = false;
    setIsOpen(false);
  }, []);

  const beginDragClose = useCallback(() => {
    if (busyRef.current || closingRef.current || dragClosePending.current) return;
    dragClosePending.current = true;
    closingRef.current = true;
    setClosing(true);
    onCloseStartRef.current?.();
  }, []);

  useLayoutEffect(() => sheetRef.current?.y.on("animationComplete", finishDragClose), [finishDragClose]);

  const restoreFocus = useCallback(() => {
    if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus({ preventScroll: true });
    returnFocusRef.current = null;
  }, []);

  useLayoutEffect(() => {
    if (!dialog || !isOpen || closing) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (isPlacePicker) dialog.focus({ preventScroll: true });
    dialogDismissers.set(dialog, dismiss);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void dismiss();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = focusableChildren(dialog);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }
      const active = document.activeElement;
      if (event.shiftKey ? active === focusable[0] || !dialog.contains(active) : active === focusable.at(-1) || !dialog.contains(active)) {
        event.preventDefault();
        (event.shiftKey ? focusable.at(-1) : focusable[0])?.focus({ preventScroll: true });
      }
    };
    const keepFocusInside = (event: FocusEvent) => {
      if (closingRef.current || (event.target instanceof Node && dialog.contains(event.target))) return;
      window.requestAnimationFrame(() => {
        if (!closingRef.current && !dialog.contains(document.activeElement)) (focusableChildren(dialog)[0] ?? dialog).focus({ preventScroll: true });
      });
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", keepFocusInside);
    return () => {
      dialogDismissers.delete(dialog);
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", keepFocusInside);
    };
  }, [closing, dialog, dismiss, isOpen, isPlacePicker]);

  useLayoutEffect(() => restoreFocus, [restoreFocus]);

  function finishClose() {
    if (closingRef.current) {
      closingRef.current = false;
      setClosing(false);
      onClose();
      afterCloseCallbacks.current.splice(0).forEach((callback) => callback());
      closeResolvers.current.splice(0).forEach((resolve) => resolve());
      restoreFocus();
    }
  }

  return <Sheet ref={sheetRef} isOpen={isOpen} onClose={beginDragClose} onCloseEnd={finishClose} avoidKeyboard={!isPlacePicker} disableDismiss={busy} detent={detent} snapPoints={snapPoints} initialSnap={initialSnap} mountPoint={mountPoint}>
    <Sheet.Container ref={setDialogRef} data-app-bottom-sheet className={`sheet ${className}`} role={props.role ?? "dialog"} aria-modal="true" aria-label={props["aria-label"] ?? title} aria-labelledby={props["aria-labelledby"]} tabIndex={-1}>
      <Sheet.Header className="sheet-drag-area" aria-hidden="true"><span className="sheet-grip" /></Sheet.Header>
      <Sheet.Content className="sheet-content-shell" scrollClassName="sheet-content" disableDrag disableScroll={isPlacePicker}>{children}</Sheet.Content>
      {footer && <div className="sheet-footer">{footer}</div>}
    </Sheet.Container>
    <Sheet.Backdrop className="sheet-backdrop" aria-label="Закрыть" tabIndex={-1} onClick={() => { void dismiss(); }} />
  </Sheet>;
}

type DogmeetDialogProps = Omit<AppBottomSheetProps, "open" | "onClose" | "onCloseStart"> & { open?: boolean; onDismiss: () => void; onDismissStart?: () => void };

export function DogmeetDialog({ open = true, onDismiss, onDismissStart, ...props }: DogmeetDialogProps) {
  return <AppBottomSheet {...props} open={open} onClose={onDismiss} onCloseStart={onDismissStart} />;
}

export function DogmeetBrand({ tagline }: { tagline?: string }) {
  return (
    <span className="brand">
      <img className="brand-icon" src="/icons/dogmeet-mark.png?v=20261003-2" width={28} height={28} alt="" aria-hidden="true" />
      dogmeet
      {tagline && <span>{tagline}</span>}
    </span>
  );
}

const telegramMenuHintSeenKey = "dogmeet.telegramMenuHintSeen";
let telegramMenuHintShown = false;

export function useTelegramMenuHint(canShow: boolean) {
  const [hintVisible, setHintVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showHint = useCallback(() => {
    if (telegramMenuHintShown) return;
    try {
      if (document.cookie.split(";").some((cookie) => cookie.trim() === `${telegramMenuHintSeenKey}=1`)) return;
    } catch {
      // Cookies can be blocked; still allow the hint once in this page session.
    }
    setHintVisible(true);
  }, []);

  useEffect(() => {
    if (!canShow || telegramMenuHintShown) return;
    let appearanceTimer: number | undefined;
    const scheduleHint = () => {
      appearanceTimer = window.setTimeout(showHint, 3_000);
    };
    if (document.readyState === "complete") scheduleHint();
    else window.addEventListener("load", scheduleHint, { once: true });
    return () => {
      window.removeEventListener("load", scheduleHint);
      window.clearTimeout(appearanceTimer);
    };
  }, [canShow, showHint]);

  useLayoutEffect(() => {
    if (!hintVisible) return;
    telegramMenuHintShown = true;
    try {
      document.cookie = `${telegramMenuHintSeenKey}=1; Path=/; SameSite=Lax`;
    } catch {
      // The in-memory flag still prevents a repeat while this page is open.
    }
    timerRef.current = setTimeout(() => setHintVisible(false), 10_000);
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [hintVisible]);

  const dismissHint = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    setHintVisible(false);
  }, []);

  return { visible: hintVisible, dismiss: dismissHint };
}

export type TelegramMenuHint = ReturnType<typeof useTelegramMenuHint>;

export function TelegramHintBubble({ children, onDismiss, className = "", id }: { children: ReactNode; onDismiss: () => void; className?: string; id?: string }) {
  return <div id={id} className={className ? `telegram-menu-hint ${className}` : "telegram-menu-hint"} role="status">
    <BellRing className="telegram-menu-hint-bell" aria-hidden="true" />
    <span>{children}</span>
    <button type="button" className="telegram-menu-hint-close" aria-label="Закрыть подсказку" onClick={onDismiss}><X aria-hidden="true" /></button>
  </div>;
}

function TelegramMenuButton({ onOpen, hint }: { onOpen: () => void; hint?: TelegramMenuHint }) {
  return (
    <div className="header-menu">
      <button type="button" className="icon-button" aria-label="Мой район и настройки" onClick={() => { hint?.dismiss(); onOpen(); }}><MoreHorizontal aria-hidden="true" /></button>
      {hint?.visible && (
      <TelegramHintBubble onDismiss={hint.dismiss}>Откройте меню, чтобы получать уведомления о прогулках <em>в Telegram</em></TelegramHintBubble>
      )}
    </div>
  );
}

type DogmeetHeaderProps = {
  onBack?: () => void;
  location?: string;
  onLocation?: () => void;
  onProfile?: () => void;
  telegramMenuHint?: TelegramMenuHint;
  admin?: boolean;
};

export function DogmeetHeader({ onBack, location, onLocation, onProfile, telegramMenuHint, admin = false }: DogmeetHeaderProps) {
  return (
    <header className={`page-header ${location ? "nearby-toolbar" : ""}`}>
      {onBack && <button type="button" className="icon-button header-back" aria-label="Назад" onClick={onBack}><ArrowLeft aria-hidden="true" /></button>}
      {admin ? <span>Управление Dogmeet</span> : <DogmeetBrand />}
      {location && (
        <button type="button" className="location-switch" onClick={onLocation}>
          <MapPin aria-hidden="true" /><span>{location}</span>
        </button>
      )}
      {onProfile && <TelegramMenuButton onOpen={onProfile} hint={telegramMenuHint} />}
    </header>
  );
}
