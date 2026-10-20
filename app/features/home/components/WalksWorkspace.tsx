"use client";
import { telegramStatusText, type TelegramSettings } from "../../telegram/useTelegramSettings";

import { Bell, Check, ChevronRight, Clock3, ExternalLink, MapPin, MessageCircle, SlidersHorizontal, Sun, Sunrise, Sunset } from "lucide-react";
import Image from "next/image";
import { ShareMenuRow } from "../../../components/ui/ShareMenuRow";
import { PawIcon } from "../../../components/ui/PawIcon";
import { MyPlacesMenuRow } from "../../../components/ui/MyPlacesMenuRow";
import { DogmeetState } from "../../../components/ui/DogmeetState";
import { type FormEvent, type PointerEvent, type RefObject, useMemo, useState } from "react";
import type { ApiWalk, Period, Walk } from "../../../../lib/walks";
import { DogmeetDialog, DogmeetHeader, requestDialogClose } from "../../../components/ui/DogmeetFrame";
import type { Location, Pet, SharedPlace } from "../model";
import type { DockSection } from "../use-home-navigation";
import type { WalkFormState } from "../use-walk-form";
import { WalkAnnouncementForm } from "./WalkAnnouncementForm";
import { WalkActionsDialog } from "./WalkActionsDialog";
import { isWalkEditExpired } from "../../../../server/domain/walk";
import { useWalkEditClock } from "../use-walk-edit-clock";
import { AnnouncementPreview } from "../../announcements/Announcements";

const periods: Period[] = ["Все", "Утро", "День", "Вечер"];

function releaseMenuCard(event: PointerEvent<HTMLDivElement>) {
  event.currentTarget.querySelector("[data-pressed]")?.removeAttribute("data-pressed");
}

type Props = {
  unreadCount: number;
  telegramSettings: TelegramSettings | null;
  onNotificationsSettings: () => void;
  announcementPreviewEnabled?: boolean;
  dockSection: DockSection;
  location: Location;
  period: Period;
  visibleWalks: Walk[];
  savedWalks: Walk[];
  walksLoaded: boolean;
  walksError: string;
  onRetryWalks: () => void;
  ownedWalksById: Map<string, ApiWalk>;
  openWalkActionsId: string | null;
  onPeriodChange: (period: Period) => void;
  onToggleWalkActions: (id: string) => void;
  onCloseWalkActions: () => void;
  onEditWalk: (walk: ApiWalk) => void;
  onDeleteWalk: (walk: ApiWalk) => void;
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
  onOpenMyPlaces: () => void;
  onShareSite: () => void;
  onOpenProfile: () => void;
  onBack: () => void;
  detailOpen: boolean;
  contactOpen: boolean;
  onOpenDetail: () => void;
  onOpenContact: () => void;
  onOpenDialogs: () => void;
  onOpenDistrictPets: () => void;
  onWrite: (walkId: string) => void;
  selectedWalk: Walk | null;
  onSelectWalk: (walk: Walk) => void;
};

export function WalksWorkspace({ unreadCount, telegramSettings, onNotificationsSettings, dockSection, location, period, visibleWalks, savedWalks, walksLoaded, walksError, onRetryWalks, ownedWalksById, onPeriodChange, onEditWalk, onDeleteWalk, guidedWalkFlow, savedPets, sharedPlaces, onAddPet, placesLoaded, walkForm, walkSaving, editingWalk, onWalkSubmit, onStartWalk, placesError, onRetryPlaces, profileHeadingRef, onOpenLocationEditor, onOpenMyPlaces, onShareSite, onOpenProfile, onBack, detailOpen, contactOpen, onOpenDetail, onOpenContact, onOpenDialogs, onOpenDistrictPets, onWrite, selectedWalk, onSelectWalk }: Props) {
  const now = useWalkEditClock(visibleWalks.map((walk) => ({ walkDate: walk.walkDate, walkTime: walk.time })));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [tempPeriod, setTempPeriod] = useState(period);
  const [contactCopied, setContactCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [actionsWalk, setActionsWalk] = useState<Walk | null>(null);
  const active = dockSection === "profile" ? "profile" : dockSection === "walk" ? "walk" : "nearby";
  const notificationsStatus = telegramStatusText[telegramSettings?.status ?? "unknown"];
  const today = useMemo(() => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", weekday: "long" }).formatToParts(new Date()), []);
  const day = today.find((part) => part.type === "day")?.value ?? "";
  const month = today.find((part) => part.type === "month")?.value ?? "";
  const weekday = today.find((part) => part.type === "weekday")?.value ?? "";
  const hasTodayWalks = savedWalks.length > 0;
  const showWalkControls = !walksLoaded || Boolean(walksError) || hasTodayWalks;

  if (contactOpen) return <div className="screen contact-screen"><DogmeetHeader onBack={onBack} /><h1>Связь с разработчиком</h1>{contactCopied ? <DogmeetState state="success" title="Контакт скопирован" message="Ссылка на Telegram разработчика готова к вставке." onAction={onBack} /> : <><h2>Есть идея<br />или вопрос?</h2><p>Разработчик Dogmeet — в Telegram. Напишите, что можно сделать удобнее.</p><div className="receipt"><strong>@kuznetsoviv</strong><span>t.me/kuznetsoviv</span></div><button className="button" type="button" onClick={async () => { try { await navigator.clipboard.writeText("https://t.me/kuznetsoviv"); setContactCopied(true); } catch { setCopyError("Не удалось скопировать. Выделите контакт и скопируйте вручную."); } }}>Скопировать контакт</button>{copyError && <p className="field-error" role="alert">{copyError}</p>}</>}</div>;

  if (active === "walk") {
    return (
      <div className="screen form-screen announce-screen">
        <DogmeetHeader onBack={onBack} />
        <WalkAnnouncementForm onOpenMyPlaces={onOpenMyPlaces} guidedWalkFlow={guidedWalkFlow} savedPets={savedPets} sharedPlaces={sharedPlaces} locationName={location.complex} onAddPet={onAddPet} placesLoaded={placesLoaded} placesError={placesError} onRetryPlaces={onRetryPlaces} walkForm={walkForm} walkSaving={walkSaving} editing={editingWalk} onSubmit={onWalkSubmit} />
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
          <button className="button light" type="button" onClick={onOpenLocationEditor}>Изменить локацию</button>
        </div>
        <div className="profile-menu"
          onPointerDown={(event) => {
            if (!event.isPrimary || event.button !== 0) return;
            const card = (event.target as Element).closest("button.menu-row");
            if (card?.parentElement === event.currentTarget) card.setAttribute("data-pressed", "");
          }}
          onPointerUp={releaseMenuCard}
          onPointerCancel={releaseMenuCard}
          onPointerOut={(event) => {
            const card = (event.target as Element).closest(".menu-row");
            if (!(event.relatedTarget instanceof Node) || !card?.contains(event.relatedTarget)) releaseMenuCard(event);
          }}
        >
          <button className="menu-row" type="button" onClick={onOpenDialogs}><MessageCircle aria-hidden="true" /><span><strong>Диалоги</strong><small>Сообщите своим друзьям что-то важное</small></span>{unreadCount > 0 && <span className="unread-dot" role="img" aria-label="Есть непрочитанные сообщения" />}<ChevronRight aria-hidden="true" /></button>
          <ShareMenuRow kind="site" onClick={onShareSite} />
          <AnnouncementPreview />
          <MyPlacesMenuRow onClick={onOpenMyPlaces} />
          <button className="menu-row" type="button" aria-label="Питомцы твоего района" onClick={onOpenDistrictPets}><PawIcon aria-hidden="true" /><span><strong>Питомцы твоего района</strong><small>Знакомьтесь с соседями</small></span><ChevronRight aria-hidden="true" /></button>
          <button className="menu-row" type="button" onClick={onNotificationsSettings}><Bell aria-hidden="true" /><span><strong>Уведомления</strong><small>Новые сообщения в Telegram</small></span><small className={telegramSettings?.status === "active" ? "telegram-enabled" : telegramSettings?.status === "inactive" ? "telegram-disabled" : ""}>{notificationsStatus}</small></button>
          <button className="menu-row" type="button" onClick={onOpenContact}><ExternalLink aria-hidden="true" /><span><strong>Связь с разработчиком</strong><small>Telegram · @kuznetsoviv</small></span><ChevronRight aria-hidden="true" /></button>
        </div>
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
        {selectedWalk.description?.trim() && <section className="pet-about"><h3>О нас</h3><p>{selectedWalk.description}</p></section>}
        <div className="big-time"><Clock3 /><strong>{selectedWalk.time}</strong><span>{selectedWalk.scheduleType === "always" ? "Ежедневно" : selectedWalk.scheduleType === "tomorrow" ? "Завтра" : "Сегодня"}</span></div>
        <div className="place-detail"><MapPin /><div><h3>{selectedWalk.point}</h3><p>{location.complex}<br />{location.city}, {location.district}</p></div></div>
        {selectedWalk.comment && <blockquote>«{selectedWalk.comment}»</blockquote>}
        <div className="note">Узнаете друг друга по питомцу.<br />Встречайтесь в указанном месте.</div>
        {!ownedWalksById.has(selectedWalk.id) && !savedPets.some(pet => pet.id === selectedWalk.petId && pet.isOwner) && <button className="button secondary" type="button" onClick={() => onWrite(selectedWalk.id)}>Написать</button>}
        <button className="button" type="button" onClick={() => { const owned = ownedWalksById.get(selectedWalk.id); if (owned) onEditWalk(owned); else onStartWalk(); }}>{ownedWalksById.has(selectedWalk.id) ? "Изменить мою прогулку" : "Сообщить о своей прогулке"}</button>
      </div>
    );
  }

  if (!walksLoaded) return <DogmeetState state="loading" />;
  if (walksError) return <DogmeetState state="error" message={walksError} onAction={onRetryWalks} />;

  return (
    <div className="screen walks-screen">
      <DogmeetHeader location={location.complex} onLocation={onOpenLocationEditor} onProfile={onOpenProfile} unreadCount={unreadCount} />
      <div className="day-heading"><h1>Кто сегодня<br /><em>на прогулку?</em></h1><span className="date-stamp"><strong>{day}</strong>{month}<br />{weekday}</span></div>
      <div data-dock-panel>
      {!hasTodayWalks && <div className="day-divider" aria-hidden="true" />}
      {showWalkControls && <>
        {visibleWalks.length > 0 && <div className="daily-summary">
          <span className="stacked-faces">{visibleWalks.slice(0, 3).map((walk) => <Image key={walk.id} src={walk.image} alt="" width={32} height={32} unoptimized={walk.image.startsWith("/api/")} />)}</span>
          <p>Знакомьтесь во дворе.<br /><strong>У каждого есть время для прогулки.</strong></p>
        </div>}
        <div className={`section-line${visibleWalks.length === 0 ? " section-line--empty" : ""}`}><h2>Сегодня рядом</h2><button className="filter-trigger" type="button" onClick={() => { setTempPeriod(period); setFiltersOpen(true); }}><SlidersHorizontal aria-hidden="true" />{period === "Все" ? "Весь день" : period}</button></div>
      </>}
      {!walksLoaded ? <DogmeetState state="loading" /> : walksError ? <DogmeetState state="error" message={walksError} onAction={onRetryWalks} /> : visibleWalks.length === 0 ? <DogmeetState state="empty" action="Сообщить о прогулке" onAction={onStartWalk} /> : (
        <div className="timeline">{visibleWalks.map((walk) => {
          const owned = ownedWalksById.get(walk.id);
          return <div className="walk-row" key={walk.id}><div className="time-column"><strong>{walk.time}</strong><span>{walk.scheduleType === "always" ? "Каждый день" : walk.scheduleType === "tomorrow" ? "Завтра" : "Сегодня"}</span><i aria-hidden="true" /></div><div className="walk-summary" role="button" tabIndex={0} onClick={() => { onSelectWalk(walk); onOpenDetail(); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectWalk(walk); onOpenDetail(); } }}><Image className="pet-face" src={walk.image} alt={`Собака ${walk.pet}`} width={48} height={48} unoptimized={walk.image.startsWith("/api/")} /><span className="walk-person"><span className="walk-name-row"><strong>{walk.pet}</strong>{isWalkEditExpired({ walkDate: walk.walkDate, walkTime: walk.time }, now) && <span className="walk-expired-label">Устарело</span>}</span><small>{walk.owner} · {walk.breed}</small></span><span className="walk-place"><MapPin aria-hidden="true" />{walk.point}</span>{walk.comment && <span className="walk-comment"><MessageCircle aria-hidden="true" />{walk.comment}</span>}{owned && <button className="text-link" type="button" onClick={(event) => { event.stopPropagation(); setActionsWalk(walk); }}>Управлять<ChevronRight aria-hidden="true" /></button>}</div></div>;
        })}</div>
      )}
      </div>
      <DogmeetDialog open={filtersOpen} title="Время прогулки" onDismiss={() => setFiltersOpen(false)} onDismissStart={() => setFiltersOpen(false)} footer={<button className="button" type="button" onClick={(event) => requestDialogClose(event.currentTarget, () => onPeriodChange(tempPeriod))}>Показать прогулки</button>}><p>В какое время вам удобнее встретиться?</p><div className="option-list">{periods.map((item, index) => { const Icon = [Clock3, Sunrise, Sun, Sunset][index]!; return <button key={item} type="button" aria-pressed={tempPeriod === item} onClick={() => setTempPeriod(item)}><Icon aria-hidden="true" /><span><strong>{item === "Все" ? "Весь день" : item}</strong><small>{["Все прогулки сегодня", "До 12:00", "12:00–17:59", "После 18:00"][index]}</small></span>{tempPeriod === item && <Check aria-hidden="true" />}</button>; })}</div></DogmeetDialog>
      {actionsWalk && (() => {
        const owned = ownedWalksById.get(actionsWalk.id);
        return owned && <WalkActionsDialog walk={actionsWalk} owned={owned} onClose={() => setActionsWalk(null)} onEdit={onEditWalk} onDelete={onDeleteWalk} />;
      })()}
    </div>
  );
}
