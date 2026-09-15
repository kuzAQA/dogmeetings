"use client";

import { CalendarDays, Check, Compass, PawPrint, Plus } from "lucide-react";

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

  return (
    <><div className="nav-shade" aria-hidden="true" /><nav className="bottom-nav walks-bottom-dock" data-action={actionHidden ? "hidden" : "visible"} aria-label="Основная навигация">
      <div className="nav-tabs dock-tabs" data-active={section === "walk" ? "nearby" : section}>
        <span className="nav-indicator" aria-hidden="true" />
        {([
          ["nearby", "Рядом", Compass, onNearbyClick],
          ["plans", "Мои планы", CalendarDays, onPlansClick],
          ["pets", "Питомцы", PawPrint, onPetsClick]
        ] as const).map(([target, label, Icon, onClick]) => (
          <button className={`dock-item dock-item--${target} ${section === target ? "is-active" : ""}`} type="button" key={target} aria-current={section === target ? "page" : undefined} onClick={onClick}>
            <span className="nav-label" style={{ viewTransitionName: `dogmeet-label-${target}` }}><Icon aria-hidden="true" /><span>{String(label)}</span></span>
          </button>
        ))}
      </div>
      <button className={`dock-add dock-context-action dock-item--walk ${section === "walk" ? "is-active" : ""}`} type="button" disabled={actionHidden || !petsLoaded || walkSaving || (section === "walk" && walkFormDirty && !walkFormIsValid)} aria-hidden={actionHidden || undefined} tabIndex={actionHidden ? -1 : undefined} aria-label={actionLabel} onClick={addingPet ? onAddPet : onWalkClick}>
        <span className="action-icon" data-done={section === "walk" && walkFormDirty && walkFormIsValid} aria-hidden="true"><Plus /><Check /></span>
      </button>
    </nav></>
  );
}
