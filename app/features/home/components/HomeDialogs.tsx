"use client";

import { PawIcon } from "../../../components/ui/PawIcon";
import { CheckCircle2, Copy, Hourglass, Share2 } from "lucide-react";
import { type MouseEvent, type RefObject, useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import Image from "next/image";
import type { ApiWalk } from "../../../../lib/walks";
import { DogmeetDialog, requestDialogClose } from "../../../components/ui/DogmeetFrame";
import type { Pet } from "../model";

type Props = {
  showPetRequired: boolean; informationButtonRef: RefObject<HTMLButtonElement | null>; onContinueToRequiredPet: () => void;
  onDismissPetRequired: () => void;
  showSharedPetAlreadyAdded: boolean; onDismissSharedPetAlreadyAdded: () => void;
  locationRequestSent: boolean; locationRequestButtonRef: RefObject<HTMLButtonElement | null>; onDismissLocationRequestSent: () => void;
  petToShare: Pet | null; petShareLink: string; petShareLoading: boolean; petShareRefreshing: boolean; petShareError: string; shareDoneButtonRef: RefObject<HTMLButtonElement | null>; onRetryPetShare: (pet: Pet) => void; onRotatePetShareLink: (pet: Pet) => void; onClosePetShare: () => void;
  walkPendingDelete: ApiWalk | null; walkDeleting: boolean; walkDeleteError: string;
  petPendingDelete: Pet | null; petDeleting: boolean; petDeleteError: string; deleteCancelRef: RefObject<HTMLButtonElement | null>;
  onDeleteWalk: (event: MouseEvent<HTMLButtonElement>) => void; onCancelDeleteWalk: () => void; onDeletePet: (event: MouseEvent<HTMLButtonElement>) => void; onCancelDeletePet: () => void;
};

export function HomeDialogs(props: Props) {
  const qr = useMemo(() => {
    if (!props.petShareLink) return null;
    try {
      const code = qrcode(0, "M");
      code.addData(props.petShareLink, "Byte");
      code.make();
      const size = code.getModuleCount();
      let path = "";
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          if (code.isDark(row, col)) path += `M${col} ${row}h1v1h-1z`;
        }
      }
      return { size, path };
    } catch { return null; }
  }, [props.petShareLink]);
  const { showPetRequired, informationButtonRef, onContinueToRequiredPet, showSharedPetAlreadyAdded, onDismissSharedPetAlreadyAdded, locationRequestSent, locationRequestButtonRef, onDismissLocationRequestSent, petToShare, petShareLink, petShareLoading, petShareRefreshing, petShareError, shareDoneButtonRef, onRetryPetShare, onRotatePetShareLink, onClosePetShare, walkPendingDelete, walkDeleting, walkDeleteError, petPendingDelete, petDeleting, petDeleteError, deleteCancelRef, onDeleteWalk, onCancelDeleteWalk, onDeletePet, onCancelDeletePet } = props;
  const [shareFeedback, setShareFeedback] = useState<{ link: string; text: string; error: boolean } | null>(null);
  const feedback = shareFeedback?.link === petShareLink ? shareFeedback : null;

  async function copyPetShareLink(fallback = false) {
    setShareFeedback(null);
    try {
      await navigator.clipboard.writeText(petShareLink);
      setShareFeedback({ link: petShareLink, text: fallback ? "Системное меню недоступно. Ссылка скопирована" : "Ссылка скопирована", error: false });
    } catch {
      setShareFeedback({ link: petShareLink, text: "Не удалось скопировать ссылку. Попробуйте ещё раз.", error: true });
    }
  }

  async function sharePetLink() {
    if (typeof navigator.share !== "function") {
      await copyPetShareLink(true);
      return;
    }
    setShareFeedback(null);
    try {
      await navigator.share({ url: petShareLink });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setShareFeedback({ link: petShareLink, text: "Не удалось поделиться ссылкой. Попробуйте ещё раз.", error: true });
    }
  }

  return <>
    {showPetRequired && <DogmeetDialog className="sheet--pet-required" aria-label="Сначала питомец" onDismiss={props.onDismissPetRequired} footer={<><button ref={informationButtonRef} className="button" type="button" onClick={(event) => requestDialogClose(event.currentTarget, onContinueToRequiredPet)}>Добавить питомца</button><button className="button quiet" type="button" onClick={(event) => requestDialogClose(event.currentTarget, props.onDismissPetRequired)}>Пока посмотреть прогулки</button></>}><PawIcon className="state-icon" /><h2>Познакомимся<br />с питомцем?</h2><p>Добавьте питомца, чтобы соседи знали, с кем вы выйдете гулять.</p></DogmeetDialog>}
    {showSharedPetAlreadyAdded && <DogmeetDialog title="Питомец уже добавлен" role="alertdialog" onDismiss={onDismissSharedPetAlreadyAdded} footer={<button className="button" type="button" onClick={(event) => requestDialogClose(event.currentTarget, onDismissSharedPetAlreadyAdded)}>К моим питомцам</button>}><CheckCircle2 className="state-icon" /><h2 id="already-title">Вы уже знакомы</h2><p>Этот питомец уже есть в вашем списке. Добавлять его снова не нужно.</p></DogmeetDialog>}
    {locationRequestSent && <DogmeetDialog className="sheet--location-sent" aria-label="Заявка отправлена" onDismiss={onDismissLocationRequestSent} footer={<button ref={locationRequestButtonRef} className="button" type="button" onClick={(event) => requestDialogClose(event.currentTarget, onDismissLocationRequestSent)}>Хорошо</button>}><Hourglass className="state-icon" /><h2 id="location-sent-title">Заявка отправлена</h2><p>Пока мы рассматриваем заявку, можно выбрать соседний жилой комплекс.</p></DogmeetDialog>}
    {petToShare && <DogmeetDialog className="sheet--share" aria-label="Поделиться питомцем" busy={petShareRefreshing} onDismiss={onClosePetShare} footer={!petShareLoading ? <>
      {petShareLink && <div className="pet-share-link">
        <a href={petShareLink}>{petShareLink}</a>
        <button className="icon-button" type="button" aria-label="Скопировать ссылку" disabled={petShareRefreshing} onClick={() => copyPetShareLink()}><Copy aria-hidden="true" /></button>
        <button className="icon-button" type="button" aria-label="Поделиться" disabled={petShareRefreshing} onClick={sharePetLink}><Share2 aria-hidden="true" /></button>
      </div>}
      {feedback && !petShareRefreshing && <p className={feedback.error ? "field-error" : "small-note"} role={feedback.error ? "alert" : "status"}>{feedback.text}</p>}
      <p className="small-note">QR-код и ссылка действуют для одного добавления питомца</p><button className="button quiet" type="button" disabled={!petShareLink || petShareRefreshing} onClick={() => onRotatePetShareLink(petToShare)}>{petShareRefreshing ? "Обновляем…" : "Получить новые QR-код и ссылку"}</button></> : undefined}><h2 id="pet-share-title">Один питомец.<br />Общие планы.</h2><p>Покажите QR-код или отправьте ссылку близкому человеку: он сможет управлять питомцем {petToShare.name} и сообщать о прогулках</p>{petShareLoading ? <div className="resource-loading" role="status" aria-label="Создаём QR-код"><span /><span className="short" /></div> : qr ? <div className="pet-share-qr-frame" aria-busy={petShareRefreshing}><svg className="pet-share-qr" role="img" aria-label="Одноразовый QR-код" data-value={petShareLink} viewBox={`-4 -4 ${qr.size + 8} ${qr.size + 8}`} xmlns="http://www.w3.org/2000/svg"><path d={qr.path} fill="#000" shapeRendering="crispEdges" /></svg>{petShareRefreshing && <div className="pet-share-qr-loading" role="status" aria-label="Обновляем QR-код"><span className="loader" aria-hidden="true" /></div>}</div> : null}{(petShareError || (!petShareLoading && !petShareRefreshing && !qr)) && <><p className="field-error" role="alert">{petShareError || "Не удалось создать QR-код."}</p><button className="button secondary" type="button" disabled={petShareLoading || petShareRefreshing} onClick={() => onRetryPetShare(petToShare)}>Попробовать снова</button></>}<button ref={shareDoneButtonRef} className="visually-hidden" type="button" onClick={(event) => requestDialogClose(event.currentTarget, onClosePetShare)}>Закрыть</button></DogmeetDialog>}
    {walkPendingDelete && <DogmeetDialog title="Удалить прогулку?" role="alertdialog" busy={walkDeleting} onDismiss={onCancelDeleteWalk} footer={<><button className="button danger" type="button" disabled={walkDeleting} onClick={onDeleteWalk}>{walkDeleting ? "Удаляем…" : "Удалить прогулку"}</button><button ref={deleteCancelRef} className="button secondary" type="button" disabled={walkDeleting} onClick={(event) => requestDialogClose(event.currentTarget, onCancelDeleteWalk)}>Оставить</button></>}><h2>Удалить прогулку?</h2><p>Прогулка в {walkPendingDelete.walkTime.slice(0, 5)}, {walkPendingDelete.point.toLowerCase()}, исчезнет из расписания.</p><p>Добавьте новую, когда снова соберётесь гулять.</p>{walkDeleteError && <p className="field-error" role="alert">{walkDeleteError}</p>}</DogmeetDialog>}
    {petPendingDelete && <DogmeetDialog title="Удалить питомца" role="alertdialog" busy={petDeleting} onDismiss={onCancelDeletePet} footer={<><button className="button danger" type="button" disabled={petDeleting} onClick={onDeletePet}>{petDeleting ? "Удаляем…" : petPendingDelete.isOwner ? "Удалить питомца" : "Убрать из списка"}</button><button ref={deleteCancelRef} className="button secondary" type="button" disabled={petDeleting} onClick={(event) => requestDialogClose(event.currentTarget, onCancelDeletePet)}>Оставить</button></>}><Image className="pet-face large" src={petPendingDelete.photoUrl} alt={petPendingDelete.name} width={92} height={92} unoptimized /><h2 id="delete-pet-title">{petPendingDelete.isOwner ? `Удалить ${petPendingDelete.name}?` : "Убрать из списка?"}</h2><p>{petPendingDelete.isOwner ? "Питомец и все его прогулки будут удалены. Это действие нельзя отменить." : "Питомец исчезнет только из вашего списка. У владельца он останется."}</p>{petDeleteError && <p className="field-error" role="alert">{petDeleteError}</p>}</DogmeetDialog>}
  </>;
}
