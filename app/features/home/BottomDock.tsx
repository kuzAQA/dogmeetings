"use client";

import { Check, PawPrint, Plus, UserRound } from "lucide-react";
import { useEffect } from "react";

export type PrimaryDockSection = "nearby" | "profile";
export type DockSection = PrimaryDockSection | "walk" | "pets";

type BottomDockProps = {
  section: DockSection;
  menuOpen: boolean;
  dockWalkOpen: boolean;
  walkFormDirty: boolean;
  walkFormIsValid: boolean;
  petsLoaded: boolean;
  walkSaving: boolean;
  onNearbyClick: () => void;
  onWalkClick: () => void;
  onPetsClick: () => void;
  onProfileClick: () => void;
};

export function BottomDock({
  section,
  menuOpen,
  dockWalkOpen,
  walkFormDirty,
  walkFormIsValid,
  petsLoaded,
  walkSaving,
  onNearbyClick,
  onWalkClick,
  onPetsClick,
  onProfileClick
}: BottomDockProps) {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".app-shell");
    const dock = document.querySelector<HTMLElement>(".walks-bottom-dock");
    if (!root || !dock) return;

    let frame = 0;
    const updateOcclusion = () => {
      frame = 0;
      const dockRect = dock.getBoundingClientRect();
      const dockCenter = dockRect.top + dockRect.height / 2;
      const occlusionBoundary = dockCenter + 8;

      root.querySelectorAll<HTMLElement>(".walk-card, .collection-card").forEach((card) => {
        const cardRect = card.getBoundingClientRect();
        const overlapsHorizontally = cardRect.left < dockRect.right && cardRect.right > dockRect.left;
        const overlapsVertically = cardRect.top < dockRect.bottom && cardRect.bottom > dockRect.top;
        const occlusionEnd = Math.max(0, Math.min(cardRect.height, occlusionBoundary - cardRect.top));

        if (!overlapsHorizontally || !overlapsVertically || cardRect.bottom <= occlusionBoundary) {
          card.removeAttribute("data-dock-overlap");
          card.style.removeProperty("--dock-occlusion-end");
          return;
        }

        card.dataset.dockOverlap = "true";
        card.style.setProperty("--dock-occlusion-end", `${occlusionEnd}px`);
      });
    };
    const scheduleOcclusionUpdate = () => {
      if (!frame) frame = requestAnimationFrame(updateOcclusion);
    };
    const mutationObserver = new MutationObserver(scheduleOcclusionUpdate);

    updateOcclusion();
    document.addEventListener("scroll", scheduleOcclusionUpdate, { capture: true, passive: true });
    window.addEventListener("resize", scheduleOcclusionUpdate);
    mutationObserver.observe(root, { childList: true, subtree: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener("scroll", scheduleOcclusionUpdate, true);
      window.removeEventListener("resize", scheduleOcclusionUpdate);
      mutationObserver.disconnect();
    };
  }, []);

  const walkActionLabel = dockWalkOpen
    ? walkFormDirty && walkFormIsValid
      ? "Сохранить прогулку"
      : walkFormDirty
        ? "Заполните обязательные поля"
        : "Форма прогулки не изменена"
    : "Создать прогулку";

  return (
    <nav className="walks-bottom-dock" aria-label="Основная навигация">
      <button
        className={`dock-item dock-item--nearby ${section === "nearby" ? "is-active" : ""}`}
        type="button"
        aria-current={section === "nearby" ? "page" : undefined}
        onClick={onNearbyClick}
      >
        <span className="dock-item-icon dock-item-icon--nearby" aria-hidden="true">
          <span className="dock-icon-fill" />
          <span className="dock-item-nearby-glyph" />
        </span>
        <span>Рядом</span>
      </button>
      <button
        className={`dock-item dock-item--walk ${section === "walk" ? "is-active" : ""} ${dockWalkOpen && walkFormDirty ? "is-form-dirty" : ""} ${dockWalkOpen && walkFormDirty && walkFormIsValid ? "is-save-ready" : ""}`}
        type="button"
        disabled={!petsLoaded || walkSaving || (dockWalkOpen && !walkFormIsValid)}
        aria-current={section === "walk" ? "page" : undefined}
        aria-label={walkActionLabel}
        onClick={onWalkClick}
      >
        <span className="dock-item-icon">
          <span className="dock-icon-fill" />
          <Plus className="dock-walk-state-icon dock-walk-state-icon--plus" aria-hidden="true" />
          <Check className="dock-walk-state-icon dock-walk-state-icon--check" aria-hidden="true" />
        </span>
        <span className="dock-walk-label" aria-hidden="true">
          <span className="dock-walk-label-text dock-walk-label-text--default">Прогулка</span>
          <span className="dock-walk-label-text dock-walk-label-text--save">Сохранить</span>
        </span>
      </button>
      <button
        className={`dock-item dock-item--pets ${section === "pets" ? "is-active" : ""}`}
        type="button"
        aria-current={section === "pets" ? "page" : undefined}
        onClick={onPetsClick}
      >
        <span className="dock-item-icon"><span className="dock-icon-fill" /><PawPrint aria-hidden="true" /></span>
        <span>Питомцы</span>
      </button>
      <button
        className={`dock-item dock-item--profile ${section === "profile" ? "is-active" : ""}`}
        type="button"
        aria-label="Открыть профиль"
        aria-expanded={menuOpen}
        aria-current={section === "profile" ? "page" : undefined}
        onClick={onProfileClick}
      >
        <span className="dock-item-icon"><span className="dock-icon-fill" /><UserRound aria-hidden="true" /></span>
        <span>Профиль</span>
      </button>
    </nav>
  );
}
