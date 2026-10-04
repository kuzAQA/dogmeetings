"use client";

import { CalendarDays, Check, Compass, PawPrint, Plus } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState } from "react";

type BottomDockProps = {
  section: "nearby" | "plans" | "pets" | "walk";
  walkFormDirty: boolean;
  walkFormIsValid: boolean;
  petsLoaded: boolean;
  walkSaving: boolean;
  onNearbyClick: () => void;
  onPlansClick: () => void;
  onPetsClick: () => void;
  onAddPet: () => void;
  onWalkClick: () => void;
};

export function BottomDock({ section, walkFormDirty, walkFormIsValid, petsLoaded, walkSaving, onNearbyClick, onPlansClick, onPetsClick, onAddPet, onWalkClick }: BottomDockProps) {
  const addingPet = section === "pets";
  const [preferences, setPreferences] = useState({ mobile: false, reduced: true });
  const actionHidden = section === "nearby";
  const actionLabel = addingPet ? "Добавить питомца" : section === "walk" && walkFormDirty && walkFormIsValid ? "Сохранить прогулку" : "Создать прогулку";
  const dockRef = useRef<HTMLElement>(null);
  const filterId = `dock-goo-${useId().replace(/:/g, "")}`;
  const [actionReady, setActionReady] = useState(false);
  const motionPosition = useRef(actionHidden ? 0 : 1);
  const motionFrames = useRef<Keyframe[] | null>(null);
  const actionFocused = useRef(false);

  useLayoutEffect(() => {
    const mobile = matchMedia("(max-width: 899px)");
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPreferences({ mobile: mobile.matches, reduced: reduced.matches });
    update();
    mobile.addEventListener("change", update);
    reduced.addEventListener("change", update);
    return () => {
      mobile.removeEventListener("change", update);
      reduced.removeEventListener("change", update);
    };
  }, []);

  useLayoutEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const add = dock.querySelector<HTMLButtonElement>(".dock-add")!;
    if (actionHidden && (actionFocused.current || document.activeElement === add)) {
      actionFocused.current = false;
      // Navigation focuses its heading after flushSync; restore dock focus afterward.
      queueMicrotask(() => {
        if (dock.isConnected && dock.dataset.action === "hidden") {
          dock.querySelector<HTMLButtonElement>(".dock-item[aria-current=page]")?.focus({ preventScroll: true });
        }
      });
    }
    const end = actionHidden ? 0 : 1;
    const instant = !preferences.mobile || preferences.reduced || typeof add.animate !== "function";
    if (instant || motionPosition.current === end) {
      motionPosition.current = end;
      motionFrames.current = null;
      setActionReady(!actionHidden);
      return;
    }

    setActionReady(false);
    dock.dataset.moving = "true";
    const styles = getComputedStyle(dock);
    const durationValue = styles.getPropertyValue(actionHidden ? "--dock-exit" : "--dock-enter").trim();
    // Production CSS may serialize milliseconds as seconds; WAAPI expects milliseconds.
    const duration = parseFloat(durationValue) * (durationValue.endsWith("ms") ? 1 : 1000);
    const easing = styles.getPropertyValue(actionHidden ? "--dock-hide-ease" : "--dock-show-ease").trim();
    // Reference stage coordinates, mapped to the site's fixed pill and button sizes.
    // 4.3% is the final button position; 14.3% is the initial pill edge.
    const x = (left: number) => `translateX(calc(var(--dock-shift) * ${(left - 4.3) / 10}))`;
    const source = (offset: number, opacity: number, shift: number, scaleX: number, scaleY = scaleX) => ({
      offset, opacity, transform: `translateX(var(--dock-shift)) translateX(${shift}%) scale(${scaleX}, ${scaleY})`,
    });
    const drop = (offset: number, left: number, opacity: number, scaleX: number, scaleY = scaleX, borderRadius = "50%") => ({
      offset, opacity, transform: `${x(left)} scale(${scaleX}, ${scaleY})`, borderRadius,
    });
    // The reference changes bridge width. Folding it into scaleX keeps layout fixed.
    const bridge = (offset: number, opacity: number, left: number, width: number, scaleX: number, scaleY: number) => ({
      offset, opacity,
      transform: `${x(left)} translateX(calc(var(--dock-size) * ${(width - 14) / 16.2})) scale(${width / 14 * scaleX}, ${scaleY})`,
    });
    const sourceFrames = actionHidden ? [
      source(0, 0, 76, .42), source(.32, .55, 55, .78, .72),
      source(.7, 1, 18, 1.24, .82), source(1, .98, 0, .82),
    ] : [
      source(0, .98, 0, .82), source(.36, 1, 18, 1.30, .82),
      source(.72, .72, 56, .78, .72), source(1, 0, 76, .42),
    ];
    const dropFrames = actionHidden ? [
      drop(0, 4.3, 1, 1), drop(.24, 5.2, 1, 1.06, .92),
      drop(.52, 8.6, 1, 1.34, .66, "38% 62% 58% 42% / 50% 42% 58% 50%"),
      drop(.76, 11.9, 1, .88, .56), drop(1, 14.3, 0, .48),
    ] : [
      drop(0, 14.3, .92, .56),
      drop(.26, 11.4, 1, 1.20, .72, "41% 59% 56% 44% / 48% 42% 58% 52%"),
      drop(.52, 7.2, 1, 1.32, .76, "34% 66% 60% 40% / 47% 41% 59% 53%"),
      drop(.72, 4.5, 1, .94, 1.06, "56% 44% 47% 53% / 44% 58% 42% 56%"),
      drop(.88, 3.95, 1, 1.045, 1.045, "49% 51% 50% 50%"), drop(1, 4.3, 1, 1),
    ];
    const bridgeFrames = actionHidden ? [
      bridge(0, 0, 5.7, 2, .2, .14), bridge(.28, .62, 6, 5.2, .65, .34),
      bridge(.58, 1, 8.4, 9.4, 1.02, .64), bridge(.82, 1, 11.6, 7.4, .94, .78),
      bridge(1, 0, 13.6, 4, .4, .56),
    ] : [
      bridge(0, 0, 13.6, 4, .4, .56), bridge(.22, 1, 11.2, 8.2, 1.02, .82),
      bridge(.48, 1, 8.1, 9.7, 1.08, .64), bridge(.7, .88, 6.3, 7.2, .86, .42),
      bridge(.86, .4, 5.8, 4.2, .55, .26), bridge(1, 0, 5.7, 2, .2, .14),
    ];
    const actionFrames = actionHidden ? [
      drop(0, 4.3, 1, 1), drop(.25, 5.2, .92, .96),
      drop(.58, 9.1, .20, 1.18, .69), drop(1, 14.1, 0, .44),
    ] : [
      drop(0, 14.1, 0, .46), drop(.34, 10.3, .05, 1.15, .69),
      drop(.58, 6.3, .45, .88), drop(.82, 3.9, 1, 1.045), drop(1, 4.3, 1, 1),
    ];
    const pillFrames = actionHidden ? [
      { offset: 0, transform: "translateX(0px)" },
      { offset: 1, transform: "translateX(calc(-1 * var(--dock-shift)))" },
    ] : [
      { offset: 0, transform: "translateX(calc(-1 * var(--dock-shift)))" },
      { offset: 1, transform: "translateX(0px)" },
    ];
    const tracks: [HTMLElement, Keyframe[]][] = [
      [dock.querySelector<HTMLElement>(".nav-tabs")!, pillFrames],
      [dock.querySelector<HTMLElement>(".dock-source-shape")!, sourceFrames],
      [dock.querySelector<HTMLElement>(".dock-drop-shape")!, dropFrames],
      [dock.querySelector<HTMLElement>(".dock-bridge")!, bridgeFrames],
      [add, actionFrames.map(({ offset, opacity, transform }) => ({ offset, opacity, transform }))],
    ];
    const start = motionPosition.current;
    const phase = actionHidden ? 1 - start : start;
    const remaining = 1 - phase;
    const animations = tracks.map(([element, frames], index) => {
      // Retain the current shape on reversal and play only the remaining reference frames.
      const first = motionFrames.current?.[index] ?? frames[0];
      const keyframes = [
        { ...first, offset: 0 },
        ...frames.filter((frame) => Number(frame.offset) > phase).map((frame) => ({
          ...frame, offset: (Number(frame.offset) - phase) / remaining,
        })),
      ];
      // One easing for the pill; liquid frames keep moving instead of restarting it.
      return element.animate(keyframes, { duration: duration * remaining, fill: "both", easing: index === 0 ? easing : "linear" });
    });
    let current = true;
    void Promise.all(animations.map((animation) => animation.finished)).then(() => {
      if (!current) return;
      motionPosition.current = end;
      motionFrames.current = null;
      current = false;
      dock.dataset.moving = "false";
      animations.forEach((animation) => animation.cancel());
      setActionReady(!actionHidden);
    }).catch(() => { /* Cancellation belongs to the next target or unmount. */ });
    return () => {
      if (current) {
        const elapsed = Number(animations[0].currentTime ?? 0) / (duration * remaining);
        motionPosition.current = start + (end - start) * Math.min(1, elapsed);
        motionFrames.current = tracks.map(([element, frames]) => {
          const style = getComputedStyle(element);
          return {
            transform: style.transform, opacity: style.opacity,
            ...(frames.some((frame) => frame.borderRadius !== undefined) ? { borderRadius: style.borderRadius } : {}),
          };
        });
      }
      current = false;
      animations.forEach((animation) => animation.cancel());
      dock.dataset.moving = "false";
    };
  }, [actionHidden, preferences.mobile, preferences.reduced]);

  return (
    <nav ref={dockRef} className="bottom-nav walks-bottom-dock" data-action={actionHidden ? "hidden" : "visible"} aria-label="Основная навигация">
      <svg className="dock-goo-filter" aria-hidden="true" focusable="false" width="1" height="1">
        <defs>
          <filter id={filterId} x="-20%" y="-40%" width="140%" height="180%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 20 -9" result="goo" />
            <feComposite in="SourceGraphic" in2="goo" operator="atop" />
          </filter>
        </defs>
      </svg>
      <div className="dock-goo" aria-hidden="true" style={{ "--dock-filter": `url(#${filterId})` } as React.CSSProperties}><span className="dock-source-shape" /><span className="dock-bridge" /><span className="dock-drop-shape" /></div>
      <div className="nav-tabs dock-tabs" data-active={section === "walk" ? "nearby" : section}>
        <span className="nav-indicator" aria-hidden="true" />
        {([
          ["nearby", "Рядом", Compass, onNearbyClick],
          ["plans", "Мои планы", CalendarDays, onPlansClick],
          ["pets", "Питомцы", PawPrint, onPetsClick]
        ] as const).map(([target, label, Icon, onClick]) => (
          <button className={`dock-item dock-item--${target} ${section === target ? "is-active" : ""}`} type="button" key={target} aria-current={section === target ? "page" : undefined} onClick={onClick}>
            <span className="nav-label"><Icon aria-hidden="true" /><span>{String(label)}</span></span>
          </button>
        ))}
      </div>
      <button className={`dock-add dock-context-action dock-item--walk ${section === "walk" ? "is-active" : ""}`} type="button" disabled={!actionReady || actionHidden || !petsLoaded || walkSaving || (section === "walk" && walkFormDirty && !walkFormIsValid)} aria-hidden={actionHidden || undefined} tabIndex={actionHidden || !actionReady ? -1 : undefined} aria-label={actionLabel} onFocus={() => { actionFocused.current = true; }} onBlur={(event) => { if (event.relatedTarget) actionFocused.current = false; }} onClick={() => { if (actionReady && !actionHidden) (addingPet ? onAddPet : onWalkClick)(); }}>
        <span className="action-icon" data-done={section === "walk" && walkFormDirty && walkFormIsValid} aria-hidden="true"><Plus /><Check /></span>
      </button>
    </nav>
  );
}
