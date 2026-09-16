"use client";

import { ArrowRight, CalendarDays, Check, ChevronRight, Clock3, Copy, ExternalLink, MapPin, MessageCircle, Moon, PawPrint, SlidersHorizontal, Sun } from "lucide-react";
import Image from "next/image";
import { DogmeetState } from "../../../components/ui/DogmeetState";
import { type FormEvent, type RefObject, useMemo, useState } from "react";
import type { ApiWalk, Period, Walk } from "../../../../lib/walks";
import { DogmeetDialog, DogmeetHeader } from "../../../components/ui/DogmeetFrame";
import type { Location, Pet, SharedPlace } from "../model";
import type { DockSection } from "../use-home-navigation";
import type { WalkFormState } from "../use-walk-form";
import { WalkAnnouncementForm } from "./WalkAnnouncementForm";
import { WalkActionsDialog } from "./WalkActionsDialog";

const periods: Period[] = ["Все", "Утро", "День", "Вечер"];

type Props = {
  dockSection: DockSection;
  location: Location;
  period: Period;
  visibleWalks: Walk[];
  savedWalks: Walk[];
  walksLoaded: boolean;
  walksError: string;
  onRetryWalks: () => void;
  ownedWalksById: Map<string, ApiWalk>;
  petsById: Map<string, Pet>;
  openWalkActionsId: string | null;
  onPeriodChange: (period: Period) => void;
  onToggleWalkActions: (id: string) => void;
  onCloseWalkActions: () => void;
  onEditWalk: (walk: ApiWalk) => void;
  onDeleteWalk: (walk: ApiWalk) => void;
  onSharePet: (pet: Pet) => void;
  guidedWalkFlow: boolean;
  savedPets: Pet[];
  sharedPlaces: SharedPlace[];
  onAddPet: () => void;
  placesLoaded: boolean;
  walkForm: WalkFormState;
  walkSaving: boolean;
  editingWalk: boolean;
  onWalkSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onStartWalk: () => void;
  placesError: string;
  onRetryPlaces: () => void;
  profileHeadingRef: RefObject<HTMLHeadingElement | null>;
  onOpenLocationEditor: () => void;
  onOpenMyWalks: () => void;
  onOpenMyPets: () => void;
  onOpenProfile: () => void;
  onBack: () => void;
  detailOpen: boolean;
  contactOpen: boolean;
  onOpenDetail: () => void;
  onOpenContact: () => void;
  selectedWalk: Walk | null;
  onSelectWalk: (walk: Walk) => void;
};

export function WalksWorkspace({ dockSection, location, period, visibleWalks, savedWalks, walksLoaded, walksError, onRetryWalks, ownedWalksById, petsById, onPeriodChange, onEditWalk, onDeleteWalk, onSharePet, guidedWalkFlow, savedPets, sharedPlaces, onAddPet, placesLoaded, walkForm, walkSaving, editingWalk, onWalkSubmit, onStartWalk, placesError, onRetryPlaces, profileHeadingRef, onOpenLocationEditor, onOpenMyWalks, onOpenMyPets, onOpenProfile, onBack, detailOpen, contactOpen, onOpenDetail, onOpenContact, selectedWalk, onSelectWalk }: Props) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tempPeriod, setTempPeriod] = useState(period);
  const [contactCopied, setContactCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [actionsWalk, setActionsWalk] = useState<Walk | null>(null);
  const active = dockSection === "profile" ? "profile" : dockSection === "walk" ? "walk" : "nearby";
  const today = useMemo(() => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", weekday: "long" }).formatToParts(new Date()), []);
  const day = today.find((part) => part.type === "day")?.value ?? "";
  const month = today.find((part) => part.type === "month")?.value ?? "";
  const weekday = today.find((part) => part.type === "weekday")?.value ?? "";

  if (contactOpen) return <div className="screen contact-screen"><DogmeetHeader onBack={onBack} /><h1>Связь с разработчиком</h1>{contactCopied ? <DogmeetState state="success" title="Контакт скопирован" message="Ссылка на Telegram разработчика готова к вставке." onAction={onBack} /> : <><h2>Есть идея<br />или вопрос?</h2><p>Разработчик Dogmeet — в Telegram. Напишите, что можно сделать удобнее.</p><div className="receipt"><strong>@kuznetsoviv</strong><span>t.me/kuznetsoviv</span></div><button className="button" type="button" onClick={async () => { try { await navigator.clipboard.writeText("https://t.me/kuznetsoviv"); setContactCopied(true); } catch { setCopyError("Не удалось скопировать. Выделите контакт и скопируйте вручную."); } }}><Copy />Скопировать контакт</button>{copyError && <p className="field-error" role="alert">{copyError}</p>}</>}</div>;

  if (active === "walk") {
    return (
      <div className="screen form-screen announce-screen">
        <DogmeetHeader onBack={onBack} />
        <WalkAnnouncementForm guidedWalkFlow={guidedWalkFlow} savedPets={savedPets} sharedPlaces={sharedPlaces} locationName={location.complex} onAddPet={onAddPet} placesLoaded={placesLoaded} placesError={placesError} onRetryPlaces={onRetryPlaces} walkForm={walkForm} walkSaving={walkSaving} editing={editingWalk} onSubmit={onWalkSubmit} />
      </div>
    );
  }

  if (active === "profile") {
    return (
      <div className="screen profile-screen">
        <DogmeetHeader onBack={onBack} />
        <h1 id="menu-title" ref={profileHeadingRef} tabIndex={-1}>Мой район<br />и настройки</h1>
        <div className="profile-banner">
          <MapPin aria-hidden="true" />
          <h2>{location.complex}</h2>
          <p>{location.city} · {location.district}</p>
          <button className="button light" type="button" onClick={onOpenLocationEditor}>Изменить локацию<ChevronRight aria-hidden="true" /></button>
        </div>
        <button className="menu-row" type="button" onClick={onOpenMyWalks}><CalendarDays aria-hidden="true" /><span><strong>Мои планы</strong><small>Разовые и ежедневные прогулки</small></span><ChevronRight aria-hidden="true" /></button>
        <button className="menu-row" type="button" onClick={onOpenMyPets}><PawPrint aria-hidden="true" /><span><strong>Мои питомцы</strong><small>Свои и общие</small></span><ChevronRight aria-hidden="true" /></button>
        <button className="menu-row" type="button" onClick={onOpenContact}><ExternalLink aria-hidden="true" /><span><strong>Связь с разработчиком</strong><small>Telegram · @kuznetsoviv</small></span><ChevronRight aria-hidden="true" /></button>
        <p className="small-note">Данные привязаны к этому браузеру. Сохраните ссылку на питомца, чтобы поделиться доступом.</p>
      </div>
    );
  }

  if (selectedWalk && detailOpen) {
    return (
      <div className="screen walk-detail-screen">
        <DogmeetHeader onBack={onBack} />
        <h1>Встреча на прогулке</h1>
        <Image className="portrait" src={selectedWalk.image} alt={selectedWalk.pet} width={390} height={300} unoptimized={selectedWalk.image.startsWith("/api/")} />
        <div className="pet-title"><h2>{selectedWalk.pet}</h2><span>{selectedWalk.breed}</span></div>
        <p>Хозяин: {selectedWalk.owner}</p>
        <div className="big-time"><Clock3 /><strong>{selectedWalk.time}</strong><span>{selectedWalk.scheduleType === "always" ? "Ежедневно" : selectedWalk.scheduleType === "tomorrow" ? "Завтра" : "Сегодня"}</span></div>
        <div className="place-detail"><MapPin /><div><h3>{selectedWalk.point}</h3><p>{location.complex}<br />{location.city}, {location.district}</p></div></div>
        <blockquote>«{selectedWalk.comment || "Приходите гулять вместе"}»</blockquote>
        <div className="note">Узнаете друг друга по питомцу. Встречайтесь в указанном месте.</div>
        <button className="button" type="button" onClick={() => { const owned = ownedWalksById.get(selectedWalk.id); if (owned) onEditWalk(owned); else onStartWalk(); }}>{ownedWalksById.has(selectedWalk.id) ? "Изменить мою прогулку" : "Сообщить о своей прогулке"}<ArrowRight /></button>
      </div>
    );
  }

  if (!walksLoaded) return <DogmeetState state="loading" />;
  if (walksError) return <DogmeetState state="error" message={walksError} onAction={onRetryWalks} />;
  if (!visibleWalks.length) return <DogmeetState state="empty" action="Сообщить о прогулке" onAction={onStartWalk}><button className="button quiet" type="button" onClick={() => onPeriodChange("Все")}>Показать весь день</button></DogmeetState>;

  return (
    <div className="screen walks-screen">
      <DogmeetHeader location={location.complex} onLocation={onOpenLocationEditor} onProfile={onOpenProfile} />
      <div className="day-heading"><h1>Кто сегодня<br /><em>на прогулку?</em></h1><span className="date-stamp"><strong>{day}</strong>{month}<br />{weekday}</span></div>
      <div className="daily-summary">
        <span className="stacked-faces">{savedWalks.slice(0, 3).map((walk) => <Image key={walk.id} src={walk.image} alt="" width={32} height={32} unoptimized={walk.image.startsWith("/api/")} />)}</span>
        <p>Знакомьтесь во дворе.<br /><strong>{savedWalks.length ? `У каждого есть время для прогулки.` : "Начните расписание двора."}</strong></p>
      </div>
      <div className="section-line"><h2>Сегодня рядом</h2><button className="filter-trigger" type="button" onClick={() => { setTempPeriod(period); setFiltersOpen(true); }}><SlidersHorizontal aria-hidden="true" />{period === "Все" ? "Весь день" : period}</button></div>
      {!walksLoaded ? <DogmeetState state="loading" /> : walksError ? <DogmeetState state="error" message={walksError} onAction={onRetryWalks} /> : visibleWalks.length === 0 ? <DogmeetState state="empty" action="Сообщить о прогулке" onAction={onStartWalk}><button className="button quiet" type="button" onClick={() => onPeriodChange("Все")}>Показать весь день</button></DogmeetState> : (
        <div className="timeline">{visibleWalks.map((walk) => {
          const owned = ownedWalksById.get(walk.id);
          return <div className="walk-row" key={walk.id}><div className="time-column"><strong>{walk.time}</strong><span>{walk.scheduleType === "always" ? "Каждый день" : walk.scheduleType === "tomorrow" ? "Завтра" : "Сегодня"}</span><i aria-hidden="true" /></div><div className="walk-summary" role="button" tabIndex={0} onClick={() => { onSelectWalk(walk); onOpenDetail(); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectWalk(walk); onOpenDetail(); } }}><Image className="pet-face" src={walk.image} alt={`Собака ${walk.pet}`} width={48} height={48} unoptimized={walk.image.startsWith("/api/")} /><span className="walk-person"><strong>{walk.pet}</strong><small>{walk.owner} · {walk.breed}</small></span><span className="walk-place"><MapPin aria-hidden="true" />{walk.point}</span>{walk.comment && <span className="walk-comment"><MessageCircle aria-hidden="true" />{walk.comment}</span>}{owned && <button className="text-link" type="button" onClick={(event) => { event.stopPropagation(); setActionsWalk(walk); }}>Управлять<ChevronRight aria-hidden="true" /></button>}</div></div>;
        })}</div>
      )}
      {filtersOpen && <DogmeetDialog title="Время прогулки" onDismiss={() => setFiltersOpen(false)}><p>В какое время вам удобнее встретиться?</p><div className="option-list">{periods.map((item, index) => <button key={item} type="button" aria-pressed={tempPeriod === item} onClick={() => setTempPeriod(item)}><span><strong>{item === "Все" ? "Весь день" : item}</strong><small>{["Все прогулки сегодня", "До 12:00", "12:00–17:59", "После 18:00"][index]}</small></span>{tempPeriod === item ? <Check /> : item === "Вечер" ? <Moon /> : <Sun />}</button>)}</div><button className="button" type="button" onClick={() => { onPeriodChange(tempPeriod); setFiltersOpen(false); }}>Показать прогулки<ArrowRight /></button></DogmeetDialog>}
      {actionsWalk && (() => {
        const owned = ownedWalksById.get(actionsWalk.id);
        const pet = petsById.get(actionsWalk.petId);
        return owned && <WalkActionsDialog walk={actionsWalk} owned={owned} pet={pet} onClose={() => setActionsWalk(null)} onEdit={onEditWalk} onDelete={onDeleteWalk} onShare={onSharePet} />;
      })()}
    </div>
  );
}
