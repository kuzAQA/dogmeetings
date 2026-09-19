"use client";

import { Check, ChevronDown, ChevronRight, Clock3, MapPin, Search } from "lucide-react";
import Image from "next/image";
import { type FocusEvent, type FormEvent, type MouseEvent, type PointerEvent, useState } from "react";
import { WheelPicker, WheelPickerWrapper } from "@ncdai/react-wheel-picker";
import { DogmeetDialog, DogmeetHeader, requestDialogClose } from "../../../components/ui/DogmeetFrame";
import { DogmeetState } from "../../../components/ui/DogmeetState";
import type { Pet, SharedPlace } from "../model";
import { MAX_WALK_COMMENT_LENGTH, MAX_WALK_PLACE_LENGTH } from "../model";
import { getMinimumWalkTime, type WalkFormState } from "../use-walk-form";

const hourOptions = Array.from({ length: 24 }, (_, hour) => {
  const value = String(hour).padStart(2, "0");
  return { value, label: value };
});

const minuteOptions = Array.from({ length: 12 }, (_, index) => {
  const value = String(index * 5).padStart(2, "0");
  return { value, label: value };
});

function normalizePickerTime(hour: string, minute: string, minimum: string) {
  const value = `${hour}:${minute}`;
  return value < minimum ? minimum : value;
}

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
  const { dockFormRef, touchedFields, submitError, placeInput, scheduleType, selectedPetId, walkTime, walkComment, placeIsValid, timeIsValid, changeScheduleType, selectPet, updatePlaceInput, chooseSharedPlace, changeWalkTime, changeWalkComment } = walkForm;
  const [picker, setPicker] = useState<"pet" | "place" | "time" | null>(null);
  const [timeDraft, setTimeDraft] = useState("");
  const [timePickerError, setTimePickerError] = useState("");
  const [query, setQuery] = useState("");
  const [customPlace, setCustomPlace] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<SharedPlace | null>(null);
  const selectedPet = savedPets.find((pet) => pet.id === selectedPetId);
  const matchingPlaces = sharedPlaces.filter((place) => place.name.toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru")));
  const minimumTime = scheduleType === "today" ? getMinimumWalkTime() : "00:00";
  const [draftHour = "00", draftMinute = "00"] = timeDraft.split(":");
  const hourOptionsForPicker = hourOptions.map((option) => ({ ...option, disabled: scheduleType === "today" && option.value < minimumTime.slice(0, 2) }));
  const minuteOptionsForPicker = minuteOptions.map((option) => ({ ...option, disabled: scheduleType === "today" && draftHour === minimumTime.slice(0, 2) && option.value < minimumTime.slice(3) }));
  const minutePickerInfinite = scheduleType !== "today" || !minuteOptionsForPicker.some((option) => option.disabled);

  function openTimePicker() {
    setTimePickerError("");
    setTimeDraft(walkTime && walkTime >= minimumTime ? walkTime : minimumTime);
    setPicker("time");
  }

  function changeTimeDraft(part: "hour" | "minute", value: string) {
    const nextHour = part === "hour" ? value : draftHour;
    const nextMinute = part === "minute" ? value : draftMinute;
    setTimePickerError("");
    setTimeDraft(normalizePickerTime(nextHour, nextMinute, minimumTime));
  }

  function applyTimeDraft(event: MouseEvent<HTMLButtonElement>) {
    const currentMinimumTime = scheduleType === "today" ? getMinimumWalkTime() : "00:00";
    if (scheduleType === "today" && timeDraft < currentMinimumTime) {
      setTimeDraft(currentMinimumTime);
      setTimePickerError("Укажите время позже текущего.");
      return;
    }
    changeWalkTime(timeDraft, inDock);
    void requestDialogClose(event.currentTarget);
  }

  function focusCustomPlace(event: PointerEvent<HTMLTextAreaElement>) {
    if (document.activeElement !== event.currentTarget) event.currentTarget.focus({ preventScroll: true });
  }

  function scrollWalkFormAfterKeyboard(event: FocusEvent<HTMLTextAreaElement>) {
    const viewport = window.visualViewport;
    if (editing || !viewport || !window.matchMedia("(max-width: 899px)").matches) return;
    const controller = new AbortController();
    const viewportHeight = viewport.height;
    const scrollToFormEnd = () => {
      if (viewport.height >= viewportHeight) return;
      requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
    };
    event.currentTarget.addEventListener("blur", () => {
      controller.abort();
    }, { once: true });
    viewport.addEventListener("resize", scrollToFormEnd, { signal: controller.signal });
    requestAnimationFrame(scrollToFormEnd);
  }

  function applyPlace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedPlace) chooseSharedPlace(selectedPlace, inDock);
    else updatePlaceInput(customPlace.trim(), inDock);
    void requestDialogClose(event.currentTarget.querySelector<HTMLButtonElement>("button"));
  }

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
          <button type="button" className="menu-row" onClick={openTimePicker}><Clock3 aria-hidden="true" /><span><strong>Время</strong><small>{walkTime || "Выберите время"}</small></span><ChevronRight aria-hidden="true" /></button>
          <button type="button" className="menu-row" onClick={() => { setQuery(""); setCustomPlace(""); setSelectedPlace(null); setPicker("place"); }}><MapPin aria-hidden="true" /><span><strong>Место встречи</strong><small>{placeInput || "Выберите место"}</small></span><ChevronRight aria-hidden="true" /></button>
        </div>
        {touchedFields["walk-time"] && !timeIsValid && <p className="field-error">Выберите время</p>}
        {touchedFields["walk-place"] && !placeIsValid && <p className="field-error">Укажите место прогулки</p>}

        <label className="field"><span>Комментарий <small>необязательно</small></span><textarea id="walk-comment" name="comment" value={walkComment} maxLength={MAX_WALK_COMMENT_LENGTH} placeholder="Например, возьмём мячик" onFocus={scrollWalkFormAfterKeyboard} onChange={(event) => changeWalkComment(event.target.value, inDock)} /><small className="counter">{walkComment.length}/{MAX_WALK_COMMENT_LENGTH}</small></label>
        <div className="note"><MapPin aria-hidden="true" />Прогулка появится в районе {locationName}.</div>
        {submitError && <p className="field-error" role="alert">{submitError}</p>}
        <button className="button" type="submit" disabled={walkSaving}>{walkSaving ? "Сохраняем…" : editing ? "Сохранить изменения" : "Сообщить о прогулке"}</button>
      </form>
      <DogmeetDialog open={picker === "pet"} title="С кем гуляем" onDismiss={() => setPicker(null)} onDismissStart={() => setPicker(null)} footer={<button type="button" className="button quiet" onClick={(event) => requestDialogClose(event.currentTarget, onAddPet)}>Добавить питомца</button>}>
        <div className="pet-rows">{savedPets.map((pet) => <button type="button" className="pet-row" key={pet.id} onClick={(event) => { selectPet(pet.id, inDock); requestDialogClose(event.currentTarget); }}><Image className="pet-face" src={pet.photoUrl} alt={pet.name} width={55} height={55} unoptimized /><span><strong>{pet.name}</strong><small>{pet.breed} · {pet.ownerName}</small><em>{pet.isOwner ? "Ваш питомец" : "Общий питомец"}</em></span></button>)}</div>
      </DogmeetDialog>
      <DogmeetDialog open={picker === "time"} title={scheduleType === "always" ? "Встречаемся каждый день" : scheduleType === "tomorrow" ? "Встречаемся завтра" : "Встречаемся сегодня"} onDismiss={() => setPicker(null)} onDismissStart={() => setPicker(null)} footer={<button type="button" className="button" onClick={applyTimeDraft}>Готово</button>}>
        <div className="time-picker">
          <Clock3 aria-hidden="true" />
          <span>Время прогулки</span>
          <div className="time-picker-group" role="group" aria-label="Время прогулки">
            <WheelPickerWrapper className="time-picker-wheels">
              <div className="time-wheel"><span className="visually-hidden">Часы</span><WheelPicker value={draftHour} options={hourOptionsForPicker} onValueChange={(value) => changeTimeDraft("hour", value)} infinite={scheduleType !== "today"} visibleCount={8} optionItemHeight={42} /></div>
              <span className="time-picker-separator" aria-hidden="true">:</span>
              <div className="time-wheel"><span className="visually-hidden">Минуты</span><WheelPicker value={draftMinute} options={minuteOptionsForPicker} onValueChange={(value) => changeTimeDraft("minute", value)} infinite={minutePickerInfinite} visibleCount={8} optionItemHeight={42} /></div>
            </WheelPickerWrapper>
            {timePickerError && <p className="field-error" role="alert">{timePickerError}</p>}
          </div>
        </div>
      </DogmeetDialog>
      <DogmeetDialog open={picker === "place"} className="sheet--place-picker" title="Место встречи" onDismiss={() => setPicker(null)} onDismissStart={() => setPicker(null)} footer={<>
        {placesError && <button className="button" type="button" onClick={onRetryPlaces}>Повторить</button>}
        <form className="place-picker-footer" autoComplete="off" onSubmit={applyPlace}>
          <label className="field"><span>Или своё место встречи</span><textarea className="single-line-input" rows={1} autoComplete="off" value={customPlace} maxLength={MAX_WALK_PLACE_LENGTH} placeholder="Например, у входа в сквер" onPointerDown={focusCustomPlace} onChange={(event) => { setSelectedPlace(null); setCustomPlace(event.target.value); }} /></label>
          <button className="button" type="submit" disabled={!selectedPlace && !/[\p{L}]/u.test(customPlace.trim())}>Выбрать место</button>
        </form>
      </>}>
        <label className="search-field"><Search /><textarea className="single-line-input" rows={1} inputMode="text" autoComplete="off" enterKeyHint="search" aria-label="Найти место" placeholder="Название места" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <div className="place-picker-list">{!placesLoaded ? <p role="status">Загружаем места…</p> : placesError ? <div role="alert"><p className="field-error">{placesError}</p></div> : <div className="option-list">{matchingPlaces.map((place) => <button key={place.id} type="button" aria-pressed={selectedPlace?.id === place.id} onClick={() => { setCustomPlace(""); setSelectedPlace(place); }}><span>{place.name}</span>{selectedPlace?.id === place.id && <Check aria-hidden="true" />}</button>)}</div>}
        {placesLoaded && !placesError && !matchingPlaces.length && <p>Совпадений нет. Укажите своё место.</p>}</div>
      </DogmeetDialog>
    </>
  );
}
