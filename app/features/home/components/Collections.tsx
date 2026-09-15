"use client";

import { Check, ChevronRight, MapPin, MessageCircle, Pencil, Share2, Trash2 } from "lucide-react";
import Image from "next/image";
import { DogmeetState } from "../../../components/ui/DogmeetState";
import type { ApiWalk } from "../../../../lib/walks";
import { DogmeetDialog, DogmeetHeader } from "../../../components/ui/DogmeetFrame";
import type { Pet } from "../model";

type HeaderProps = { location?: string; onLocation?: () => void; onProfile?: () => void; onBack?: () => void };

type WalkCollectionProps = HeaderProps & {
  walks: ApiWalk[];
  loaded: boolean;
  error: string;
  onRetry: () => void;
  petsLoaded: boolean;
  openWalkActionsId: string | null;
  onStartWalk: () => void;
  onToggleWalkActions: (id: string) => void;
  onCloseWalkActions: () => void;
  onEditWalk: (walk: ApiWalk) => void;
  onDeleteWalk: (walk: ApiWalk) => void;
  petsById: Map<string, Pet>;
  onSharePet: (pet: Pet) => void;
};

export function WalkCollection({ walks, loaded, error, onRetry, openWalkActionsId, onStartWalk, onToggleWalkActions, onCloseWalkActions, onEditWalk, onDeleteWalk, petsById, onSharePet, location, onLocation, onProfile, onBack }: WalkCollectionProps) {
  return (
    <div className="screen collection-screen my-walks-screen">
      <DogmeetHeader {...(location ? { location, onLocation, onProfile } : { onBack })} />
      <h1>Мои планы</h1>
      {loaded && !error && walks.length > 0 && <p>Ваши встречи сегодня, завтра<br />и маленькие ежедневные традиции.</p>}
      {!loaded ? <DogmeetState state="loading" /> : error ? <DogmeetState state="error" message={error} onAction={onRetry} /> : walks.length === 0 ? <DogmeetState state="empty" action="Сообщить о прогулке" onAction={onStartWalk} /> : (
      <div className="timeline">{walks.map((walk) => <div className="walk-row" key={walk.id}><div className="time-column"><strong>{walk.walkTime.slice(0, 5)}</strong><span>{walk.scheduleType === "always" ? "Каждый день" : walk.scheduleType === "tomorrow" ? "Завтра" : "Сегодня"}</span><i aria-hidden="true" /></div><div className="walk-summary"><Image className="pet-face" src={walk.image} alt={`Собака ${walk.pet}`} width={48} height={48} unoptimized={walk.image.startsWith("/api/")} /><span className="walk-person"><strong>{walk.pet}</strong><small>{walk.owner} · {walk.breed}</small></span><span className="walk-place"><MapPin aria-hidden="true" />{walk.point}</span>{walk.comment && <span className="walk-comment"><MessageCircle aria-hidden="true" />{walk.comment}</span>}<button className="text-link" type="button" aria-expanded={openWalkActionsId === walk.id} onClick={() => onToggleWalkActions(walk.id)}>Управлять<ChevronRight aria-hidden="true" /></button></div>{openWalkActionsId === walk.id && <DogmeetDialog className="sheet--walk-actions" title="Управление прогулкой" onDismiss={onCloseWalkActions}><div className="receipt"><strong>{walk.walkTime.slice(0, 5)} · {walk.scheduleType === "always" ? "Ежедневно" : walk.scheduleType === "tomorrow" ? "Завтра" : "Сегодня"}</strong><span>{walk.point}</span><small>{walk.pet}</small></div><button className="menu-row" type="button" onClick={() => onEditWalk(walk)}><Pencil /><span><strong>Изменить прогулку</strong></span><ChevronRight /></button>{petsById.get(walk.petId)?.canShare && <button className="menu-row" type="button" onClick={() => { onCloseWalkActions(); onSharePet(petsById.get(walk.petId)!); }}><Share2 /><span><strong>Поделиться питомцем</strong></span><ChevronRight /></button>}<button className="menu-row" type="button" onClick={() => onDeleteWalk(walk)}><Trash2 /><span><strong>Удалить прогулку</strong></span><ChevronRight /></button><button className="button quiet" type="button" onClick={onCloseWalkActions}>Закрыть</button></DogmeetDialog>}</div>)}</div>
      )}
    </div>
  );
}

type PetCollectionProps = HeaderProps & {
  pets: Pet[];
  fromDock: boolean;
  loaded: boolean;
  error: string;
  highlightedPetId: string;
  onDismissHighlight: () => void;
  onShare: (pet: Pet) => void;
  onEdit: (pet: Pet) => void;
  onOpen?: (pet: Pet) => void;
  onDelete: (pet: Pet) => void;
  onAdd: () => void;
  onRetry: () => void;
};

export function PetCollection({ pets, fromDock, loaded, error, highlightedPetId, onDismissHighlight, onEdit, onOpen, onAdd, onRetry, location, onLocation, onProfile, onBack }: PetCollectionProps) {
  return (
    <div className={`screen collection-screen pets-screen ${fromDock ? "collection-screen--dock" : ""}`} onPointerDownCapture={() => { if (highlightedPetId) onDismissHighlight(); }}>
      <DogmeetHeader {...(fromDock && location ? { location, onLocation, onProfile } : { onBack })} />
      <h1>Мои питомцы</h1>
      {loaded && !error && pets.length > 0 && <p>Те, ради кого мы выходим<br />из дома в любую погоду.</p>}
      {!loaded ? <DogmeetState state="loading" /> : error ? <DogmeetState state="error" message={error} onAction={onRetry} /> : pets.length === 0 ? <DogmeetState state="empty" title="Пока ни одного питомца" message="Добавьте питомца, чтобы сообщать о прогулках." action="Добавить питомца" onAction={onAdd} /> : (
        <div className="pet-rows">{pets.map((pet) => <button className="pet-row" type="button" key={pet.id} onClick={() => (onOpen ?? onEdit)(pet)}><Image className="pet-face" data-pet-photo={pet.id} src={pet.photoUrl} alt={`Собака ${pet.name}`} width={72} height={72} unoptimized={pet.photoUrl.startsWith("/api/")} /><span><strong>{pet.name}</strong><small>{pet.breed} · {pet.ownerName}</small><em>{pet.isOwner ? "Ваш питомец" : "Общий питомец"}</em></span>{highlightedPetId === pet.id ? <Check aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}</button>)}</div>
      )}
      {pets.length > 0 && <div className="note"><Share2 aria-hidden="true" />Питомцем можно поделиться с близким человеком и вместе планировать прогулки.</div>}
    </div>
  );
}
