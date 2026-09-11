"use client";

import { CalendarDays, Dog, EllipsisVertical, Forward, House, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import Image from "next/image";
import type { ApiWalk } from "../../../../lib/walks";
import { formatWalkDate } from "../../../../lib/walks";
import type { Pet } from "../model";

type WalkCollectionProps = {
  walks: ApiWalk[];
  loaded: boolean;
  petsLoaded: boolean;
  openWalkActionsId: string | null;
  onStartWalk: () => void;
  onToggleWalkActions: (id: string) => void;
  onCloseWalkActions: () => void;
  onEditWalk: (walk: ApiWalk) => void;
  onDeleteWalk: (walk: ApiWalk) => void;
};

export function WalkCollection({ walks, loaded, petsLoaded, openWalkActionsId, onStartWalk, onToggleWalkActions, onCloseWalkActions, onEditWalk, onDeleteWalk }: WalkCollectionProps) {
  return (
    <div className="screen collection-screen my-walks-screen">
      <div className="screen-heading">
        <h1>Мои прогулки</h1>
        <p>Все прогулки, о которых вы сообщили</p>
      </div>
      <div className="collection-list collection-list-with-action" aria-live="polite">
        {!loaded ? (
          <p className="collection-empty">Загружаем прогулки…</p>
        ) : walks.length > 0 ? walks.map((walk) => (
          <article className="collection-card collection-walk" key={walk.id}>
            <Image src={walk.image} alt={`Питомец ${walk.pet}`} width={62} height={62} unoptimized />
            <span className="collection-card-info">
              <strong>{walk.pet}</strong>
              <small className="collection-complex"><House aria-hidden="true" />{walk.complex}</small>
              <small className="collection-place"><span className="walk-card-icon walk-card-icon--pin" aria-hidden="true" />{walk.point}</small>
              <small className="collection-date"><CalendarDays aria-hidden="true" />{formatWalkDate(walk)} · {walk.walkTime}</small>
            </span>
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
                  <button type="button" role="menuitem" onClick={() => onEditWalk(walk)}>Изменить</button>
                  <button type="button" role="menuitem" onClick={() => onDeleteWalk(walk)}>Удалить</button>
                </span>
              )}
            </div>
          </article>
        )) : (
          <p className="collection-empty">У вас пока нет добавленных прогулок</p>
        )}
      </div>
      <button className="floating-pet-button" type="button" disabled={!petsLoaded} onClick={onStartWalk}><Plus aria-hidden="true" />Сообщить о прогулке</button>
    </div>
  );
}

type PetCollectionProps = {
  pets: Pet[];
  fromDock: boolean;
  highlightedPetId: string;
  onDismissHighlight: () => void;
  onShare: (pet: Pet) => void;
  onEdit: (pet: Pet) => void;
  onDelete: (pet: Pet) => void;
  onAdd: () => void;
};

export function PetCollection({
  pets,
  fromDock,
  highlightedPetId,
  onDismissHighlight,
  onShare,
  onEdit,
  onDelete,
  onAdd
}: PetCollectionProps) {
  return (
    <div
      className={`screen collection-screen ${fromDock ? "collection-screen--dock" : ""} ${highlightedPetId ? "collection-screen--shared-highlight-active" : ""}`}
      onPointerDownCapture={(event) => {
        if (!highlightedPetId) return;
        event.preventDefault();
        event.stopPropagation();
        onDismissHighlight();
      }}
    >
      {highlightedPetId && <div className="shared-pet-highlight-overlay" aria-hidden="true" />}
      <div className="screen-heading">
        <h1>Мои питомцы</h1>
        <p>Добавленные вами питомцы</p>
      </div>
      <div className="collection-list collection-list-with-action" aria-live="polite">
        {pets.length > 0 ? pets.map((pet) => {
          const highlighted = highlightedPetId === pet.id;
          return (
            <div className={`collection-pet-entry ${highlighted ? "collection-pet-entry--shared-highlight" : ""}`} key={pet.id}>
              <article className={`collection-card collection-pet ${highlighted ? "collection-pet--shared-highlight" : ""}`}>
                <Image src={pet.photoUrl} alt={`Питомец ${pet.name}`} width={62} height={62} unoptimized />
                <span className="collection-card-info">
                  <strong>{pet.name}</strong>
                  <small><Dog aria-hidden="true" />{pet.breed}</small>
                  <small><UserRound aria-hidden="true" />{pet.ownerName}</small>
                </span>
                <span className="collection-card-actions">
                  {pet.canShare && <button className="share-pet-button" type="button" aria-label={`Поделиться питомцем ${pet.name}`} onClick={() => onShare(pet)}><Forward aria-hidden="true" /></button>}
                  {pet.canEdit && <button className="edit-pet-button" type="button" aria-label={`Редактировать питомца ${pet.name}`} onClick={() => onEdit(pet)}><Pencil aria-hidden="true" /></button>}
                  {pet.canDelete && <button className="delete-pet-button" type="button" aria-label={`Удалить питомца ${pet.name}`} onClick={() => onDelete(pet)}><Trash2 aria-hidden="true" /></button>}
                </span>
                {pet.isOwner && pet.isShared && <span className="shared-pet-origin-label">Вы поделились этим питомцем</span>}
                {!pet.isOwner && <span className="shared-pet-origin-label">Добавленный питомец</span>}
              </article>
              {highlighted && <p className="shared-pet-highlight-message">Теперь вы можете управлять этим питомцем</p>}
            </div>
          );
        }) : (
          <p className="collection-empty">У вас пока нет добавленных питомцев</p>
        )}
      </div>
      <button className="floating-pet-button" type="button" onClick={onAdd}><Plus aria-hidden="true" />Добавить питомца</button>
    </div>
  );
}
