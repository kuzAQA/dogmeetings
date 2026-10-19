"use client";

import { Camera, ChevronRight, Pencil, Trash2 } from "lucide-react";
import Image from "next/image";
import { type ChangeEvent, type FormEvent, useState } from "react";
import { DogmeetHeader } from "../../../components/ui/DogmeetFrame";
import { DogmeetState } from "../../../components/ui/DogmeetState";
import { SingleLineInput } from "../../../components/ui/SingleLineInput";
import { contactError, formatPhoneContact, type ContactType } from "../../../../lib/pet-contact";
import { PetContactRow } from "../../../components/ui/PetContactRow";
import { ShareMenuRow } from "../../../components/ui/ShareMenuRow";
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
  const [contactType, setContactType] = useState<ContactType>(petBeingEdited?.contactType ?? "phone");
  const [contact, setContact] = useState(petBeingEdited?.contactType === "phone" ? formatPhoneContact(petBeingEdited.contact ?? "") : petBeingEdited?.contact ?? "");
  const invalidContact = contactError(contactType, contact);
  const savedContact = petBeingEdited?.contact;
  if (petBeingEdited && mode === "view") {
    return (
      <div className="screen pet-passport-screen">
        <DogmeetHeader onBack={onBack} />
        <h1>Паспорт питомца</h1>
        <Image className="portrait" data-pet-photo={petBeingEdited.id} src={petBeingEdited.photoUrl} alt={petBeingEdited.name} width={390} height={300} unoptimized={petBeingEdited.photoUrl.startsWith("/api/")} />
        <div className="pet-title"><h2>{petBeingEdited.name}</h2><span>{petBeingEdited.isOwner ? "Ваш питомец" : "Общий питомец"}</span></div>
        <dl className="facts"><div><dt>Порода</dt><dd>{petBeingEdited.breed}</dd></div><div><dt>Хозяин</dt><dd>{petBeingEdited.ownerName}</dd></div>{savedContact && <PetContactRow contact={savedContact} type={petBeingEdited.contactType} />}</dl>
        {petBeingEdited.canEdit && <button className="menu-row" type="button" onClick={onEdit}><Pencil aria-hidden="true" /><span><strong>Изменить данные</strong><small>Имя, порода, фото и контакт</small></span><ChevronRight /></button>}
        {petBeingEdited.canShare && <ShareMenuRow kind="pet" onClick={onShare} />}
        {petBeingEdited.canDelete && <button className="menu-row" type="button" onClick={onDelete}><Trash2 aria-hidden="true" /><span><strong>{petBeingEdited.isOwner ? "Удалить питомца" : "Убрать из моего списка"}</strong><small>{petBeingEdited.isOwner ? "Вместе с его прогулками" : "У владельца питомец останется"}</small></span><ChevronRight /></button>}
      </div>
    );
  }

  const editing = Boolean(petBeingEdited);
  const formValid = nameValid && ownerNameValid && breedValid && !invalidContact;
  const preview = photoUrl || petBeingEdited?.photoUrl || "/dog-placeholder.avif";
  return (
    <div className="screen form-screen pet-screen">
      <DogmeetHeader onBack={photoOpen ? () => setPhotoOpen(false) : onBack} />
      <h1>{photoOpen ? "Фотография" : editing ? "Изменить питомца" : "Добавить питомца"}</h1>
      <p hidden={photoOpen || saving || Boolean(submitError)}>{editing ? "Актуальные данные помогут узнать вас на прогулке." : "Соседи запомнят не анкету, а добрую морду."}</p>
      {saving && <DogmeetState state="loading" title="Сохраняем…" />}
      {submitError && !saving && <DogmeetState state="error" title="Не удалось сохранить" message={submitError} onAction={() => onNameChange(name)} onBack={onBack} />}
      <form className="pet-form" autoComplete="off" hidden={saving || Boolean(submitError)} onSubmit={onSubmit} aria-busy={saving} noValidate>
        {photoOpen && <Image className="photo-preview" src={preview} alt="Предпросмотр фотографии" width={346} height={346} unoptimized />}
        <label className="upload" hidden={!photoOpen}><Camera /><strong>Выбрать файл</strong><input name="photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhotoChange} /></label>
        {photoOpen && <><p>JPG, PNG или WebP до 20 МБ. Выберите снимок, на котором хорошо видно питомца.</p>{photoError && <p className="field-error" role="alert">{photoError}</p>}<button className="button" type="button" disabled={Boolean(photoError)} onClick={() => setPhotoOpen(false)}>Использовать фото</button></>}
        <div hidden={photoOpen}>
        <button type="button" className="photo-editor" onClick={() => setPhotoOpen(true)}>
          <Image src={preview} alt="Фотография" width={86} height={86} unoptimized />
          <span><Camera aria-hidden="true" />{editing ? "Изменить фотографию" : "Выбрать фотографию"}</span>
        </button>
        {photoError && <p className="field-error" role="alert">{photoError}</p>}
        <label className="field"><span>Имя питомца</span><SingleLineInput autoComplete="off" aria-label="Имя питомца" name="petName" value={name} required maxLength={40} placeholder="Например, Боня" aria-invalid={Boolean(touchedFields["pet-name"] && !nameValid)} onBlur={() => onTouch("pet-name")} onChange={(event) => onNameChange(event.target.value)} />{touchedFields["pet-name"] && !nameValid && <small className="field-error">Введите имя питомца</small>}</label>
        <label className="field"><span>Порода</span><SingleLineInput autoComplete="off" aria-label="Порода" name="breed" value={breed} required maxLength={MAX_BREED_LENGTH} placeholder="Например, корги" aria-invalid={Boolean(touchedFields["pet-breed"] && !breedValid)} onBlur={() => onTouch("pet-breed")} onChange={(event) => onBreedChange(event.target.value)} />{touchedFields["pet-breed"] && !breedValid && <small className="field-error">Введите породу</small>}</label>
        <label className="field"><span>Имя хозяина</span><SingleLineInput autoComplete="off" aria-label="Имя хозяина" name="ownerName" value={ownerName} required maxLength={60} placeholder="Например, Анна" aria-invalid={Boolean(touchedFields["owner-name"] && !ownerNameValid)} onBlur={() => onTouch("owner-name")} onChange={(event) => onOwnerNameChange(event.target.value)} />{touchedFields["owner-name"] && !ownerNameValid && <small className="field-error">Введите имя хозяина</small>}</label>
        <label className="field"><span>Тип контакта</span><select aria-label="Тип контакта" name="contactType" value={contactType} onChange={(event) => { setContactType(event.target.value as ContactType); setContact(""); onTouch("contact-type"); }}><option value="phone">Телефон</option><option value="telegram">Telegram</option><option value="other">Другое</option></select></label>
        <label className="field"><span>Контакт</span>
          <input type="hidden" name="contact" value={contact} />
          <span className={contactType === "telegram" ? "contact-control contact-input" : "contact-control"}>
            {contactType === "telegram" && <span className="contact-prefix" aria-hidden="true">@</span>}
            <SingleLineInput aria-label="Контакт" type={contactType === "phone" ? "tel" : "text"} inputMode={contactType === "phone" ? "tel" : "text"} autoCapitalize="none" spellCheck={false} maxLength={contactType === "phone" ? 18 : contactType === "telegram" ? 32 : 120} value={contactType === "telegram" ? contact.replace(/^@/, "") : contact} placeholder={contactType === "phone" ? "+7 (911) 123 31-11" : contactType === "telegram" ? "myName" : "Как с вами связаться"} aria-invalid={Boolean(touchedFields.contact && invalidContact)} aria-describedby={touchedFields.contact && invalidContact ? "pet-contact-error" : undefined} onBlur={() => onTouch("contact")} onChange={(event) => {
              const input = event.currentTarget;
              let value = input.value;
              if (contactType === "phone") {
                let caret = input.selectionStart ?? value.length;
                // Removing a mask separator should delete the adjacent digit as well.
                if ((event.nativeEvent as InputEvent).inputType === "deleteContentBackward" && value.replace(/\D/g, "") === contact.replace(/\D/g, "")) {
                  const before = value.slice(0, caret).replace(/\d(?=\D*$)/, "");
                  value = before + value.slice(caret);
                  caret = before.length;
                }
                const digitsBeforeCaret = value.slice(0, caret).replace(/\D/g, "").length;
                const digitCount = value.replace(/\D/g, "").length;
                value = formatPhoneContact(value);
                const caretDigits = digitsBeforeCaret + Math.max(0, value.replace(/\D/g, "").length - digitCount);
                const nextCaret = caretDigits ? [...value.matchAll(/\d/g)][caretDigits - 1]?.index : 0;
                const position = nextCaret === undefined ? value.length : nextCaret + (caretDigits ? 1 : 0);
                requestAnimationFrame(() => input.setSelectionRange(position, position));
              } else if (contactType === "telegram") {
                value = value.replace(/^@+/, "");
                value = value ? "@" + value : "";
              }
              setContact(value);
            }} />
          </span>
          {touchedFields.contact && invalidContact && <small className="field-error" id="pet-contact-error">{invalidContact}</small>}
        </label>
        {submitError && <p className="field-error" role="alert">{submitError}</p>}
        <button className="button" type="submit" disabled={!formValid || Boolean(photoError) || saving}>{saving ? "Сохраняем…" : editing ? "Сохранить изменения" : "Добавить питомца"}</button>
        </div>
      </form>
    </div>
  );
}
