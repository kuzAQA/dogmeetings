"use client";

import { CalendarDays, ChevronDown, ChevronRight, Clock3, Dog, EllipsisVertical, MessageCircle } from "lucide-react";
import Image from "next/image";
import { type FormEvent, type RefObject, useEffect, useRef } from "react";
import { formatResidentialComplex, type ApiWalk, type Period, type Walk } from "../../../../lib/walks";
import { MAX_BREED_LENGTH, MAX_WALK_META_LENGTH, type Location, type Pet } from "../model";
import type { DockPanelSection, DockSection } from "../use-home-navigation";
import type { WalkFormState } from "../use-walk-form";
import { WalkPlace } from "../../../components/ui/WalkPlace";
import { WalkAnnouncementForm } from "./WalkAnnouncementForm";

const periodOptions: Period[] = ["Все", "Утро", "День", "Вечер"];
const filterIndicatorLeft: Record<Period, string> = {
  "Все": "0",
  "Утро": "calc(25% + 2px)",
  "День": "calc(50% + 4px)",
  "Вечер": "calc(75% + 6px)"
};

type WalksWorkspaceProps = {
  dockSection: DockSection;
  location: Location;
  period: Period;
  visibleWalks: Walk[];
  savedWalks: Walk[];
  walksLoaded: boolean;
  ownedWalksById: Map<string, ApiWalk>;
  petsById: Map<string, Pet>;
  openWalkActionsId: string | null;
  onPeriodChange: (period: Period) => void;
  onToggleWalkActions: (id: string) => void;
  onCloseWalkActions: () => void;
  onEditWalk: (walk: ApiWalk) => void;
  onDeleteWalk: (walk: ApiWalk) => void;
  onSharePet: (pet: Pet) => void;
  guidedWalkFlow: boolean;
  savedPets: Pet[];
  placesLoaded: boolean;
  walkForm: WalkFormState;
  walkSaving: boolean;
  editingWalk: boolean;
  onWalkSubmit: (event: FormEvent<HTMLFormElement>) => void;
  profileHeadingRef: RefObject<HTMLHeadingElement | null>;
  onOpenLocationEditor: () => void;
  onOpenMyWalks: () => void;
  onOpenMyPets: () => void;
};

export function WalksWorkspace({
  dockSection,
  location,
  period,
  visibleWalks,
  savedWalks,
  walksLoaded,
  ownedWalksById,
  petsById,
  openWalkActionsId,
  onPeriodChange,
  onToggleWalkActions,
  onCloseWalkActions,
  onEditWalk,
  onDeleteWalk,
  onSharePet,
  guidedWalkFlow,
  savedPets,
  placesLoaded,
  walkForm,
  walkSaving,
  editingWalk,
  onWalkSubmit,
  profileHeadingRef,
  onOpenLocationEditor,
  onOpenMyWalks,
  onOpenMyPets
}: WalksWorkspaceProps) {
  const walkListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = walkListRef.current;
    if (list) list.dataset.scrolled = list.scrollTop > 0 ? "true" : "false";
  }, []);
  const activeDockSection: DockPanelSection = dockSection === "walk" || dockSection === "profile" ? dockSection : "nearby";
  const paneState = (section: DockPanelSection) => section === activeDockSection ? "static" : "hidden";
  const nearbyPane = paneState("nearby");
  const walkPane = paneState("walk");
  const profilePane = paneState("profile");
  return (
    <div className="screen walks-screen">
      <div className="walks-screen-track">
        <section className="walks-pane walks-pane--nearby" data-dock-pane={nearbyPane} aria-hidden={nearbyPane === "hidden"} inert={nearbyPane === "hidden" ? true : undefined}>
          <header className="walks-header">
            <div className="walks-heading-copy">
              <h1>Прогулки рядом</h1>
              <p>Сегодня · {location.complex}</p>
            </div>
          </header>
          <div className="filters" aria-label="Фильтр по времени">
            <span className="filter-indicator" aria-hidden="true" style={{ left: filterIndicatorLeft[period] }} />
            {periodOptions.map((item) => (
              <button key={item} type="button" className={`filter-button ${period === item ? "active" : ""}`} aria-pressed={period === item} onClick={() => onPeriodChange(item)}><span>{item}</span></button>
            ))}
          </div>
          <div ref={walkListRef} className="walk-list" data-scrolled="false" onScroll={(event) => { event.currentTarget.dataset.scrolled = event.currentTarget.scrollTop > 0 ? "true" : "false"; }}>
            <div className="walk-list-content" aria-live="polite">
              {!walksLoaded ? (
                <p className="visually-hidden" role="status">Загружаем прогулки</p>
              ) : visibleWalks.length === 0 ? (
                <p className="empty-walks">{savedWalks.length === 0 ? "Пока никто не сообщил о прогулке" : "В это время прогулок пока нет"}</p>
              ) : visibleWalks.map((walk) => {
                const ownedWalk = ownedWalksById.get(walk.id);
                const shareablePet = petsById.get(walk.petId);
                const hasCardActions = Boolean(ownedWalk || shareablePet?.canShare);
                return (
                  <article className={`walk-card ${hasCardActions ? "walk-card--editable" : ""}`} key={walk.id}>
                    {hasCardActions && (
                      <div
                        className="walk-card-actions-menu"
                        role="toolbar"
                        aria-label={`Действия с прогулкой питомца ${walk.pet}`}
                        onBlur={(event) => {
                          if (!event.currentTarget.contains(event.relatedTarget instanceof Node ? event.relatedTarget : null)) onCloseWalkActions();
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            onCloseWalkActions();
                            event.currentTarget.querySelector<HTMLButtonElement>(".walk-card-actions-trigger")?.focus();
                          }
                        }}
                      >
                        <button className="walk-card-actions-trigger" type="button" aria-label={`Действия с прогулкой питомца ${walk.pet}`} aria-haspopup="menu" aria-expanded={openWalkActionsId === walk.id} onClick={() => onToggleWalkActions(walk.id)}>
                          <EllipsisVertical aria-hidden="true" />
                        </button>
                        {openWalkActionsId === walk.id && (
                          <span className="walk-card-actions-popover" role="menu" aria-label={`Действия с прогулкой питомца ${walk.pet}`}>
                            <button type="button" role="menuitem" disabled={!ownedWalk} onClick={() => { if (ownedWalk) onEditWalk(ownedWalk); }}>Изменить</button>
                            <button type="button" role="menuitem" disabled={!ownedWalk} onClick={() => { if (ownedWalk) onDeleteWalk(ownedWalk); }}>Удалить</button>
                            <button type="button" role="menuitem" disabled={!shareablePet?.canShare} onClick={() => { if (shareablePet?.canShare) onSharePet(shareablePet); }}>Поделиться</button>
                          </span>
                        )}
                      </div>
                    )}
                    <div className="walk-pet-visual">
                      <Image className="dog-avatar" src={walk.image} alt={`Собака ${walk.pet}`} width={112} height={112} sizes="112px" unoptimized={walk.image.startsWith("/api/")} />
                    </div>
                    <div className="walk-info">
                      <h2>{walk.pet}</h2>
                      <p className="pet-meta owner"><span className="walk-card-icon walk-card-icon--user" aria-hidden="true" /><span>{walk.owner}</span></p>
                      <p><Clock3 className="time-icon" aria-hidden="true" /><span>{walk.time}</span></p>
                      <p className="pet-meta breed" aria-label={`Порода: ${walk.breed}`}><Dog aria-hidden="true" /><span>{Array.from(walk.breed).slice(0, MAX_BREED_LENGTH).join("").trimEnd()}</span></p>
                    </div>
                    <WalkPlace place={walk.point} />
                    {walk.comment && <p className="walk-comment"><MessageCircle aria-hidden="true" /><span>{Array.from(walk.comment).slice(0, MAX_WALK_META_LENGTH).join("").trimEnd()}</span></p>}
                  </article>
                );
              })}
            </div>
          </div>
        </section>
        <section className="walks-pane walks-pane--walk" data-dock-pane={walkPane} aria-hidden={walkPane === "hidden"} inert={walkPane === "hidden" ? true : undefined}>
          <div className="menu-overlay" role="presentation">
            <aside className="drawer drawer--walk-form" role="dialog" aria-labelledby="dock-walk-title" aria-modal="true">
              <div className="drawer-body drawer-walk-form">
                <WalkAnnouncementForm inDock guidedWalkFlow={guidedWalkFlow} savedPets={savedPets} placesLoaded={placesLoaded} walkForm={walkForm} walkSaving={walkSaving} editing={editingWalk} onSubmit={onWalkSubmit} />
              </div>
            </aside>
          </div>
        </section>
        <section className="walks-pane walks-pane--profile" data-dock-pane={profilePane} aria-hidden={profilePane === "hidden"} inert={profilePane === "hidden" ? true : undefined}>
          <div className="menu-overlay" role="presentation">
            <aside className="drawer" role="dialog" aria-labelledby="menu-title" aria-modal="true">
              <div className="drawer-header"><h1 className="drawer-menu-content" id="menu-title" ref={profileHeadingRef} tabIndex={-1}>Профиль</h1></div>
              <div className="drawer-body drawer-menu-content">
                <p className="drawer-label">Сохранённая локация</p>
                <button className="location-card" type="button" onClick={onOpenLocationEditor}>
                  <span className="location-card-summary">
                    <span className="location-card-pin" aria-hidden="true" />
                    <strong className="location-card-address"><span>{location.city} · {location.district}</span><span>{formatResidentialComplex(location.complex)}</span></strong>
                    <ChevronDown className="location-card-chevron" aria-hidden="true" />
                  </span>
                  <span className="change-location"><span className="change-location-pin" aria-hidden="true" />Изменить локацию</span>
                </button>
                <button className="drawer-link" type="button" onClick={onOpenMyWalks}><span className="drawer-link-icon"><CalendarDays aria-hidden="true" /></span><span>Мои прогулки</span><ChevronRight /></button>
                <button className="drawer-link" type="button" onClick={onOpenMyPets}><span className="drawer-link-icon"><span className="drawer-pets-icon" aria-hidden="true" /></span><span>Мои питомцы</span><ChevronRight /></button>
                <div className="drawer-footer"><a className="developer-link" href="https://t.me/kuznetsoviv" target="_blank" rel="noopener noreferrer">ТГ разработчика</a></div>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </div>
  );
}
