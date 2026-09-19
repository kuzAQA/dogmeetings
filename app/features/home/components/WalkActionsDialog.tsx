"use client";

import { DogmeetDialog, requestDialogClose } from "../../../components/ui/DogmeetFrame";
import type { ApiWalk, Walk } from "../../../../lib/walks";

type Props = {
  walk: ApiWalk | Walk;
  owned: ApiWalk;
  onClose: () => void;
  onEdit: (walk: ApiWalk) => void;
  onDelete: (walk: ApiWalk) => void;
};

function walkTime(walk: ApiWalk | Walk) {
  return "walkTime" in walk ? walk.walkTime.slice(0, 5) : walk.time;
}

function scheduleLabel(walk: ApiWalk | Walk) {
  return walk.scheduleType === "always" ? "Ежедневно" : walk.scheduleType === "tomorrow" ? "Завтра" : "Сегодня";
}

export function WalkActionsDialog({ walk, owned, onClose, onEdit, onDelete }: Props) {
  return (
    <DogmeetDialog className="sheet--walk-actions" title="Управление прогулкой" onDismiss={onClose} footer={<button className="button quiet" type="button" onClick={(event) => requestDialogClose(event.currentTarget, onClose)}>Закрыть</button>}>
      <div className="receipt"><strong>{walkTime(walk)} · {scheduleLabel(walk)}</strong><span>{walk.point}</span><small>{walk.pet}</small></div>
      <button className="menu-row" type="button" onClick={(event) => requestDialogClose(event.currentTarget, () => onEdit(owned))}><Pencil aria-hidden="true" /><span><strong>Изменить прогулку</strong></span></button>
      <button className="menu-row danger-text" type="button" onClick={(event) => requestDialogClose(event.currentTarget, () => onDelete(owned))}><Trash2 aria-hidden="true" /><span><strong>Удалить прогулку</strong></span></button>
    </DogmeetDialog>
  );
}
import { Pencil, Trash2 } from "lucide-react";
