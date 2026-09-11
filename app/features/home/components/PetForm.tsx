"use client";

import { Camera } from "lucide-react";
import type { ChangeEvent, FormEvent } from "react";
import { WalkSetupStepper } from "../../../components/ui/WalkSetupStepper";
import { MAX_BREED_LENGTH, type Pet } from "../model";

type PetFormProps = {
  guidedWalkFlow: boolean;
  requiresWalkStepper: boolean;
  petBeingEdited: Pet | null;
  photoUrl: string | null;
  photoError: string;
  submitError: string;
  name: string;
  ownerName: string;
  breed: string;
  nameValid: boolean;
  ownerNameValid: boolean;
  breedValid: boolean;
  saving: boolean;
  touchedFields: Record<string, boolean>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onPhotoChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onTouch: (field: string) => void;
  onNameChange: (value: string) => void;
  onOwnerNameChange: (value: string) => void;
  onBreedChange: (value: string) => void;
};

export function PetForm({
  guidedWalkFlow,
  requiresWalkStepper,
  petBeingEdited,
  photoUrl,
  photoError,
  submitError,
  name,
  ownerName,
  breed,
  nameValid,
  ownerNameValid,
  breedValid,
  saving,
  touchedFields,
  onSubmit,
  onPhotoChange,
  onTouch,
  onNameChange,
  onOwnerNameChange,
  onBreedChange
}: PetFormProps) {
  const editing = Boolean(petBeingEdited);
  const formValid = nameValid && ownerNameValid && breedValid;

  return (
    <div className="screen form-screen pet-screen">
      {guidedWalkFlow && requiresWalkStepper && (
        <div className="guided-form-topbar">
          <WalkSetupStepper step={1} />
        </div>
      )}
      <div className="screen-heading">
        <h1>{editing ? "Редактировать питомца" : "Добавить питомца"}</h1>
        <p>{editing ? "Обновите информацию о вашем друге" : "Расскажите немного о вашем друге"}</p>
      </div>
      <form className="pet-form" onSubmit={onSubmit} aria-busy={saving} noValidate>
        <label className={`photo-upload ${photoUrl ? "has-photo" : ""} ${editing ? "is-editing" : ""}`}>
          <input
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label={editing ? "Выбрать новую фотографию питомца" : "Добавить фотографию питомца"}
            onChange={onPhotoChange}
          />
          {photoUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl} alt="Предпросмотр фотографии питомца" />
              {editing && <span className="photo-edit-hint">Нажмите, чтобы изменить фото</span>}
            </>
          ) : (
            <><Camera aria-hidden="true" /><span>Добавить фото</span><small>Необязательно</small></>
          )}
        </label>
        {(photoError || submitError) && <p className="error-message" role="alert">{photoError || submitError}</p>}
        <label className="field text-field">
          <span>Имя питомца</span>
          <input
            name="petName"
            value={name}
            required
            maxLength={40}
            placeholder="Например, Боня"
            aria-invalid={Boolean(touchedFields["pet-name"] && !nameValid)}
            aria-describedby={touchedFields["pet-name"] && !nameValid ? "pet-name-hint" : undefined}
            onBlur={() => onTouch("pet-name")}
            onChange={(event) => onNameChange(event.target.value)}
          />
          {touchedFields["pet-name"] && !nameValid && <span className="validation-hint" id="pet-name-hint">{name.trim() ? "Имя питомца должно содержать хотя бы одну букву" : "Введите имя питомца"}</span>}
        </label>
        <label className="field text-field">
          <span>Имя хозяина</span>
          <input
            name="ownerName"
            value={ownerName}
            required
            maxLength={60}
            placeholder="Например, Анна"
            aria-invalid={Boolean(touchedFields["owner-name"] && !ownerNameValid)}
            aria-describedby={touchedFields["owner-name"] && !ownerNameValid ? "owner-name-hint" : undefined}
            onBlur={() => onTouch("owner-name")}
            onChange={(event) => onOwnerNameChange(event.target.value)}
          />
          {touchedFields["owner-name"] && !ownerNameValid && <span className="validation-hint" id="owner-name-hint">{ownerName.trim() ? "Имя хозяина должно содержать хотя бы одну букву" : "Введите имя хозяина"}</span>}
        </label>
        <label className="field text-field">
          <span>Порода</span>
          <input
            name="breed"
            value={breed}
            required
            maxLength={MAX_BREED_LENGTH}
            placeholder="Например, корги"
            aria-invalid={Boolean(touchedFields["pet-breed"] && !breedValid)}
            aria-describedby={touchedFields["pet-breed"] && !breedValid ? "pet-breed-hint" : undefined}
            onBlur={() => onTouch("pet-breed")}
            onChange={(event) => onBreedChange(event.target.value)}
          />
          {touchedFields["pet-breed"] && !breedValid && <span className="validation-hint" id="pet-breed-hint">{breed.trim() ? "Порода должна содержать хотя бы одну букву" : "Введите породу"}</span>}
        </label>
        <button className="primary-button form-submit" type="submit" disabled={!formValid || saving}>{saving ? "Сжимаем и сохраняем…" : "Сохранить"}</button>
      </form>
      {saving && (
        <div className="saving-overlay" role="status" aria-live="polite">
          <p>Идёт сохранение данных о вашем питомце</p>
        </div>
      )}
    </div>
  );
}
