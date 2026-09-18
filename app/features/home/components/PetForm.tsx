"use client";

import { Camera, Check, ChevronRight, Pencil, Share2, Trash2 } from "lucide-react";
import Image from "next/image";
import { type ChangeEvent, type FormEvent, useState } from "react";
import { DogmeetHeader } from "../../../components/ui/DogmeetFrame";
import { DogmeetState } from "../../../components/ui/DogmeetState";
import { MAX_BREED_LENGTH, type Pet } from "../model";

type Props = {
  guidedWalkFlow: boolean;
  requiresWalkStepper: boolean;
  petBeingEdited: Pet | null;
  mode: "view" | "edit";
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
  onEdit: () => void;
  onShare: () => void;
  onDelete: () => void;
  onBack?: () => void;
};

export function PetForm({ petBeingEdited, mode, photoUrl, photoError, submitError, name, ownerName, breed, nameValid, ownerNameValid, breedValid, saving, touchedFields, onSubmit, onPhotoChange, onTouch, onNameChange, onOwnerNameChange, onBreedChange, onEdit, onShare, onDelete, onBack }: Props) {
  const [photoOpen, setPhotoOpen] = useState(false);
  if (petBeingEdited && mode === "view") {
    return (
      <div className="screen pet-passport-screen">
        <DogmeetHeader onBack={onBack} />
        <h1>Паспорт питомца</h1>
        <Image className="portrait" data-pet-photo={petBeingEdited.id} src={petBeingEdited.photoUrl} alt={petBeingEdited.name} width={390} height={300} unoptimized={petBeingEdited.photoUrl.startsWith("/api/")} />
        <div className="pet-title"><h2>{petBeingEdited.name}</h2><span>{petBeingEdited.isOwner ? "Ваш питомец" : "Общий питомец"}</span></div>
        <dl className="facts"><div><dt>Порода</dt><dd>{petBeingEdited.breed}</dd></div><div><dt>Хозяин</dt><dd>{petBeingEdited.ownerName}</dd></div></dl>
        {petBeingEdited.canEdit && <button className="menu-row" type="button" onClick={onEdit}><Pencil aria-hidden="true" /><span><strong>Изменить данные</strong><small>Имя, порода и фото</small></span><ChevronRight /></button>}
        {petBeingEdited.canShare && <button className="menu-row" type="button" onClick={onShare}><Share2 aria-hidden="true" /><span><strong>Поделиться питомцем</strong><small>Для совместных прогулок</small></span><ChevronRight /></button>}
        {petBeingEdited.canDelete && <button className="menu-row" type="button" onClick={onDelete}><Trash2 aria-hidden="true" /><span><strong>{petBeingEdited.isOwner ? "Удалить питомца" : "Убрать из моего списка"}</strong><small>{petBeingEdited.isOwner ? "Вместе с его прогулками" : "У владельца питомец останется"}</small></span><ChevronRight /></button>}
      </div>
    );
  }

  const editing = Boolean(petBeingEdited);
  const formValid = nameValid && ownerNameValid && breedValid;
  const preview = photoUrl || petBeingEdited?.photoUrl || "/dog-placeholder.webp";
  return (
    <div className="screen form-screen pet-screen">
      <DogmeetHeader onBack={photoOpen ? () => setPhotoOpen(false) : onBack} />
      <h1>{photoOpen ? "Фотография" : editing ? "Изменить питомца" : "Добавить питомца"}</h1>
      <p hidden={photoOpen || saving || Boolean(submitError)}>{editing ? "Актуальные данные помогут узнать вас на прогулке." : "Соседи запомнят не анкету, а добрую морду."}</p>
      {saving && <DogmeetState state="loading" title="Сохраняем…" />}
      {submitError && !saving && <DogmeetState state="error" title="Не удалось сохранить" message={submitError} onAction={() => onNameChange(name)} onBack={onBack} />}
      <form className="pet-form" hidden={saving || Boolean(submitError)} onSubmit={onSubmit} aria-busy={saving} noValidate>
        {photoOpen && <Image className="photo-preview" src={preview} alt="Предпросмотр фотографии" width={346} height={346} unoptimized />}
        <label className="upload" hidden={!photoOpen}><Camera /><strong>Выбрать файл</strong><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhotoChange} /></label>
        {photoOpen && <><p>JPG, PNG или WebP до 10 МБ. Выберите снимок, на котором хорошо видно питомца.</p>{photoError && <p className="field-error" role="alert">{photoError}</p>}<button className="button" type="button" disabled={Boolean(photoError)} onClick={() => setPhotoOpen(false)}>Использовать фото<Check /></button></>}
        <div hidden={photoOpen}>
        <button type="button" className="photo-editor" onClick={() => setPhotoOpen(true)}>
          <Image src={preview} alt="Фотография" width={86} height={86} unoptimized />
          <span><Camera aria-hidden="true" />{editing ? "Изменить фотографию" : "Выбрать фотографию"}</span>
        </button>
        {photoError && <p className="field-error" role="alert">{photoError}</p>}
        <label className="field"><span>Имя питомца</span><input name="petName" value={name} required maxLength={40} placeholder="Например, Боня" aria-invalid={Boolean(touchedFields["pet-name"] && !nameValid)} onBlur={() => onTouch("pet-name")} onChange={(event) => onNameChange(event.target.value)} />{touchedFields["pet-name"] && !nameValid && <small className="field-error">Введите имя питомца</small>}</label>
        <label className="field"><span>Имя хозяина</span><input name="ownerName" value={ownerName} required maxLength={60} placeholder="Например, Анна" aria-invalid={Boolean(touchedFields["owner-name"] && !ownerNameValid)} onBlur={() => onTouch("owner-name")} onChange={(event) => onOwnerNameChange(event.target.value)} />{touchedFields["owner-name"] && !ownerNameValid && <small className="field-error">Введите имя хозяина</small>}</label>
        <label className="field"><span>Порода</span><input name="breed" value={breed} required maxLength={MAX_BREED_LENGTH} placeholder="Например, корги" aria-invalid={Boolean(touchedFields["pet-breed"] && !breedValid)} onBlur={() => onTouch("pet-breed")} onChange={(event) => onBreedChange(event.target.value)} />{touchedFields["pet-breed"] && !breedValid && <small className="field-error">Введите породу</small>}</label>
        {submitError && <p className="field-error" role="alert">{submitError}</p>}
        <button className="button" type="submit" disabled={!formValid || Boolean(photoError) || saving}>{saving ? "Сохраняем…" : editing ? "Сохранить изменения" : "Добавить питомца"}<Check aria-hidden="true" /></button>
        </div>
      </form>
    </div>
  );
}
