"use client";

import { ArrowRight, Clock3, MapPin } from "lucide-react";
import type { FormEvent } from "react";
import { DogmeetHeader } from "../../../components/ui/DogmeetFrame";
import { DogmeetState } from "../../../components/ui/DogmeetState";
import type { Location } from "../model";
import type { SelectOption } from "../selectors";

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
  onBack?: () => void;
};

function SelectField({ label, id, value, options, loaded, touched, onTouch, onChange }: { label: string; id: string; value: string; options: SelectOption[]; loaded: boolean; touched: boolean; onTouch: () => void; onChange: (value: string) => void }) {
  return <label className="field"><span>{label}</span><select id={id} aria-label={label} value={value} disabled={!loaded || !options.length} aria-invalid={touched && !value} onBlur={onTouch} onChange={(event) => onChange(event.target.value)}><option value="" disabled hidden>{loaded ? `Выберите ${label.toLowerCase()}` : "Загрузка…"}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{touched && !value && <small className="field-error">Выберите {label.toLowerCase()}</small>}</label>;
}

export function LocationEditor({ location, cityOptions, districtOptions, complexOptions, locationsLoaded, locationsError, hasLocation, saving, submitError, touchedFields, valid, onSubmit, onTouch, onCityChange, onDistrictChange, onComplexChange, onRequestLocation, onBack }: LocationEditorProps) {
  return (
    <div className="screen form-screen location-screen">
      <DogmeetHeader onBack={onBack} />
      <h1>Мой район</h1>
      <p className="lead">Компания начинается<br />рядом с домом.</p>
      <div className="location-preview"><MapPin aria-hidden="true" /><strong>{location.complex || "Ваш жилой комплекс"}</strong><span>{location.city || "Выберите город"} · {location.district || "Район"}</span></div>
      {saving && <DogmeetState state="loading" title="Сохраняем…" />}
      <form onSubmit={onSubmit} hidden={saving} noValidate>
        <SelectField label="Город" id="location-city" value={location.city} options={cityOptions} loaded={locationsLoaded} touched={Boolean(touchedFields["location-city"])} onTouch={() => onTouch("location-city")} onChange={onCityChange} />
        <SelectField label="Район" id="location-district" value={location.district} options={districtOptions} loaded={locationsLoaded} touched={Boolean(touchedFields["location-district"])} onTouch={() => onTouch("location-district")} onChange={onDistrictChange} />
        <SelectField label="Жилой комплекс" id="location-complex" value={location.complex} options={complexOptions} loaded={locationsLoaded} touched={Boolean(touchedFields["location-complex"])} onTouch={() => onTouch("location-complex")} onChange={onComplexChange} />
        {(locationsError || submitError) && <p className="field-error" role="alert">{locationsError || submitError}</p>}
        {!locationsLoaded && <div className="resource-loading" role="status" aria-label="Загружаем локации"><span /><span /><span /></div>}
        <button className="button" type="submit" disabled={!valid || saving}>{saving ? "Сохраняем…" : hasLocation ? "Сохранить" : "Продолжить"}<ArrowRight aria-hidden="true" /></button>
        <button className="button secondary" type="button" onClick={onRequestLocation}>Предложить новую локацию</button>
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
  onBack?: () => void;
};

export function LocationRequestForm({ location, touchedFields, cityValid, districtValid, complexValid, valid, saving, error, onSubmit, onTouch, onChange, onBack }: LocationRequestFormProps) {
  const fields: Array<[keyof Location, string, boolean, string]> = [["city", "Город", cityValid, "request-city"], ["district", "Район", districtValid, "request-district"], ["complex", "Жилой комплекс", complexValid, "request-complex"]];
  return (
    <div className="screen form-screen location-request-screen">
      <DogmeetHeader onBack={onBack} />
      <h1>Новая локация</h1>
      <p>Расскажите, где хотите гулять. Администратор рассмотрит заявку и добавит новую локацию.</p>
      {saving && <DogmeetState state="loading" title="Сохраняем…" />}
      <form onSubmit={onSubmit} hidden={saving} aria-busy={saving} noValidate>
        {fields.map(([field, label, isValid, touchKey]) => <label className="field" key={field}><span>{label}</span><input value={location[field]} required maxLength={field === "complex" ? 120 : 80} placeholder={field === "complex" ? "Например, Скандинавия" : field === "district" ? "Например, Коммунарка" : "Например, Москва"} aria-invalid={Boolean(touchedFields[touchKey] && !isValid)} onBlur={() => onTouch(touchKey)} onChange={(event) => onChange(field, event.target.value)} />{touchedFields[touchKey] && !isValid && <small className="field-error">Заполните это поле</small>}</label>)}
        <div className="note"><Clock3 aria-hidden="true" />Пока заявка на рассмотрении, можно выбрать соседний район.</div>
        {error && <p className="field-error" role="alert">{error}</p>}
        <button className="button" type="submit" disabled={!valid || saving}>{saving ? "Отправляем…" : "Отправить заявку"}<ArrowRight aria-hidden="true" /></button>
      </form>
    </div>
  );
}
