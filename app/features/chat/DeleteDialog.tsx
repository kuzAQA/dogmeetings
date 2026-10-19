"use client";

import { DogmeetDialog } from "../../components/ui/DogmeetFrame";
import { CHAT_DELETE_NOTICE } from "../../../server/domain/chat";

export function DeleteDialog({ busy, error, onCancel, onDelete }: {
  busy: boolean; error: string; onCancel: () => void; onDelete: () => void;
}) {
  return <DogmeetDialog title="Удалить диалог?" onDismiss={onCancel} busy={busy}>
    <h2>Удалить диалог?</h2>
    <p>{CHAT_DELETE_NOTICE}</p>
    {error && <p role="alert" className="form-error">{error}</p>}
    <button className="button" type="button" disabled={busy} onClick={onDelete}>{busy ? "Удаляем…" : "Удалить только у меня"}</button>
    <button className="button quiet" type="button" disabled={busy} onClick={onCancel}>Отмена</button>
  </DogmeetDialog>;
}
