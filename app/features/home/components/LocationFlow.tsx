"use client";

import type { FormEvent } from "react";
import { DropdownSelect } from "../../../components/ui/DropdownSelect";
import type { SelectOption } from "../selectors";
import type { Location } from "../model";

type LocationEditorProps = {
  location: Location;
  cityOptions: SelectOption[];
  districtOptions: SelectOption[];
  complexOptions: SelectOption[];
  locationsLoaded: boolean;
  locationsError: string;
  hasLocation: boolean;
  saving: boolean;
  submitError: string;
  touchedFields: Record<string, boolean>;
  valid: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTouch: (field: string) => void;
  onCityChange: (value: string) => void;
  onDistrictChange: (value: string) => void;
  onComplexChange: (value: string) => void;
  onRequestLocation: () => void;
};

export function LocationEditor({
  location,
  cityOptions,
  districtOptions,
  complexOptions,
  locationsLoaded,
  locationsError,
  hasLocation,
  saving,
  submitError,
  touchedFields,
  valid,
  onSubmit,
  onTouch,
  onCityChange,
  onDistrictChange,
  onComplexChange,
  onRequestLocation
}: LocationEditorProps) {
  return (
    <div className="screen form-screen location-screen">
      <div className="screen-heading">
        <h1>Где будем гулять?</h1>
        <p>Выберите локацию, чтобы увидеть прогулки рядом</p>
      </div>
      <form className="location-form" onSubmit={onSubmit} noValidate>
        <div className="field">
          <span>Город</span>
          <DropdownSelect
            id="location-city"
            ariaLabel="Город"
            value={location.city}
            options={cityOptions}
            placeholder={locationsLoaded ? "Выберите город" : "Загружаем города…"}
            emptyText="Пока нет доступных городов"
            disabled={!locationsLoaded || cityOptions.length === 0}
            invalid={Boolean(touchedFields["location-city"] && !location.city)}
            describedBy={touchedFields["location-city"] && !location.city ? "location-city-hint" : undefined}
            onBlur={() => onTouch("location-city")}
            onChange={onCityChange}
          />
          {touchedFields["location-city"] && !location.city && <p className="validation-hint" id="location-city-hint">Выберите город</p>}
        </div>
        <div className="field">
          <span>Район</span>
          <DropdownSelect
            id="location-district"
            ariaLabel="Район"
            value={location.district}
            options={districtOptions}
            placeholder={locationsLoaded ? "Выберите район" : "Загружаем районы…"}
            emptyText="Пока нет доступных районов"
            disabled={!locationsLoaded || districtOptions.length === 0}
            invalid={Boolean(touchedFields["location-district"] && !location.district)}
            describedBy={touchedFields["location-district"] && !location.district ? "location-district-hint" : undefined}
            onBlur={() => onTouch("location-district")}
            onChange={onDistrictChange}
          />
          {touchedFields["location-district"] && !location.district && <p className="validation-hint" id="location-district-hint">Выберите район</p>}
        </div>
        <div className="field">
          <span>Жилой комплекс</span>
          <DropdownSelect
            id="location-complex"
            ariaLabel="Жилой комплекс"
            value={location.complex}
            options={complexOptions}
            placeholder={locationsLoaded ? "Выберите жилой комплекс" : "Загружаем жилые комплексы…"}
            emptyText="Пока нет доступных жилых комплексов"
            disabled={!locationsLoaded || complexOptions.length === 0}
            invalid={Boolean(touchedFields["location-complex"] && !location.complex)}
            describedBy={touchedFields["location-complex"] && !location.complex ? "location-complex-hint" : undefined}
            onBlur={() => onTouch("location-complex")}
            onChange={onComplexChange}
          />
          {touchedFields["location-complex"] && !location.complex && <p className="validation-hint" id="location-complex-hint">Выберите жилой комплекс</p>}
        </div>
        {(locationsError || submitError) && <p className="error-message" role="alert">{locationsError || submitError}</p>}
        <div className="location-form-footer">
          <p className="location-request-prompt">
            Нет вашего города, района, жилого комплекса?{" "}
            <button type="button" onClick={onRequestLocation}>Оставьте заявку</button>
          </p>
          <button className="floating-pet-button location-submit-button" type="submit" disabled={!valid || saving}>
            {saving ? "Сохраняем…" : hasLocation ? "Сохранить" : "Продолжить"}
          </button>
        </div>
      </form>
    </div>
  );
}

type LocationRequestFormProps = {
  location: Location;
  touchedFields: Record<string, boolean>;
  cityValid: boolean;
  districtValid: boolean;
  complexValid: boolean;
  valid: boolean;
  saving: boolean;
  error: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTouch: (field: string) => void;
  onChange: (field: keyof Location, value: string) => void;
};

export function LocationRequestForm({
  location,
  touchedFields,
  cityValid,
  districtValid,
  complexValid,
  valid,
  saving,
  error,
  onSubmit,
  onTouch,
  onChange
}: LocationRequestFormProps) {
  return (
    <div className="screen form-screen location-screen location-request-screen">
      <div className="screen-heading">
        <h1>Оставить заявку</h1>
        <p>Укажите вашу локацию и мы добавим её в ближайшее время</p>
      </div>
      <form className="location-form" onSubmit={onSubmit} aria-busy={saving} noValidate>
        <label className="field text-field">
          <span>Город</span>
          <input
            value={location.city}
            required
            maxLength={80}
            placeholder="Например, Москва"
            aria-invalid={Boolean(touchedFields["request-city"] && !cityValid)}
            aria-describedby={touchedFields["request-city"] && !cityValid ? "request-city-hint" : undefined}
            onBlur={() => onTouch("request-city")}
            onChange={(event) => onChange("city", event.target.value)}
          />
          {touchedFields["request-city"] && !cityValid && <span className="validation-hint" id="request-city-hint">Введите название города</span>}
        </label>
        <label className="field text-field">
          <span>Район</span>
          <input
            value={location.district}
            required
            maxLength={80}
            placeholder="Например, Коммунарка"
            aria-invalid={Boolean(touchedFields["request-district"] && !districtValid)}
            aria-describedby={touchedFields["request-district"] && !districtValid ? "request-district-hint" : undefined}
            onBlur={() => onTouch("request-district")}
            onChange={(event) => onChange("district", event.target.value)}
          />
          {touchedFields["request-district"] && !districtValid && <span className="validation-hint" id="request-district-hint">Введите название района</span>}
        </label>
        <label className="field text-field">
          <span>Жилой комплекс</span>
          <input
            value={location.complex}
            required
            maxLength={120}
            placeholder="Например, Дзен-Кварталы"
            aria-invalid={Boolean(touchedFields["request-complex"] && !complexValid)}
            aria-describedby={touchedFields["request-complex"] && !complexValid ? "request-complex-hint" : undefined}
            onBlur={() => onTouch("request-complex")}
            onChange={(event) => onChange("complex", event.target.value)}
          />
          {touchedFields["request-complex"] && !complexValid && <span className="validation-hint" id="request-complex-hint">Введите название жилого комплекса</span>}
        </label>
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="location-form-footer">
          <button className="primary-button form-submit" type="submit" disabled={!valid || saving}>Отправить</button>
        </div>
      </form>
      {saving && (
        <div className="saving-overlay" role="status" aria-live="polite">
          <p>Идёт отправка заявки</p>
        </div>
      )}
    </div>
  );
}
