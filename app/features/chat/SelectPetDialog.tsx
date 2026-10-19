"use client";

import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { DogmeetDialog, requestDialogClose } from "../../components/ui/DogmeetFrame";
import { PetRowContent } from "../home/components/Collections";
import type { Pet } from "../home/model";
import { openChat } from "./api";

export function SelectPetDialog({ pets, walkId, onDismiss, onOpen }: {
  pets: Pet[]; walkId: string; onDismiss: () => void; onOpen: (id: string) => void;
}) {
  const [petId, setPetId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);

  async function confirm(target: HTMLButtonElement) {
    if (!petId || busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      const { dialog } = await openChat({ walkId, petId }, AbortSignal.timeout(15000));
      requestDialogClose(target, () => onOpen(dialog.id), true);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось открыть переписку. Попробуйте ещё раз.");
      busy.current = false;
      setSaving(false);
    }
  }

  return <DogmeetDialog title="От имени какого питомца написать?" className="sheet--pet-picker" busy={saving} onDismiss={onDismiss}
    footer={<><button className="button secondary" type="button" disabled={saving} onClick={event => requestDialogClose(event.currentTarget, onDismiss)}>Закрыть</button>
      <button className="button" type="button" disabled={!petId || saving} onClick={event => void confirm(event.currentTarget)}>Написать</button></>}>
    <h2>От имени какого питомца написать?</h2>
    <div className="pet-rows" role="radiogroup" aria-label="Ваши питомцы" aria-busy={saving}>
      {pets.map(pet => <label className="pet-row pet-picker-row" key={pet.id}>
        <input className="visually-hidden" type="radio" name="chat-pet" value={pet.id} checked={petId === pet.id} disabled={saving}
          onChange={() => { setPetId(pet.id); setError(""); }} />
        <PetRowContent pet={pet} />
        {petId === pet.id && <Check aria-hidden="true" />}
      </label>)}
    </div>
    {error && <p className="field-error" role="alert">{error}</p>}
  </DogmeetDialog>;
}
