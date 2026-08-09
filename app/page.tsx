"use client";

import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  MapPin,
  Menu,
  PawPrint,
  X
} from "lucide-react";
import Image from "next/image";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Screen = "welcome" | "location" | "walks" | "pet";
type Period = "Все" | "Утро" | "День" | "Вечер";

type Location = {
  city: string;
  district: string;
  complex: string;
};

type Walk = {
  pet: string;
  owner: string;
  time: string;
  point: string;
  period: Exclude<Period, "Все">;
  image: string;
};

const STORAGE_KEY = "dogwalk.location.v1";
const defaultLocation: Location = {
  city: "Москва",
  district: "Хамовники",
  complex: "Садовые кварталы"
};

const walks: Walk[] = [
  {
    pet: "Боня",
    owner: "Анна",
    time: "08:30",
    point: "Сквер у фонтана",
    period: "Утро",
    image: "/dog-bonya.webp"
  },
  {
    pet: "Ричи",
    owner: "Михаил",
    time: "14:00",
    point: "Площадка у корпуса 3",
    period: "День",
    image: "/dog-richie.webp"
  },
  {
    pet: "Луна",
    owner: "Ольга",
    time: "19:30",
    point: "Центральный парк",
    period: "Вечер",
    image: "/dog-luna.webp"
  }
];

export default function Home() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [location, setLocation] = useState<Location>(defaultLocation);
  const [period, setPeriod] = useState<Period>("Все");
  const [menuOpen, setMenuOpen] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [petSaved, setPetSaved] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setLocation({ ...defaultLocation, ...JSON.parse(stored) });
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  const visibleWalks = useMemo(
    () => (period === "Все" ? walks : walks.filter((walk) => walk.period === period)),
    [period]
  );

  function saveLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
    setScreen("walks");
  }

  function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setPhotoError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError("Выберите изображение в формате JPEG, PNG или WebP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError("Фотография должна быть меньше 5 МБ.");
      return;
    }
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(URL.createObjectURL(file));
  }

  function savePet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!photoUrl || photoError) {
      setPhotoError("Добавьте фотографию питомца.");
      return;
    }
    setPetSaved(true);
    window.setTimeout(() => {
      setPetSaved(false);
      setScreen("walks");
    }, 900);
  }

  return (
    <main className="page-shell">
      <section className={`app-shell screen-${screen}`} aria-label="Сервис совместных прогулок">
        {screen === "welcome" && (
          <div className="screen welcome-screen">
            <div className="welcome-copy">
              <div className="paw-mark" aria-hidden="true"><PawPrint /></div>
              <h1>Гулять вместе веселее</h1>
              <p>Находите хозяев собак поблизости, договаривайтесь о прогулках и знакомьте питомцев.</p>
            </div>
            <div className="hero-wrap">
              <Image
                src="/walk-hero.webp"
                alt="Хозяйка гуляет с собакой в парке"
                fill
                priority
                sizes="(max-width: 520px) 100vw, 430px"
              />
            </div>
            <button className="primary-button" type="button" onClick={() => setScreen("location")}>
              Найти компанию
            </button>
          </div>
        )}

        {screen === "location" && (
          <div className="screen form-screen">
            <button className="icon-button back-button" type="button" aria-label="Назад" onClick={() => setScreen("welcome")}>
              <ArrowLeft />
            </button>
            <div className="screen-heading">
              <h1>Где будем гулять?</h1>
              <p>Выберите локацию, чтобы увидеть прогулки рядом</p>
            </div>
            <form className="location-form" onSubmit={saveLocation}>
              <label className="field">
                <span>Город</span>
                <span className="select-wrap">
                  <select value={location.city} onChange={(event) => setLocation({ ...location, city: event.target.value })}>
                    <option>Москва</option>
                    <option>Санкт-Петербург</option>
                    <option>Казань</option>
                  </select>
                  <ChevronDown aria-hidden="true" />
                </span>
              </label>
              <label className="field">
                <span>Район</span>
                <span className="select-wrap">
                  <select value={location.district} onChange={(event) => setLocation({ ...location, district: event.target.value })}>
                    <option>Хамовники</option>
                    <option>Арбат</option>
                    <option>Пресненский</option>
                  </select>
                  <ChevronDown aria-hidden="true" />
                </span>
              </label>
              <label className="field">
                <span>Жилой комплекс</span>
                <span className="select-wrap">
                  <select value={location.complex} onChange={(event) => setLocation({ ...location, complex: event.target.value })}>
                    <option>Садовые кварталы</option>
                    <option>Кленовые аллеи</option>
                    <option>Резиденция Монэ</option>
                  </select>
                  <ChevronDown aria-hidden="true" />
                </span>
              </label>
              <button className="primary-button form-submit" type="submit">Далее</button>
            </form>
          </div>
        )}

        {screen === "walks" && (
          <div className="screen walks-screen">
            <header className="walks-header">
              <div>
                <h1>Прогулки рядом</h1>
                <p>Сегодня · {location.complex}</p>
              </div>
              <button className="menu-button" type="button" aria-label="Открыть меню" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}>
                <Menu />
              </button>
            </header>

            <div className="filters" aria-label="Фильтр по времени">
              {(["Все", "Утро", "День", "Вечер"] as Period[]).map((item) => (
                <button key={item} type="button" className={period === item ? "active" : ""} aria-pressed={period === item} onClick={() => setPeriod(item)}>
                  {item}
                </button>
              ))}
            </div>

            <div className="walk-list" aria-live="polite">
              {visibleWalks.map((walk) => (
                <article className="walk-card" key={walk.pet}>
                  <Image className="dog-avatar" src={walk.image} alt={`Собака ${walk.pet}`} width={112} height={112} sizes="112px" />
                  <div className="walk-info">
                    <h2>{walk.pet}</h2>
                    <p className="owner">{walk.owner}</p>
                    <p><Clock3 className="time-icon" aria-hidden="true" />{walk.time}</p>
                    <p><MapPin aria-hidden="true" />{walk.point}</p>
                  </div>
                </article>
              ))}
            </div>

            {menuOpen && (
              <div className="menu-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMenuOpen(false); }}>
                <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="menu-title">
                  <div className="drawer-header">
                    <h2 id="menu-title">Меню</h2>
                    <button ref={closeButtonRef} className="icon-button" type="button" aria-label="Закрыть меню" onClick={() => setMenuOpen(false)}><X /></button>
                  </div>
                  <p className="drawer-label">Сохранённая локация</p>
                  <button className="location-card" type="button" onClick={() => { setMenuOpen(false); setScreen("location"); }}>
                    <span><small>Город</small><strong>{location.city}</strong></span>
                    <span><small>Район</small><strong>{location.district}</strong></span>
                    <span><small>ЖК</small><strong>{location.complex}</strong></span>
                    <span className="change-location">Изменить локацию <ChevronRight /></span>
                  </button>
                  <button className="drawer-link" type="button" onClick={() => { setMenuOpen(false); setScreen("pet"); }}>
                    <span className="drawer-link-icon"><PawPrint /></span>
                    <span>Добавить питомца</span>
                    <ChevronRight />
                  </button>
                </aside>
              </div>
            )}
          </div>
        )}

        {screen === "pet" && (
          <div className="screen form-screen pet-screen">
            <button className="icon-button back-button" type="button" aria-label="Назад к прогулкам" onClick={() => setScreen("walks")}>
              <ArrowLeft />
            </button>
            <div className="screen-heading">
              <h1>Добавить питомца</h1>
              <p>Расскажите немного о вашем друге</p>
            </div>
            <form className="pet-form" onSubmit={savePet}>
              <label className={`photo-upload ${photoUrl ? "has-photo" : ""}`}>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhoto} required />
                {photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoUrl} alt="Предпросмотр фотографии питомца" />
                ) : (
                  <><Camera aria-hidden="true" /><span>Загрузить фото</span></>
                )}
              </label>
              {photoError && <p className="error-message" role="alert">{photoError}</p>}
              <label className="field text-field">
                <span>Имя питомца</span>
                <input name="petName" required maxLength={40} placeholder="Например, Боня" />
              </label>
              <label className="field text-field">
                <span>Имя хозяйки</span>
                <input name="ownerName" required maxLength={60} placeholder="Например, Анна" />
              </label>
              <button className="primary-button form-submit" type="submit">
                {petSaved ? <><CheckCircle2 /> Питомец добавлен</> : "Сохранить"}
              </button>
            </form>
          </div>
        )}
      </section>
    </main>
  );
}
