"use client";

import { DogmeetDialog, requestDialogClose } from "../../../components/ui/DogmeetFrame";
import type { ApiWalk, Walk } from "../../../../lib/walks";
import type { Pet } from "../model";

type Props = {
  walk: ApiWalk | Walk;
  owned: ApiWalk;
  pet?: Pet;
  onClose: () => void;
  onEdit: (walk: ApiWalk) => void;
  onDelete: (walk: ApiWalk) => void;
  onShare: (pet: Pet) => void;
};

function walkTime(walk: ApiWalk | Walk) {
  return "walkTime" in walk ? walk.walkTime.slice(0, 5) : walk.time;
}

function scheduleLabel(walk: ApiWalk | Walk) {
  return walk.scheduleType === "always" ? "Ежедневно" : walk.scheduleType === "tomorrow" ? "Завтра" : "Сегодня";
}

export function WalkActionsDialog({ walk, owned, pet, onClose, onEdit, onDelete, onShare }: Props) {
  return (
    <DogmeetDialog className="sheet--walk-actions" title="Управление прогулкой" onDismiss={onClose} footer={<button className="button quiet" type="button" onClick={(event) => requestDialogClose(event.currentTarget, onClose)}>Закрыть</button>}>
      <div className="receipt"><strong>{walkTime(walk)} · {scheduleLabel(walk)}</strong><span>{walk.point}</span><small>{walk.pet}</small></div>
      <button className="menu-row" type="button" onClick={(event) => requestDialogClose(event.currentTarget, () => onEdit(owned))}><span><strong>Изменить прогулку</strong></span></button>
      {pet?.canShare && <button className="menu-row" type="button" onClick={(event) => requestDialogClose(event.currentTarget, () => onShare(pet))}><span><strong>Поделиться питомцем</strong></span></button>}
      <button className="menu-row danger-text" type="button" onClick={(event) => requestDialogClose(event.currentTarget, () => onDelete(owned))}><span><strong>Удалить прогулку</strong></span></button>
    </DogmeetDialog>
  );
}
