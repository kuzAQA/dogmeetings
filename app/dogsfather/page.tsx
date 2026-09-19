"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Camera,
  Check,
  ChevronRight,
  ArrowRight,
  Compass,
  PawPrint,
  Plus,
  Search,
  LogOut,
  MapPin,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { ChangeEvent, FormEvent, type MouseEvent, useCallback, useEffect, useState } from "react";
import { ApiRequestError } from "../features/api/client";
import {
  approveLocationRequest,
  deleteAdminPet,
  getAdminSession,
  getLoginChallenge,
  loadAdminPets,
  loadLocationRequests,
  logoutAdmin,
  rejectLocationRequest,
  saveAdminPet as saveAdminPetRequest,
  submitLogin
} from "../features/admin/api";
import {
  type AdminPet,
  type LocationRequest,
  type PendingRequestAction
} from "../features/admin/model";
import { createLoginProof } from "../features/admin/login-proof";
import { allowedPhotoTypes, containsLetter, MAX_SOURCE_PHOTO_SIZE } from "../features/shared/validation";
import { compressPetPhoto } from "../../lib/pet-photo";
import { DogmeetState } from "../components/ui/DogmeetState";
import { DogmeetDialog, DogmeetFrame, DogmeetHeader, requestDialogClose } from "../components/ui/DogmeetFrame";

type AdminPhase = "checking" | "login" | "dashboard" | "requests" | "pets" | "edit-pet";

function formatRequestDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export default function AdminPage() {
  const [phase, setPhase] = useState<AdminPhase>("checking");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [requests, setRequests] = useState<LocationRequest[]>([]);
  const [pets, setPets] = useState<AdminPet[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [contentLoading, setContentLoading] = useState(false);
  const [pendingRequestAction, setPendingRequestAction] = useState<PendingRequestAction | null>(null);
  const [petPendingDelete, setPetPendingDelete] = useState<AdminPet | null>(null);
  const [petBeingEdited, setPetBeingEdited] = useState<AdminPet | null>(null);
  const [petName, setPetName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [breed, setBreed] = useState("");
  const [petPhoto, setPetPhoto] = useState<File | null>(null);
  const [petPhotoPreview, setPetPhotoPreview] = useState("");
  const [petPhotoObjectUrl, setPetPhotoObjectUrl] = useState("");
  const [signOutPending, setSignOutPending] = useState(false);
  const [query, setQuery] = useState("");
  const [photoOpen, setPhotoOpen] = useState(false);
  const [result, setResult] = useState<{ title: string; message: string; heading: string; action?: string; sheet?: boolean } | null>(null);

  const returnToLogin = useCallback(() => {
    setPhase("login");
    setRequests([]);
    setPets([]);
  }, []);

  const loadRequests = useCallback(async () => {
    setContentLoading(true);
    setError("");
    try {
      setRequests(await loadLocationRequests());
    } catch (loadError) {
      if (loadError instanceof ApiRequestError && loadError.status === 401) {
        returnToLogin();
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить заявки.");
    } finally {
      setContentLoading(false);
    }
  }, [returnToLogin]);

  const loadPets = useCallback(async () => {
    setContentLoading(true);
    setError("");
    try {
      setPets(await loadAdminPets());
    } catch (loadError) {
      if (loadError instanceof ApiRequestError && loadError.status === 401) {
        returnToLogin();
        return;
      }
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить питомцев.");
    } finally {
      setContentLoading(false);
    }
  }, [returnToLogin]);

  useEffect(() => {
    let active = true;
    void getAdminSession()
      .then((payload) => {
        if (!active) return;
        setPhase(payload.authenticated ? "dashboard" : "login");
      })
      .catch(() => {
        if (active) {
          setError("Не удалось проверить сессию администратора.");
          setPhase("login");
        }
      });
    return () => { active = false; };
  }, []);

  useEffect(() => () => {
    if (petPhotoObjectUrl) URL.revokeObjectURL(petPhotoObjectUrl);
  }, [petPhotoObjectUrl]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password) return;
    setSubmitting(true);
    setError("");
    try {
      const challengePayload = await getLoginChallenge();
      if (
        !challengePayload.challenge
        || !challengePayload.salt
        || typeof challengePayload.iterations !== "number"
        || !Number.isSafeInteger(challengePayload.iterations)
      ) {
        throw new Error(challengePayload.error || "Не удалось подготовить защищённый вход.");
      }
      const credentialsProof = await createLoginProof(username, password, {
        challenge: challengePayload.challenge,
        iterations: challengePayload.iterations,
        salt: challengePayload.salt
      });
      setPassword("");
      await submitLogin(credentialsProof);
      setPhase("dashboard");
      setResult({ title: "Вы вошли", message: "Панель управления доступна.", heading: "Вход администратора", action: "Открыть управление" });
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Не удалось выполнить вход.");
    } finally {
      setSubmitting(false);
    }
  }

  async function signOut(event: MouseEvent<HTMLButtonElement>) {
    const dialogTrigger = event.currentTarget;
    await logoutAdmin();
    setRequests([]);
    setPets([]);
    setUsername("");
    setPassword("");
    await requestDialogClose(dialogTrigger, () => {
      setSignOutPending(false);
      setPhase("login");
      setResult({ title: "Вы вышли", message: "Сессия администратора завершена.", heading: "Выход" });
    }, true);
  }

  function openRequests() {
    setPhase("requests");
    void loadRequests();
  }

  function openPets() {
    setPhase("pets");
    void loadPets();
  }

  function openPetEditor(pet: AdminPet) {
    if (petPhotoObjectUrl) URL.revokeObjectURL(petPhotoObjectUrl);
    setPetPhotoObjectUrl("");
    setPetPhoto(null);
    setPetPhotoPreview(pet.photoUrl);
    setPetBeingEdited(pet);
    setPetName(pet.name);
    setOwnerName(pet.ownerName);
    setBreed(pet.breed);
    setError("");
    setPhase("edit-pet");
  }

  function closePetEditor() {
    if (petPhotoObjectUrl) URL.revokeObjectURL(petPhotoObjectUrl);
    setPetPhotoObjectUrl("");
    setPetPhoto(null);
    setPetPhotoPreview("");
    setPetBeingEdited(null);
    setError("");
    setPhase("pets");
  }

  function handleAdminPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError("");
    if (!file) return;
    if (!allowedPhotoTypes.has(file.type)) {
      setError("Выберите изображение в формате JPEG, PNG или WebP.");
      return;
    }
    if (file.size > MAX_SOURCE_PHOTO_SIZE) {
      setError("Исходная фотография должна быть меньше 10 МБ.");
      return;
    }
    if (petPhotoObjectUrl) URL.revokeObjectURL(petPhotoObjectUrl);
    const objectUrl = URL.createObjectURL(file);
    setPetPhotoObjectUrl(objectUrl);
    setPetPhotoPreview(objectUrl);
    setPetPhoto(file);
  }

  async function confirmRequestAction(event: MouseEvent<HTMLButtonElement>) {
    if (!pendingRequestAction) return;
    const dialogTrigger = event.currentTarget;
    setSubmitting(true);
    setError("");
    try {
      if (pendingRequestAction.type === "approve") {
        await approveLocationRequest(pendingRequestAction.request.id);
      } else {
        await rejectLocationRequest(pendingRequestAction.request.id);
      }
      setRequests((current) => current.filter((item) => item.id !== pendingRequestAction.request.id));
      await requestDialogClose(dialogTrigger, () => {
        setPendingRequestAction(null);
        setResult({ title: pendingRequestAction.type === "approve" ? "Локация добавлена" : "Заявка отклонена", message: pendingRequestAction.type === "approve" ? "Жители смогут выбрать её при поиске прогулок." : "Локация не добавлена в список.", heading: pendingRequestAction.type === "approve" ? "Добавить локацию" : "Отклонить заявку", sheet: true });
      }, true);
    } catch (actionError) {
      if (actionError instanceof ApiRequestError && actionError.status === 401) {
        await requestDialogClose(dialogTrigger, () => {
          returnToLogin();
          setPendingRequestAction(null);
        }, true);
        return;
      }
      setError(actionError instanceof Error ? actionError.message : "Не удалось обработать заявку.");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveAdminPet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!petBeingEdited || submitting) return;
    if (!containsLetter.test(petName.trim()) || !containsLetter.test(ownerName.trim()) || !containsLetter.test(breed.trim())) {
      setError("Заполните имя питомца, имя хозяина и породу.");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const formData = new FormData();
      formData.set("petId", petBeingEdited.id);
      formData.set("petName", petName);
      formData.set("ownerName", ownerName);
      formData.set("breed", breed);
      if (petPhoto) {
        const compressedPhoto = await compressPetPhoto(petPhoto);
        formData.set("photo", compressedPhoto, compressedPhoto.name);
      }

      const savedPet = await saveAdminPetRequest(formData);
      setPets((current) => current.map((pet) => pet.id === savedPet.id ? savedPet : pet));
      closePetEditor();
      setResult({ title: "Изменения сохранены", message: "Данные питомца обновлены.", heading: "Правка питомца" });
    } catch (saveError) {
      if (saveError instanceof ApiRequestError && saveError.status === 401) {
        returnToLogin();
        return;
      }
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить питомца.");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmPetDelete(event: MouseEvent<HTMLButtonElement>) {
    if (!petPendingDelete || submitting) return;
    const dialogTrigger = event.currentTarget;
    setSubmitting(true);
    setError("");
    try {
      await deleteAdminPet(petPendingDelete.id);
      setPets((current) => current.filter((pet) => pet.id !== petPendingDelete.id));
      await requestDialogClose(dialogTrigger, () => {
        setPetPendingDelete(null);
        setResult({ title: "Питомец удалён", message: "Связанные прогулки также удалены.", heading: "Удаление администратором", sheet: true });
      }, true);
    } catch (deleteError) {
      if (deleteError instanceof ApiRequestError && deleteError.status === 401) {
        await requestDialogClose(dialogTrigger, () => {
          returnToLogin();
          setPetPendingDelete(null);
        }, true);
        return;
      }
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить питомца.");
    } finally {
      setSubmitting(false);
    }
  }

  function sectionHeading(title: string, subtitle: string) {
    return (
      <><DogmeetHeader admin onBack={phase === "edit-pet" ? closePetEditor : () => setPhase("dashboard")} /><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</>
    );
  }

  const petFormIsValid = containsLetter.test(petName.trim())
    && containsLetter.test(ownerName.trim())
    && containsLetter.test(breed.trim())
    && petName.trim().length <= 40
    && ownerName.trim().length <= 60
    && breed.trim().length <= 20;

  if (result && !result.sheet) return <DogmeetFrame><main><DogmeetHeader admin /><h1>{result.heading}</h1><DogmeetState state="success" title={result.title} message={result.message} action={result.action} onAction={() => setResult(null)} /></main></DogmeetFrame>;

  return <DogmeetFrame><main><section className="admin-shell">
    {phase === "checking" && <DogmeetState state="loading" />}
    {phase === "login" && <>
      <DogmeetHeader admin onBack={() => window.location.assign("/")} /><h1>Вход администратора</h1>
      {submitting ? <DogmeetState state="loading" title="Сохраняем…" /> : <><ShieldCheck className="state-icon" /><h2>Для тех, кто<br />заботится о дворе</h2><p>Войдите, чтобы разбирать заявки жителей и управлять питомцами.</p>
      <form onSubmit={signIn} noValidate>
        <label className="field"><span>Логин</span><input autoComplete="username" maxLength={128} value={username} onChange={(event) => setUsername(event.target.value)} /></label>
        <label className="field"><span>Пароль</span><input type="password" autoComplete="current-password" maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <p className="field-error" role="alert">{error}</p>}
        <button className="button" type="submit" disabled={!username.trim() || !password}>Войти<ArrowRight /></button>
      </form></>}
    </>}
    {phase === "dashboard" && <>
      <DogmeetHeader admin onBack={() => window.location.assign("/")} /><h1>Управление</h1>
      <div className="admin-summary"><ShieldCheck /><h2>Всё начинается<br />с хорошего района.</h2><p>{requests.length} заявки ждут вашего решения.</p></div>
      <nav aria-label="Разделы панели администратора">
        <button className="menu-row" type="button" onClick={openRequests}><MapPin /><span><strong>Заявки жителей</strong><small>Добавление новых локаций</small></span><span className="count">{requests.length}</span></button>
        <button className="menu-row" type="button" onClick={() => { setQuery(""); openPets(); }}><PawPrint /><span><strong>Все питомцы</strong><small>Посмотреть и изменить</small></span><ChevronRight /></button>
        <Link className="menu-row" href="/"><Compass /><span><strong>На главную</strong><small>Расписание прогулок</small></span><ChevronRight /></Link>
        <button className="menu-row" type="button" onClick={() => setSignOutPending(true)}><LogOut /><span><strong>Выйти</strong></span><ChevronRight /></button>
      </nav>
    </>}
    {phase === "requests" && <>
      {sectionHeading("Заявки жителей", "Жители предлагают новые места для совместных прогулок.")}
      {contentLoading ? <DogmeetState state="loading" /> : error && !pendingRequestAction ? <DogmeetState state="error" message={error} onAction={loadRequests} /> : requests.length === 0 ? <DogmeetState state="empty" title="Все заявки разобраны" message="Новые предложения жителей появятся здесь." action="К управлению" onAction={() => setPhase("dashboard")} /> : requests.map((item) => <article className="request-row" key={item.id}>
        <div className="section-line"><span className="tag">Новая заявка</span><small>{formatRequestDate(item.createdAt)}</small></div><h2>{item.complex}</h2><p>{item.city} · {item.district}</p>
        <div className="two-actions"><button className="button" type="button" onClick={() => setPendingRequestAction({request: item, type: "approve"})}><Check />Добавить</button><button className="button secondary" type="button" onClick={() => setPendingRequestAction({request: item, type: "reject"})}>Отклонить</button></div>
      </article>)}
    </>}
    {phase === "pets" && <>
      {sectionHeading("Все питомцы", "")}
      <label className="search-field"><Search /><input aria-label="Найти питомца" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти по имени" /></label>
      {contentLoading ? <DogmeetState state="loading" /> : error && !petPendingDelete ? <DogmeetState state="error" message={error} onAction={loadPets} /> : pets.length === 0 ? <DogmeetState state="empty" title="Пока ни одного питомца" message="Добавьте питомца, чтобы сообщать о прогулках." action="К управлению" onAction={() => setPhase("dashboard")} /> : <div className="pet-rows">{pets.filter((pet) => pet.name.toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru"))).map((pet) => <button className="pet-row" type="button" key={pet.id} onClick={() => openPetEditor(pet)}><Image className="pet-face" src={pet.photoUrl} alt={`Собака ${pet.name}`} width={72} height={72} unoptimized /><span><strong>{pet.name}</strong><small>{pet.breed} · {pet.ownerName}</small></span><ChevronRight /></button>)}</div>}
      {pets.length > 0 && !pets.some((pet) => pet.name.toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru"))) && <p role="status">Никого не нашли. Попробуйте другое имя.</p>}
    </>}
    {phase === "edit-pet" && petBeingEdited && <>
      {photoOpen ? <><DogmeetHeader admin onBack={() => setPhotoOpen(false)} /><h1>Фотография</h1><Image className="photo-preview" src={petPhotoPreview} alt="Предпросмотр фотографии" width={346} height={346} unoptimized /><label className="upload"><Camera /><strong>Выбрать файл</strong><input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleAdminPhoto} /></label><p>JPG, PNG или WebP до 10 МБ. Выберите снимок, на котором хорошо видно питомца.</p>{error && <p className="field-error" role="alert">{error}</p>}<button type="button" className="button" onClick={() => setPhotoOpen(false)}>Использовать фото<Check /></button></> : <>
      {sectionHeading("Правка питомца", "Актуальные данные помогут узнать вас на прогулке.")}
      {submitting && !petPendingDelete ? <DogmeetState state="loading" title="Сохраняем…" /> : <><form onSubmit={saveAdminPet} noValidate>
        <button className="photo-editor" type="button" onClick={() => setPhotoOpen(true)}><Image src={petPhotoPreview} alt="Фотография" width={86} height={86} unoptimized /><span><Camera />Изменить фотографию</span></button>
        <label className="field"><span>Имя питомца</span><input value={petName} maxLength={40} placeholder="Например, Боня" aria-invalid={Boolean(error && !containsLetter.test(petName.trim()))} onChange={(event) => { setPetName(event.target.value); setError(""); }} /></label>
        <label className="field"><span>Имя хозяина</span><input value={ownerName} maxLength={60} placeholder="Например, Анна" aria-invalid={Boolean(error && !containsLetter.test(ownerName.trim()))} onChange={(event) => { setOwnerName(event.target.value); setError(""); }} /></label>
        <label className="field"><span>Порода</span><input value={breed} maxLength={20} placeholder="Например, корги" aria-invalid={Boolean(error && !containsLetter.test(breed.trim()))} onChange={(event) => { setBreed(event.target.value); setError(""); }} /></label>
        {error && !petPendingDelete && <p className="field-error" role="alert">{error}</p>}
        <button className="button" type="submit" disabled={!petFormIsValid || submitting}>Сохранить изменения<span className="action-icon" data-done={petFormIsValid} aria-hidden="true"><Plus /><Check /></span></button>
      </form><button className="button quiet danger-text" type="button" onClick={() => { setError(""); setPetPendingDelete(petBeingEdited); }}><Trash2 />Удалить питомца</button></>}
      </>}
    </>}
    {pendingRequestAction && <DogmeetDialog title={pendingRequestAction.type === "approve" ? "Добавить локацию" : "Отклонить заявку"} busy={submitting} role="alertdialog" onDismiss={() => setPendingRequestAction(null)} footer={!submitting && <><button className={pendingRequestAction.type === "approve" ? "button" : "button danger"} type="button" onClick={confirmRequestAction}>{pendingRequestAction.type === "approve" ? "Добавить локацию" : "Отклонить заявку"}</button><button className="button quiet" type="button" onClick={(event) => requestDialogClose(event.currentTarget, () => setPendingRequestAction(null))}>Отмена</button></>}>
      {submitting ? <DogmeetState state="loading" title="Сохраняем…" /> : <><MapPin className="state-icon" /><h2>{pendingRequestAction.type === "approve" ? <>Ещё один район<br />для встреч</> : "Отклонить заявку?"}</h2><div className="receipt"><strong>{pendingRequestAction.request.complex}</strong><span>{pendingRequestAction.request.city} · {pendingRequestAction.request.district}</span></div><p>{pendingRequestAction.type === "approve" ? "Локация появится в списке. Жители смогут выбрать её для прогулок." : "Заявка будет удалена без добавления локации."}</p>{error && <p className="field-error" role="alert">{error}</p>}</>}
    </DogmeetDialog>}
    {petPendingDelete && <DogmeetDialog title="Удаление администратором" busy={submitting} role="alertdialog" onDismiss={() => setPetPendingDelete(null)} footer={!submitting && <><button className="button danger" type="button" onClick={confirmPetDelete}>Удалить питомца</button><button className="button quiet" type="button" onClick={(event) => requestDialogClose(event.currentTarget, () => setPetPendingDelete(null))}>Оставить</button></>}>
      {submitting ? <DogmeetState state="loading" title="Сохраняем…" /> : <><Image className="pet-face large" src={petPendingDelete.photoUrl} alt={petPendingDelete.name} width={92} height={92} unoptimized /><h2>Удалить {petPendingDelete.name}?</h2><p>Питомец и все его прогулки будут удалены. Это действие нельзя отменить.</p>{error && <p className="field-error" role="alert">{error}</p>}</>}
    </DogmeetDialog>}
    {signOutPending && <DogmeetDialog title="Выход" busy={submitting} role="alertdialog" onDismiss={() => setSignOutPending(false)} footer={<><button className="button" type="button" disabled={submitting} onClick={signOut}>{submitting ? "Выходим…" : "Выйти"}</button><button className="button quiet" type="button" disabled={submitting} onClick={(event) => requestDialogClose(event.currentTarget, () => setSignOutPending(false))}>Остаться</button></>}><LogOut className="state-icon" /><h2>Закончить работу?</h2><p>Для возвращения в управление потребуется снова ввести логин и пароль.</p></DogmeetDialog>}
    {result?.sheet && <DogmeetDialog title={result.heading} onDismiss={() => setResult(null)} footer={<button className="button" type="button" onClick={(event) => requestDialogClose(event.currentTarget, () => setResult(null))}>Готово</button>}><DogmeetState state="success" title={result.title} message={result.message} /></DogmeetDialog>}
  </section></main></DogmeetFrame>;
}
