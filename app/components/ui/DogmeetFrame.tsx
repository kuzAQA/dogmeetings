"use client";

import { ArrowLeft, MapPin, MoreHorizontal, PawPrint } from "lucide-react";
import { type DialogHTMLAttributes, type ReactNode, useCallback, useLayoutEffect, useRef, useState } from "react";
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

export function AppBottomSheet({ children, footer, open, onClose, title, busy = false, className = "", snapPoints, initialSnap, detent = "content", ...props }: AppBottomSheetProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<SheetRef>(null);
  const dragClosePending = useRef(false);
  const closingRef = useRef(false);
  const [isOpen, setIsOpen] = useState(open);
  const [previousOpen, setPreviousOpen] = useState(open);
  const [closing, setClosing] = useState(false);
  const afterCloseCallbacks = useRef<(() => void)[]>([]);
  const closeResolvers = useRef<(() => void)[]>([]);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const isPlacePicker = className.includes("sheet--place-picker");
  const mountPoint = typeof document === "undefined" ? undefined : document.querySelector(".production") ?? undefined;
  useVirtualKeyboard({ containerRef: dialogRef, isEnabled: isOpen && isPlacePicker });

  if (open !== previousOpen) {
    setPreviousOpen(open);
    setIsOpen(open);
    setClosing(false);
  }

  const dismiss = useCallback((afterClose?: () => void, force = false) => {
    if ((!force && busy) || closingRef.current || dragClosePending.current) return Promise.resolve();
    closingRef.current = true;
    setClosing(true);
    return new Promise<void>((resolve) => {
      if (afterClose) afterCloseCallbacks.current.push(afterClose);
      closeResolvers.current.push(resolve);
      setIsOpen(false);
    });
  }, [busy]);

  const finishDragClose = useCallback(() => {
    if (!dragClosePending.current) return;
    dragClosePending.current = false;
    setIsOpen(false);
  }, []);

  const beginDragClose = useCallback(() => {
    if (busy || closingRef.current || dragClosePending.current) return;
    dragClosePending.current = true;
    closingRef.current = true;
    setClosing(true);
  }, [busy]);

  useLayoutEffect(() => sheetRef.current?.y.on("animationComplete", finishDragClose), [finishDragClose]);

  const restoreFocus = useCallback(() => {
    if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus({ preventScroll: true });
    returnFocusRef.current = null;
  }, []);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
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
  }, [closing, dismiss, isOpen, isPlacePicker]);

  useLayoutEffect(() => restoreFocus, [restoreFocus]);

  function finishClose() {
    if (closingRef.current) {
      closingRef.current = false;
      setClosing(false);
      onClose();
      afterCloseCallbacks.current.splice(0).forEach((callback) => callback());
      closeResolvers.current.splice(0).forEach((resolve) => resolve());
    }
    restoreFocus();
  }

  return <Sheet ref={sheetRef} isOpen={isOpen} onClose={beginDragClose} onCloseEnd={finishClose} avoidKeyboard={!isPlacePicker} disableDismiss={busy} detent={detent} snapPoints={snapPoints} initialSnap={initialSnap} mountPoint={mountPoint}>
    <Sheet.Container ref={dialogRef} data-app-bottom-sheet className={`sheet ${className}`} role={props.role ?? "dialog"} aria-modal="true" aria-label={props["aria-label"] ?? title} aria-labelledby={props["aria-labelledby"]} tabIndex={-1}>
      <Sheet.Header className="sheet-drag-area" aria-hidden="true"><span className="sheet-grip" /></Sheet.Header>
      <Sheet.Content className="sheet-content-shell" scrollClassName="sheet-content" disableDrag disableScroll={isPlacePicker}>{children}</Sheet.Content>
      {footer && <div className="sheet-footer">{footer}</div>}
    </Sheet.Container>
    <Sheet.Backdrop className="sheet-backdrop" aria-label="Закрыть" tabIndex={-1} onTap={() => { void dismiss(); }} />
  </Sheet>;
}

type DogmeetDialogProps = Omit<AppBottomSheetProps, "open" | "onClose"> & { onDismiss: () => void };

export function DogmeetDialog({ onDismiss, ...props }: DogmeetDialogProps) {
  return <AppBottomSheet {...props} open onClose={onDismiss} />;
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
