"use client";

import { useEffect, useState, type FormEvent } from "react";
import { MapPin, Pencil, Trash2 } from "lucide-react";
import { DogmeetDialog, DogmeetHeader, requestDialogClose } from "../../../components/ui/DogmeetFrame";
import { DogmeetState } from "../../../components/ui/DogmeetState";
import { SingleLineInput } from "../../../components/ui/SingleLineInput";
import { requestJson } from "../../api/client";
import { containsLetter, MAX_WALK_PLACE_LENGTH, type SharedPlace } from "../model";

export function MyPlaces({ onBack }: { onBack: () => void }) {
  const [places, setPlaces] = useState<SharedPlace[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<SharedPlace | null>(null);
  const [deleting, setDeleting] = useState<SharedPlace | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const valid = containsLetter.test(name.trim()) && name.trim().length <= MAX_WALK_PLACE_LENGTH;
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    requestJson<{ places: SharedPlace[] }>("/api/places?scope=mine")
      .then(data => {
        if (!Array.isArray(data.places)) throw new Error("Не удалось загрузить места.");
        if (active) setPlaces(data.places);
      })
      .catch(error => { if (active) setError(error instanceof Error ? error.message : "Не удалось загрузить места."); })
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [reload]);

  async function save(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const place = deleting ?? editing;
    if (!place || saving || (!deleting && !valid)) return;
    setSaving(true);
    setMutationError("");
    try {
      const data = await requestJson<{ place: SharedPlace }>("/api/places", {
        method: deleting ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: place.id, ...(!deleting && { name }) })
      });
      setPlaces(current => deleting ? current.filter(row => row.id !== place.id) : current.map(row => row.id === place.id ? data.place : row));
      setEditing(null);
      setDeleting(null);
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "Не удалось изменить место.");
    } finally { setSaving(false); }
  }

  function dismiss() {
    if (saving) return;
    setEditing(null);
    setDeleting(null);
  }

  return <div className="screen my-places-screen">
    <DogmeetHeader onBack={onBack} />
    <h1>Мои места</h1>
    <p>Добавленные вами места для прогулок в вашей локации.</p>
    {!loaded ? <DogmeetState state="loading" title="Загружаем места…" />
      : error ? <DogmeetState state="error" message={error} onAction={() => { setLoaded(false); setError(""); setReload(current => current + 1); }} />
      : !places.length ? <DogmeetState state="empty" title="Пока нет своих мест" message="Новые места появятся здесь, когда вы укажете их при создании или изменении прогулки." />
      : <ul className="my-places-list">{places.map(place => <li key={place.id}>
        <MapPin aria-hidden="true" /><span>{place.name}</span>
        <button className="icon-button" type="button" aria-label={`Изменить место «${place.name}»`} onClick={() => { setMutationError(""); setName(place.name); setEditing(place); }}><Pencil aria-hidden="true" /></button>
        <button className="icon-button" type="button" aria-label={`Удалить место «${place.name}»`} onClick={() => { setMutationError(""); setDeleting(place); }}><Trash2 aria-hidden="true" /></button>
      </li>)}</ul>}
    {editing && <DogmeetDialog busy={saving} title="Изменить место" onDismiss={dismiss} footer={<button className="button quiet" type="button" disabled={saving} onClick={event => { void requestDialogClose(event.currentTarget, dismiss); }}>Отмена</button>}>
      <form onSubmit={save} aria-busy={saving}>
        <label className="field"><span>Название места</span><SingleLineInput value={name} onChange={event => setName(event.target.value)} maxLength={MAX_WALK_PLACE_LENGTH} disabled={saving} /></label>
        {!valid && <p className="field-error">Укажите название с буквами, до {MAX_WALK_PLACE_LENGTH} символов.</p>}
        {mutationError && <p className="field-error" role="alert">{mutationError}</p>}
        <button className="button" type="submit" disabled={saving || !valid}>{saving ? "Сохраняем…" : "Сохранить изменения"}</button>
      </form>
    </DogmeetDialog>}
    {deleting && <DogmeetDialog busy={saving} title="Удалить место?" onDismiss={dismiss} footer={<><button className="button" type="button" disabled={saving} onClick={() => { void save(); }}>{saving ? "Удаляем…" : "Удалить место"}</button><button className="button quiet" type="button" disabled={saving} onClick={event => { void requestDialogClose(event.currentTarget, dismiss); }}>Отмена</button></>}>
      <p>Удалить «{deleting.name}»? Место, связанное с прогулками, удалить нельзя.</p>
      {mutationError && <p className="field-error" role="alert">{mutationError}</p>}
    </DogmeetDialog>}
  </div>;
}
