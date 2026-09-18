"use client";

import { CalendarDays, Check, Compass, PawPrint, Plus } from "lucide-react";
import { useEffect, useRef } from "react";

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
  const actionHidden = section === "nearby";
  const actionLabel = addingPet ? "Добавить питомца" : section === "walk" && walkFormDirty && walkFormIsValid ? "Сохранить прогулку" : "Создать прогулку";
  const dockRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const dock = dockRef.current;
    const drop = dock?.querySelector<HTMLElement>(".dock-drop-shape");
    const plus = dock?.querySelector<HTMLElement>(".dock-add");
    if (!dock || !drop || !plus) return;

    let raf = 0;
    const clearInlineMotion = () => {
      cancelAnimationFrame(raf);
      drop.style.transform = "";
      plus.style.transform = "";
      plus.style.opacity = "";
      plus.style.borderColor = "";
    };

    if (actionHidden || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      clearInlineMotion();
      return () => cancelAnimationFrame(raf);
    }

    const styles = getComputedStyle(dock);
    const start = Number.parseFloat(styles.getPropertyValue("--dock-size")) + Number.parseFloat(styles.getPropertyValue("--dock-gap"));
    const end = 0;
    const distance = Math.abs(end - start);
    const duration = 980 / 3;

    const setX = (x: number) => {
      const transform = `translateX(${x}px)`;
      drop.style.transform = transform;
      plus.style.transform = transform;
    };

    const ease = (t: number) => {
      const smooth = t * t * (3 - 2 * t);
      const kick = t > 0.72 ? Math.sin((t - 0.72) / 0.28 * Math.PI) * 7 * (1 - t) : 0;
      return smooth + kick / distance;
    };

    setX(start);
    plus.style.opacity = "0";
    plus.style.borderColor = "transparent";
    const startTime = performance.now();
    const frame = (now: number) => {
      const raw = Math.min(1, (now - startTime) / duration);
      setX(start + (end - start) * ease(raw));
      const reveal = Math.max(0, Math.min(1, (raw - 0.42) / 0.35));
      plus.style.opacity = String(reveal);
      plus.style.borderColor = `rgba(239, 217, 198, ${reveal})`;
      if (raw < 1) {
        raf = requestAnimationFrame(frame);
        return;
      }
      setX(end);
      plus.style.opacity = "1";
      plus.style.borderColor = "rgba(239,217,198,1)";
      clearInlineMotion();
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [actionHidden]);

  return (
    <nav ref={dockRef} className="bottom-nav walks-bottom-dock" data-action={actionHidden ? "hidden" : "visible"} aria-label="Основная навигация">
      <svg className="dock-goo-filter" aria-hidden="true" width="0" height="0">
        <defs>
          <filter id="dock-goo" x="-40%" y="-80%" width="220%" height="260%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
            <feColorMatrix in="blur" mode="matrix" values={'1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 22 -10'} result="goo" />
          </filter>
        </defs>
      </svg>
      <div className="dock-goo" aria-hidden="true"><span className="dock-menu-shape" /><span className="dock-drop-shape" /></div>
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
      <button className={`dock-add dock-context-action dock-item--walk ${section === "walk" ? "is-active" : ""}`} type="button" disabled={actionHidden || !petsLoaded || walkSaving || (section === "walk" && walkFormDirty && !walkFormIsValid)} aria-hidden={actionHidden || undefined} tabIndex={actionHidden ? -1 : undefined} aria-label={actionLabel} onClick={addingPet ? onAddPet : onWalkClick}>
        <span className="action-icon" data-done={section === "walk" && walkFormDirty && walkFormIsValid} aria-hidden="true"><Plus /><Check /></span>
      </button>
    </nav>
  );
}
