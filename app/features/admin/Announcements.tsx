"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { AdminAnnouncement, AdminAnnouncementsResponse, AnnouncementExclusions, AnnouncementLocation, AnnouncementSchedule } from "../../../lib/announcement-types";
import { announcementDateInput, announcementDateValue, maxExtensionDays, validExtensionDays } from "../../../lib/announcement-settings";
import { DogmeetState } from "../../components/ui/DogmeetState";
import { SingleLineInput } from "../../components/ui/SingleLineInput";
import { ApiRequestError } from "../api/client";
import { createAdminAnnouncement, deleteAdminAnnouncement, loadAdminAnnouncements, updateAdminAnnouncement } from "./api";

const date = (value: string | null) => value ? new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow", dateStyle: "short", timeStyle: "short"
}).format(new Date(value)) : "Не задано";

function duration(milliseconds: number) {
  if (milliseconds <= 0) return "Завершён";
  if (milliseconds < 60_000) return "Менее минуты";
  const minutes = Math.ceil(milliseconds / 60_000);
  return `${Math.floor(minutes / 1440)} дн. ${Math.floor(minutes % 1440 / 60)} ч. ${minutes % 60} мин.`;
}

function bannerStatus(banner: AdminAnnouncement, now: number) {
  if (banner.status !== "active") return { paused: "Пауза", disabled: "Отключён", information: "Информация" }[banner.status];
  if (banner.endsAt && Date.parse(banner.endsAt) <= now) return "Завершён";
  if (banner.startsAt && Date.parse(banner.startsAt) > now) return "Запланирован";
  return "Показывается";
}

export function AdminAnnouncements({ onUnauthorized }: { onUnauthorized: () => void }) {
  const [data, setData] = useState<AdminAnnouncementsResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const previousId = useRef<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState({ time: 0, started: 0 });
  const [tick, setTick] = useState(0);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const started = performance.now();
    try {
      const result = await loadAdminAnnouncements();
      setData(result);
      setClock({ time: Date.parse(result.serverTime), started });
      setTick(performance.now());
    } catch (failure) {
      if (failure instanceof ApiRequestError && failure.status === 401) onUnauthorized();
      else setError(failure instanceof Error ? failure.message : "Не удалось загрузить баннеры.");
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => setTick(performance.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const now = clock.time + Math.max(0, tick - clock.started);
  const banners = data?.banners ?? [];
  const selected = banners.find((banner) => banner.id === selectedId);
  useEffect(() => {
    if (selectedId) backRef.current?.focus();
    else if (previousId.current) (document.getElementById(`admin-banner-${previousId.current}`) ?? tableRef.current)?.focus();
    previousId.current = selectedId;
  }, [selectedId]);
  return <>
    {loading ? <DogmeetState state="loading" /> : error ? <DogmeetState state="error" message={error} onAction={load} /> : <>
      {selected ? <>
        <button ref={backRef} className="button secondary" type="button" onClick={() => setSelectedId(null)}>Назад к списку баннеров</button>
        <BannerSettings key={selected.id} banner={selected} locations={data!.locations} now={now}
        onUnauthorized={onUnauthorized} onSaved={(updated) => setData((current) => current && ({ ...current, banners: current.banners.map((item) => item.id === updated.id ? updated : item) }))}
        onDeleted={() => {
          setData((current) => current && ({ ...current, banners: current.banners.filter((item) => item.id !== selected.id) }));
          setSelectedId((current) => current === selected.id ? null : current);
        }} />
      </> : <>
        <p>Все баннеры. Нажмите на строку, чтобы открыть настройки. Время — Москва (UTC+3).</p>
        <CreateBanner onUnauthorized={onUnauthorized} onCreated={() => { void load(); }} />
        {banners.length ? <table ref={tableRef} className="admin-banner-table" aria-label="Все баннеры" tabIndex={-1}>
          <thead><tr><th scope="col">Баннер</th><th scope="col">Статус</th><th scope="col">Окончание</th></tr></thead>
          <tbody>{banners.map((banner) => <tr key={banner.id}>
            <td><button id={`admin-banner-${banner.id}`} className="admin-banner-link" type="button" onClick={() => setSelectedId(banner.id)}>{banner.pages[0]?.title || banner.id}</button></td>
            <td>{bannerStatus(banner, now)}</td><td>{banner.endsAt ? date(banner.endsAt) : "Без срока"}</td>
          </tr>)}</tbody>
        </table> : <DogmeetState state="empty" title="Действующих баннеров нет" message="Создайте баннер, чтобы сообщить о нововведениях." />}
      </>}
      <button className="button secondary" type="button" onClick={load}>Обновить</button>
    </>}
  </>;
}

function BannerSettings({ banner, locations, now, onSaved, onDeleted, onUnauthorized }: {
  banner: AdminAnnouncement; locations: AnnouncementLocation[]; now: number;
  onSaved: (banner: AdminAnnouncement) => void; onDeleted: () => void; onUnauthorized: () => void;
}) {
  const [exclusions, setExclusions] = useState(banner.exclusions);
  const [schedule, setSchedule] = useState<AnnouncementSchedule>({ permanent: banner.permanent, startsAt: banner.startsAt, endsAt: banner.endsAt });
  const [days, setDays] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const cities = [...new Set(locations.map((item) => item.city))];
  const districts = [...new Map(locations.map(({ city, district }) => [JSON.stringify([city, district]), { city, district }])).values()];
  async function save(change: Parameters<typeof updateAdminAnnouncement>[1] | { action: "delete" }) {
    if (pending.current) return;
    if (change.action === "delete" && !window.confirm(`Удалить баннер «${banner.pages[0]?.title || banner.id}» навсегда? Он исчезнет и из раздела «Информация». Восстановить его будет нельзя.`)) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (change.action === "delete") {
        await deleteAdminAnnouncement(banner.id);
        onDeleted();
        return;
      }
      const updated = await updateAdminAnnouncement(banner.id, change);
      onSaved(updated);
      setSchedule({ permanent: updated.permanent, startsAt: updated.startsAt, endsAt: updated.endsAt });
      const messages = { extend: "Срок продлён.", exclusions: "Исключения сохранены.", "start-now": "Показ начат.", schedule: "Настройки показа сохранены.", pause: "Показ приостановлен до ручного включения.", resume: "Показ возобновлён.", disable: "Баннер полностью отключён.", information: "Баннер убран из показа и сохранён в разделе «Информация»." };
      setMessage(messages[change.action]);
      if (change.action === "extend") setDays("");
    } catch (failure) {
      if (failure instanceof ApiRequestError && failure.status === 401) onUnauthorized();
      else setError(failure instanceof Error ? failure.message : "Не удалось сохранить баннер.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function extend(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    if (!banner.endsAt) return;
    if (!/^\d+$/.test(days) || !validExtensionDays(Number(days), banner.endsAt)) {
      setMessage("");
      setError(`Укажите положительное целое число дней, не больше ${maxExtensionDays(banner.endsAt)}.`);
      return;
    }
    void save({ action: "extend", days: Number(days) });
  }
  function toggle<T extends string | object>(key: keyof AnnouncementExclusions, item: T, checked: boolean) {
    setExclusions((current) => ({ ...current, [key]: checked ? [...current[key], item] : current[key].filter((value) => JSON.stringify(value) !== JSON.stringify(item)) }));
    setMessage("");
  }
  const summary = banner.exclusions;
  return <article className="request-row admin-banner" aria-label={banner.pages[0]?.title || banner.id}>
    <h2>{banner.pages[0]?.title || banner.id}</h2>
    <p className="admin-banner-id">{banner.id}</p>
    <p><strong>Статус: </strong>{{ active: "По расписанию", paused: "Приостановлен", disabled: "Полностью отключён", information: "Только в «Информации»" }[banner.status]}</p>
    <fieldset disabled={busy} className="admin-banner-schedule">
      <legend>Действия с баннером</legend>
      {banner.status === "active" && <button className="button secondary" type="button" onClick={() => { void save({ action: "pause" }); }}>Отключить временно</button>}
      {banner.status === "paused" && <>
        <p>Пауза до ручного включения. Дата окончания не сдвигается; просмотры сохраняются.</p>
        <button className="button secondary" type="button" onClick={() => { void save({ action: "resume" }); }}>Возобновить показ</button>
      </>}
      {banner.status !== "disabled" && <button className="button secondary" type="button" onClick={() => { void save({ action: "disable" }); }}>Отключить полностью</button>}
      {banner.status === "disabled" && <p>Баннер скрыт из показа и «Информации». Для повторного показа нажмите «Запустить сейчас».</p>}
      {banner.status !== "information" && <button className="button secondary" type="button" onClick={() => { void save({ action: "information" }); }}>Убрать из показа, сохранить в «Информации»</button>}
      <button className="button secondary" type="button" onClick={() => { void save({ action: "delete" }); }}>Удалить навсегда</button>
    </fieldset>
    <dl className="admin-banner-dates">
      <div><dt>Начало</dt><dd>{date(banner.startsAt)}</dd></div>
      <div><dt>Окончание</dt><dd>{date(banner.endsAt)}</dd></div>
      <div><dt>Общая длительность</dt><dd>{banner.endsAt ? banner.startsAt ? duration(Date.parse(banner.endsAt) - Date.parse(banner.startsAt)) : "Начало не задано" : "Без ограничения"}</dd></div>
      <div><dt>Осталось</dt><dd>{banner.endsAt ? duration(Date.parse(banner.endsAt) - now) : "Без ограничения"}</dd></div>
    </dl>
    <form onSubmit={(event) => { event.preventDefault(); void save({ action: "schedule", ...schedule }); }}>
      <fieldset disabled={busy} className="admin-banner-schedule">
        <legend>Показ баннера</legend>
        <ScheduleFields value={schedule} onChange={setSchedule} />
        <button className="button secondary" type="submit">Сохранить настройки показа</button>
        <button className="button secondary" type="button" onClick={() => { void save({ action: "start-now" }); }}>Запустить сейчас</button>
        <p>Запуск использует сохранённое окончание и не сбрасывает подтверждения просмотра.</p>
      </fieldset>
    </form>
    <div className="admin-banner-audience">
      <h3>Аудитория</h3>
      <p>Города: Все; исключены: {summary.cities.join(", ") || "нет"}</p>
      <p>Районы: Все; исключены: {summary.districts.map((item) => `${item.city} / ${item.district}`).join(", ") || "нет"}</p>
      <p>ЖК: Все; исключены: {summary.complexes.map((item) => `${item.city} / ${item.district} / ${item.complex}`).join(", ") || "нет"}</p>
      {summary.cities.length > 0 && <p>Исключены все районы и ЖК городов: {summary.cities.join(", ")}.</p>}
      {summary.districts.length > 0 && <p>Исключены все ЖК районов: {summary.districts.map((item) => `${item.city} / ${item.district}`).join(", ")}.</p>}
    </div>
    <details>
      <summary>Настроить исключения</summary>
      <form onSubmit={(event) => { event.preventDefault(); void save({ action: "exclusions", exclusions }); }}>
        <fieldset disabled={busy} className="admin-banner-exclusions">
          <legend>Не показывать баннер в выбранных локациях</legend>
          <fieldset><legend>Города</legend>{cities.map((city) => <label key={city}><input type="checkbox" checked={exclusions.cities.includes(city)} onChange={(event) => toggle("cities", city, event.target.checked)} />{city}</label>)}</fieldset>
          <fieldset><legend>Районы</legend>{districts.map((item) => <label key={JSON.stringify(item)}><input type="checkbox" checked={exclusions.districts.some((value) => value.city === item.city && value.district === item.district)} onChange={(event) => toggle("districts", item, event.target.checked)} />{item.city} / {item.district}</label>)}</fieldset>
          <fieldset><legend>ЖК</legend>{locations.map((item) => <label key={JSON.stringify(item)}><input type="checkbox" checked={exclusions.complexes.some((value) => value.city === item.city && value.district === item.district && value.complex === item.complex)} onChange={(event) => toggle("complexes", item, event.target.checked)} />{item.city} / {item.district} / {item.complex}</label>)}</fieldset>
          <button className="button secondary" type="submit">{busy ? "Сохраняем…" : "Сохранить исключения"}</button>
        </fieldset>
      </form>
    </details>
    {banner.endsAt && <form onSubmit={extend} noValidate>
      <label className="field"><span>На сколько дней продлить</span><SingleLineInput inputMode="numeric" autoComplete="off" value={days} disabled={busy} maxLength={10} onChange={(event) => { setDays(event.target.value); setError(""); setMessage(""); }} /></label>
      <button className="button" type="submit" disabled={busy}>{busy ? "Сохраняем…" : "Продлить"}</button>
      <p>Дни прибавляются к текущей дате окончания.</p>
    </form>}
    {error && <p className="field-error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
  </article>;
}


function ScheduleFields({ value, onChange }: { value: AnnouncementSchedule; onChange: (value: AnnouncementSchedule) => void }) {
  return <>
    <label><input type="checkbox" checked={value.permanent} onChange={(event) => onChange({ ...value, permanent: event.target.checked })} />Постоянный — сохранять в «Информация»</label>
    <label className="field"><span>Начало показа — Москва (UTC+3)</span><SingleLineInput type="datetime-local" step="1" value={announcementDateInput(value.startsAt)} onChange={(event) => onChange({ ...value, startsAt: announcementDateValue(event.target.value) })} /></label>
    <label className="field"><span>Окончание автопоказа — Москва (UTC+3)</span><SingleLineInput type="datetime-local" step="1" value={announcementDateInput(value.endsAt)} onChange={(event) => onChange({ ...value, endsAt: announcementDateValue(event.target.value) })} /></label>
    <p>Пустое начало — сразу. Пустое окончание — без ограничения. Окончание не сдвигается при запуске.</p>
  </>;
}

function CreateBanner({ onCreated, onUnauthorized }: { onCreated: () => void; onUnauthorized: () => void }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [schedule, setSchedule] = useState<AnnouncementSchedule>({ permanent: false, startsAt: null, endsAt: null });
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  async function create(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await createAdminAnnouncement({ title, text, ...schedule });
      onCreated();
    } catch (failure) {
      if (failure instanceof ApiRequestError && failure.status === 401) onUnauthorized();
      else setError(failure instanceof Error ? failure.message : "Не удалось создать баннер.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return <details><summary>Создать баннер</summary><form onSubmit={create}>
    <fieldset disabled={busy} className="admin-banner-schedule">
      <legend>Новый баннер</legend>
      <label className="field"><span>Заголовок</span><SingleLineInput value={title} required maxLength={200} onChange={(event) => setTitle(event.target.value)} /></label>
      <label className="field"><span>Текст</span><textarea value={text} required maxLength={10000} onChange={(event) => setText(event.target.value)} /></label>
      <ScheduleFields value={schedule} onChange={setSchedule} />
      <button className="button" type="submit">Создать</button>
    </fieldset>
    {error && <p className="field-error" role="alert">{error}</p>}
  </form></details>;
}
