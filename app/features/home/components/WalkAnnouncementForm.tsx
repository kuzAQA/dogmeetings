"use client";

import { ArrowRight, Check, ChevronDown, ChevronRight, Clock3, MapPin, Plus, Search } from "lucide-react";
import Image from "next/image";
import { type FormEvent, useState } from "react";
import { DogmeetDialog, DogmeetHeader, requestDialogClose } from "../../../components/ui/DogmeetFrame";
import { DogmeetState } from "../../../components/ui/DogmeetState";
import type { Pet, SharedPlace } from "../model";
import { MAX_WALK_COMMENT_LENGTH, MAX_WALK_PLACE_LENGTH } from "../model";
import type { WalkFormState } from "../use-walk-form";

type Props = {
  inDock?: boolean;
  guidedWalkFlow: boolean;
  savedPets: Pet[];
  sharedPlaces: SharedPlace[];
  locationName: string;
  onAddPet: () => void;
  placesLoaded: boolean;
  placesError?: string;
  onRetryPlaces?: () => void;
  walkForm: WalkFormState;
  walkSaving: boolean;
  editing: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onBack?: () => void;
};

export function WalkAnnouncementForm({ inDock = false, savedPets, sharedPlaces, locationName, onAddPet, placesLoaded, placesError = "", onRetryPlaces, walkForm, walkSaving, editing, onSubmit, onBack }: Props) {
  const { dockFormRef, touchedFields, submitError, placeInput, scheduleType, selectedPetId, walkTime, walkComment, placeIsValid, timeIsValid, touchField, changeScheduleType, selectPet, updatePlaceInput, chooseSharedPlace, changeWalkTime, changeWalkComment } = walkForm;
  const [picker, setPicker] = useState<"pet" | "place" | "time" | null>(null);
  const [query, setQuery] = useState("");
  const [customPlace, setCustomPlace] = useState("");
  const selectedPet = savedPets.find((pet) => pet.id === selectedPetId);
  const matchingPlaces = sharedPlaces.filter((place) => place.name.toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru")));
  return (
    <>
      {!inDock && onBack && <DogmeetHeader onBack={onBack} />}
      <h1 id={inDock ? "dock-walk-title" : undefined}>{editing ? "Изменить прогулку" : "Сообщить о прогулке"}</h1>
      <p hidden={walkSaving || Boolean(submitError)}>{editing ? "Поменялись планы? Обновите детали." : "Расскажите соседям, где вас найти."}</p>
      {walkSaving && <DogmeetState state="loading" title="Сохраняем…" />}
      {submitError && !walkSaving && <DogmeetState state="error" title="Не удалось сохранить" message={submitError} onAction={() => walkForm.setSubmitError("")} onBack={onBack} />}
      <form ref={dockFormRef} className="announce-form" hidden={walkSaving || Boolean(submitError)} onSubmit={onSubmit} aria-busy={walkSaving} noValidate>
        <input type="hidden" name="pet" value={selectedPetId} />
        <input type="hidden" name="place" value={placeInput} />
        <input type="hidden" name="walkTime" value={walkTime} />
        <button type="button" className="selected-pet" aria-label="Питомец" onClick={() => setPicker("pet")}>
          {selectedPet && <Image className="pet-face" src={selectedPet.photoUrl} alt={selectedPet.name} width={60} height={60} unoptimized={selectedPet.photoUrl.startsWith("/api/")} />}
          <span><small>Иду гулять с</small><strong>{selectedPet?.name || "Выберите питомца"}</strong></span>
          <ChevronDown aria-hidden="true" />
        </button>
        {touchedFields["walk-pet"] && !selectedPetId && <p className="field-error">Выберите питомца</p>}

        <div className="field"><span>Когда</span></div><div className="segmented schedule-buttons" role="group" aria-label="Когда">{[["today", "Сегодня"], ["tomorrow", "Завтра"], ["always", "Ежедневно"]].map(([value, label]) => <button key={value} type="button" aria-pressed={scheduleType === value} onClick={() => changeScheduleType(value as "today" | "tomorrow" | "always", inDock)}>{label}</button>)}</div>

        <div className="walk-settings">
          <button type="button" className="menu-row" onClick={() => setPicker("time")}><Clock3 aria-hidden="true" /><span><strong>Время</strong><small>{walkTime || "Выберите время"}</small></span><ChevronRight aria-hidden="true" /></button>
          <button type="button" className="menu-row" onClick={() => { setQuery(""); setCustomPlace(""); setPicker("place"); }}><MapPin aria-hidden="true" /><span><strong>Место встречи</strong><small>{placeInput || "Выберите место"}</small></span><ChevronRight aria-hidden="true" /></button>
        </div>
        {touchedFields["walk-time"] && !timeIsValid && <p className="field-error">Выберите время</p>}
        {touchedFields["walk-place"] && !placeIsValid && <p className="field-error">Укажите место прогулки</p>}

        <label className="field"><span>Комментарий <small>необязательно</small></span><textarea id="walk-comment" name="comment" value={walkComment} maxLength={MAX_WALK_COMMENT_LENGTH} placeholder="Например, возьмём мячик" onChange={(event) => changeWalkComment(event.target.value, inDock)} /><small className="counter">{walkComment.length}/{MAX_WALK_COMMENT_LENGTH}</small></label>
        <div className="note"><MapPin aria-hidden="true" />Прогулка появится в районе {locationName}.</div>
        {submitError && <p className="field-error" role="alert">{submitError}</p>}
        <button className="button" type="submit" disabled={walkSaving}>{walkSaving ? "Сохраняем…" : editing ? "Сохранить изменения" : "Сообщить о прогулке"}<ArrowRight aria-hidden="true" /></button>
      </form>
      {picker === "pet" && <DogmeetDialog title="С кем гуляем" onDismiss={() => setPicker(null)}>
        <div className="pet-rows">{savedPets.map((pet) => <button type="button" className="pet-row" key={pet.id} onClick={(event) => { selectPet(pet.id, inDock); requestDialogClose(event.currentTarget); }}><Image className="pet-face" src={pet.photoUrl} alt={pet.name} width={55} height={55} unoptimized /><span><strong>{pet.name}</strong><small>{pet.breed} · {pet.ownerName}</small><em>{pet.isOwner ? "Ваш питомец" : "Общий питомец"}</em></span>{pet.id === selectedPetId ? <Check /> : <ChevronRight />}</button>)}</div>
        <button type="button" className="button quiet" onClick={(event) => requestDialogClose(event.currentTarget, onAddPet)}><Plus />Добавить питомца</button>
      </DogmeetDialog>}
      {picker === "time" && <DogmeetDialog title={scheduleType === "always" ? "Встречаемся каждый день" : scheduleType === "tomorrow" ? "Встречаемся завтра" : "Встречаемся сегодня"} onDismiss={() => setPicker(null)}>
        <div className="time-picker"><Clock3 /><span>Время прогулки</span><div className="time-input"><span className={walkTime ? "time-input-value" : "time-input-placeholder"} aria-hidden="true">{walkTime || "Выберите время"}</span><input type="time" name="walkTime" step={300} aria-label="Время прогулки" value={walkTime} aria-invalid={Boolean(touchedFields["walk-time"] && !timeIsValid)} onChange={(event) => changeWalkTime(event.target.value, inDock)} onBlur={() => touchField("walk-time")} /></div></div>
        <button type="button" className="button" disabled={!timeIsValid} onClick={(event) => requestDialogClose(event.currentTarget)}>Готово<Check /></button>
      </DogmeetDialog>}
      {picker === "place" && <DogmeetDialog className="sheet--place-picker" title="Место встречи" onDismiss={() => setPicker(null)}>
        <label className="search-field"><Search /><input aria-label="Найти место" placeholder="Название места" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="place-picker-list">{!placesLoaded ? <p role="status">Загружаем места…</p> : placesError ? <div role="alert"><p className="field-error">{placesError}</p><button className="button" type="button" onClick={onRetryPlaces}>Повторить</button></div> : <div className="option-list">{matchingPlaces.map((place) => <button key={place.id} type="button" onClick={(event) => { chooseSharedPlace(place, inDock); requestDialogClose(event.currentTarget); }}><MapPin /><span>{place.name}</span>{place.name === placeInput ? <Check /> : <ChevronRight />}</button>)}</div>}
        {placesLoaded && !placesError && !matchingPlaces.length && <p>Совпадений нет. Укажите своё место.</p>}</div>
        <form className="place-picker-footer" onSubmit={(event) => { event.preventDefault(); updatePlaceInput(customPlace.trim(), inDock); requestDialogClose(event.currentTarget.querySelector<HTMLButtonElement>("button")); }}>
          <label className="field"><span>Или своё место встречи</span><input name="place" value={customPlace} maxLength={MAX_WALK_PLACE_LENGTH} placeholder="Например, у входа в сквер" onChange={(event) => setCustomPlace(event.target.value)} /></label>
          <button className="button" type="submit" disabled={!/[\p{L}]/u.test(customPlace.trim())}>Выбрать место<ArrowRight /></button>
        </form>
      </DogmeetDialog>}
    </>
  );
}
