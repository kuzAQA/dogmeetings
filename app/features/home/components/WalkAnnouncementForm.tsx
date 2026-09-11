"use client";

import { ChevronDown } from "lucide-react";
import type { FormEvent } from "react";
import { DropdownSelect } from "../../../components/ui/DropdownSelect";
import { TimeDropdown } from "../../../components/ui/TimeDropdown";
import { WalkSetupStepper } from "../../../components/ui/WalkSetupStepper";
import type { Pet } from "../model";
import { MAX_WALK_COMMENT_LENGTH, MAX_WALK_PLACE_LENGTH, normalizePlaceForComparison } from "../model";
import type { WalkFormState } from "../use-walk-form";

type WalkAnnouncementFormProps = {
  inDock?: boolean;
  guidedWalkFlow: boolean;
  savedPets: Pet[];
  placesLoaded: boolean;
  walkForm: WalkFormState;
  walkSaving: boolean;
  editing: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

const scheduleIndicatorLeft = {
  today: "0",
  tomorrow: "calc(33.333333% + 2.666667px)",
  always: "calc(66.666667% + 5.333333px)"
};

export function WalkAnnouncementForm({
  inDock = false,
  guidedWalkFlow,
  savedPets,
  placesLoaded,
  walkForm,
  walkSaving,
  editing,
  onSubmit
}: WalkAnnouncementFormProps) {
  const {
    dockFormRef,
    touchedFields,
    submitError,
    placeInput,
    placeSuggestionsVisible,
    scheduleType,
    selectedPetId,
    walkTime,
    walkTimePickerOpen,
    walkComment,
    matchingSharedPlaces,
    placeIsValid,
    timeIsValid,
    formIsValid,
    touchField,
    setPlaceMenuOpen,
    setWalkTimePickerOpen,
    changeScheduleType,
    selectPet,
    updatePlaceInput,
    chooseSharedPlace,
    changeWalkTime,
    changeWalkComment
  } = walkForm;

  return (
    <>
      {!inDock && guidedWalkFlow && (
        <div className="guided-form-topbar">
          <WalkSetupStepper step={2} />
        </div>
      )}
      <div className="screen-heading">
        <h1 id={inDock ? "dock-walk-title" : undefined}>Сообщить о прогулке</h1>
        <p>Укажите, с кем, где и когда вы будете гулять</p>
      </div>
      <form ref={inDock ? dockFormRef : undefined} className="announce-form" onSubmit={onSubmit} aria-busy={walkSaving} noValidate>
        <div className="field">
          <span>Ваш питомец</span>
          <DropdownSelect
            id="walk-pet"
            name="pet"
            ariaLabel="Ваш питомец"
            value={selectedPetId}
            options={savedPets.map((pet) => ({ value: pet.id, label: pet.name }))}
            placeholder={savedPets.length === 0 ? "Сначала добавьте питомца" : "Выберите питомца"}
            emptyText="У вас пока нет добавленных питомцев"
            disabled={savedPets.length === 0}
            invalid={Boolean(touchedFields["walk-pet"] && !selectedPetId)}
            describedBy={touchedFields["walk-pet"] && !selectedPetId ? "walk-pet-hint" : undefined}
            onBlur={() => touchField("walk-pet")}
            onChange={(petId) => selectPet(petId, inDock)}
          />
          {touchedFields["walk-pet"] && !selectedPetId && <p className="validation-hint" id="walk-pet-hint">Выберите питомца</p>}
        </div>
        <div className="field text-field place-field">
          <label htmlFor="walk-place">Место прогулки</label>
          <div
            className="place-combobox"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setPlaceMenuOpen(false);
                touchField("walk-place");
              }
            }}
          >
            <input
              id="walk-place"
              name="place"
              value={placeInput}
              required
              maxLength={MAX_WALK_PLACE_LENGTH}
              autoComplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-controls="shared-place-options"
              aria-expanded={placeSuggestionsVisible}
              aria-invalid={Boolean(touchedFields["walk-place"] && !placeIsValid)}
              aria-describedby={touchedFields["walk-place"] && !placeIsValid ? "walk-place-hint" : undefined}
              placeholder="Выберите место или укажите своё"
              onFocus={() => setPlaceMenuOpen(true)}
              onChange={(event) => updatePlaceInput(event.target.value, inDock)}
            />
            <button
              className="place-menu-toggle"
              type="button"
              aria-label={placeSuggestionsVisible ? "Закрыть список мест" : "Открыть список мест"}
              aria-expanded={placeSuggestionsVisible}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                if (placeSuggestionsVisible) {
                  setPlaceMenuOpen(false);
                } else if (!placeInput.trim() || matchingSharedPlaces.length > 0) {
                  setPlaceMenuOpen(true);
                }
              }}
            >
              <ChevronDown aria-hidden="true" />
            </button>
            {placeSuggestionsVisible && (
              <div className="place-options" id="shared-place-options" role="listbox" aria-label="Общие места прогулок">
                {!placesLoaded ? (
                  <p className="place-options-status">Загружаем места…</p>
                ) : matchingSharedPlaces.length > 0 ? matchingSharedPlaces.map((place) => (
                  <button
                    className="place-option"
                    key={place.id}
                    type="button"
                    role="option"
                    aria-selected={normalizePlaceForComparison(place.name) === normalizePlaceForComparison(placeInput)}
                    onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                    onClick={(event) => { event.preventDefault(); event.stopPropagation(); chooseSharedPlace(place, inDock); }}
                  >
                    {place.name}
                  </button>
                )) : (
                  <p className="place-options-status">Пока нет добавленных мест</p>
                )}
              </div>
            )}
          </div>
          {touchedFields["walk-place"] && !placeIsValid && (
            <p className="validation-hint" id="walk-place-hint">
              {placeInput.trim().length > MAX_WALK_PLACE_LENGTH
                ? `Название места должно содержать не более ${MAX_WALK_PLACE_LENGTH} символов`
                : placeInput.trim() ? "Название места должно содержать хотя бы одну букву" : "Укажите место прогулки"}
            </p>
          )}
        </div>
        <fieldset className="schedule-field">
          <legend>День прогулки</legend>
          <div className="filters schedule-buttons">
            <span className="filter-indicator schedule-indicator" aria-hidden="true" style={{ left: scheduleIndicatorLeft[scheduleType] }} />
            {([ ["today", "Сегодня"], ["tomorrow", "Завтра"], ["always", "Всегда"] ] as const).map(([value, label]) => (
              <button key={value} type="button" className={`filter-button schedule-button ${scheduleType === value ? "active" : ""}`} aria-pressed={scheduleType === value} onClick={() => changeScheduleType(value, inDock)}>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <span>Время прогулки</span>
          <TimeDropdown
            value={walkTime}
            futureOnly={scheduleType === "today"}
            invalid={Boolean(!walkTimePickerOpen && touchedFields["walk-time"] && !timeIsValid)}
            describedBy={!walkTimePickerOpen && touchedFields["walk-time"] && !timeIsValid ? "walk-time-hint" : undefined}
            onOpenChange={(open) => { setWalkTimePickerOpen(open); if (!open) touchField("walk-time"); }}
            onChange={(time) => changeWalkTime(time, inDock)}
          />
          {!walkTimePickerOpen && touchedFields["walk-time"] && !timeIsValid && <p className="validation-hint" id="walk-time-hint">Выберите время прогулки</p>}
        </div>
        <div className="field comment-field">
          <label htmlFor="walk-comment">Комментарий <span>(необязательно)</span></label>
          <input id="walk-comment" name="comment" maxLength={MAX_WALK_COMMENT_LENGTH} value={walkComment} placeholder="Например, возьмём мячик" onChange={(event) => changeWalkComment(event.target.value, inDock)} />
          <small>{walkComment.length}/{MAX_WALK_COMMENT_LENGTH}</small>
        </div>
        {(submitError || savedPets.length === 0) && <p className="error-message" role="alert">{submitError || "Сначала добавьте питомца через меню."}</p>}
        {!inDock && (
          <button className="primary-button form-submit" type="submit" disabled={!formIsValid || walkSaving}>
            {walkSaving ? "Сохраняем…" : editing ? "Сохранить" : "Сообщить о прогулке"}
          </button>
        )}
      </form>
      {walkSaving && (
        <div className="saving-overlay" role="status" aria-live="polite">
          <p>Информация о прогулке сохраняется</p>
        </div>
      )}
    </>
  );
}
