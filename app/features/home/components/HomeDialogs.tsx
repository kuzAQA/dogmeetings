"use client";

import { CheckCircle2, Copy, Forward, Hourglass, RefreshCw } from "lucide-react";
import type { RefObject } from "react";
import type { ApiWalk } from "../../../../lib/walks";
import type { Pet } from "../model";

type HomeDialogsProps = {
  showPetRequired: boolean;
  informationButtonRef: RefObject<HTMLButtonElement | null>;
  onContinueToRequiredPet: () => void;
  showSharedPetAlreadyAdded: boolean;
  onDismissSharedPetAlreadyAdded: () => void;
  locationRequestSent: boolean;
  locationRequestButtonRef: RefObject<HTMLButtonElement | null>;
  onDismissLocationRequestSent: () => void;
  petToShare: Pet | null;
  petShareLink: string;
  petShareLoading: boolean;
  petShareRefreshing: boolean;
  petShareError: string;
  petShareCopied: boolean;
  shareDoneButtonRef: RefObject<HTMLButtonElement | null>;
  onCopyPetShareLink: () => void;
  onRotatePetShareLink: (pet: Pet) => void;
  onClosePetShare: () => void;
  walkPendingDelete: ApiWalk | null;
  walkDeleting: boolean;
  walkDeleteError: string;
  petPendingDelete: Pet | null;
  petDeleting: boolean;
  petDeleteError: string;
  deleteCancelRef: RefObject<HTMLButtonElement | null>;
  onDeleteWalk: () => void;
  onCancelDeleteWalk: () => void;
  onDeletePet: () => void;
  onCancelDeletePet: () => void;
};

export function HomeDialogs({
  showPetRequired,
  informationButtonRef,
  onContinueToRequiredPet,
  showSharedPetAlreadyAdded,
  onDismissSharedPetAlreadyAdded,
  locationRequestSent,
  locationRequestButtonRef,
  onDismissLocationRequestSent,
  petToShare,
  petShareLink,
  petShareLoading,
  petShareRefreshing,
  petShareError,
  petShareCopied,
  shareDoneButtonRef,
  onCopyPetShareLink,
  onRotatePetShareLink,
  onClosePetShare,
  walkPendingDelete,
  walkDeleting,
  walkDeleteError,
  petPendingDelete,
  petDeleting,
  petDeleteError,
  deleteCancelRef,
  onDeleteWalk,
  onCancelDeleteWalk,
  onDeletePet,
  onCancelDeletePet
}: HomeDialogsProps) {
  return (
    <>
      {showPetRequired && (
        <div className="information-overlay">
          <section className="information-dialog" role="dialog" aria-modal="true" aria-describedby="pet-required-description">
            <p id="pet-required-description">Добавьте информацию о своём питомце, чтобы сообщить о прогулке</p>
            <button ref={informationButtonRef} className="primary-button" type="button" onClick={onContinueToRequiredPet}>Хорошо</button>
          </section>
        </div>
      )}
      {showSharedPetAlreadyAdded && (
        <div className="information-overlay">
          <section className="information-dialog shared-pet-already-added-dialog" role="alertdialog" aria-modal="true" aria-describedby="shared-pet-already-added-description">
            <p id="shared-pet-already-added-description">Этот питомец уже добавлен</p>
            <button className="primary-button" type="button" onClick={onDismissSharedPetAlreadyAdded}>Хорошо</button>
          </section>
        </div>
      )}
      {locationRequestSent && (
        <div className="information-overlay">
          <section className="information-dialog location-request-dialog" role="dialog" aria-modal="true" aria-describedby="location-request-description">
            <Hourglass className="location-request-dialog-icon" aria-hidden="true" />
            <p id="location-request-description">Пока вы ждёте добавления своей локации, можете выбрать другое место для прогулки</p>
            <button ref={locationRequestButtonRef} className="primary-button" type="button" onClick={onDismissLocationRequestSent}>Хорошо</button>
          </section>
        </div>
      )}
      {petToShare && (
        <div className="information-overlay pet-share-overlay" role="presentation">
          <section className="information-dialog pet-share-dialog" role="dialog" aria-modal="true" aria-labelledby="pet-share-title">
            <Forward className="pet-share-dialog-icon" aria-hidden="true" />
            <h2 id="pet-share-title">Поделиться питомцем</h2>
            <p>Отправьте эту ссылку человеку, с которым хотите вместе управлять питомцем</p>
            {petShareLoading ? (
              <div className="pet-share-loading" role="status"><span>Получаем ссылку…</span></div>
            ) : (
              <>
                <div className="pet-share-link-row">
                  <input aria-label="Ссылка на питомца" readOnly value={petShareLink} onFocus={(event) => event.currentTarget.select()} />
                  <button className={`pet-share-copy-button ${petShareCopied ? "pet-share-copy-button--copied" : ""}`} type="button" disabled={!petShareLink} aria-label="Копировать ссылку" onClick={onCopyPetShareLink}>
                    {petShareCopied ? <CheckCircle2 aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  </button>
                </div>
                <div className="pet-share-status" aria-live="polite">{petShareCopied && <span>Скопировано</span>}</div>
                <button className="pet-share-renew-button" type="button" disabled={!petShareLink || petShareRefreshing} onClick={() => onRotatePetShareLink(petToShare)}><RefreshCw aria-hidden="true" />Получить новую ссылку</button>
              </>
            )}
            {petShareError && <p className="form-error pet-share-error" role="alert">{petShareError}</p>}
            <button ref={shareDoneButtonRef} className="primary-button" type="button" disabled={petShareLoading || petShareRefreshing} onClick={onClosePetShare}>Готово</button>
          </section>
        </div>
      )}
      {walkPendingDelete && (
        <div className="delete-confirm-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !walkDeleting) onCancelDeleteWalk(); }}>
          <section className="delete-confirm" role="alertdialog" aria-modal="true" aria-labelledby="delete-walk-title" aria-describedby="delete-walk-description">
            <h2 id="delete-walk-title">Удалить прогулку?</h2>
            <p id="delete-walk-description">Удалив прогулку, не забудьте добавить новую, чтобы ваши друзья вас не потеряли</p>
            {walkDeleteError && <p className="delete-confirm-error" role="alert">{walkDeleteError}</p>}
            <div className="delete-confirm-actions">
              <button className="delete-confirm-button" type="button" disabled={walkDeleting} onClick={onDeleteWalk}>{walkDeleting ? "Удаляем…" : "Удалить"}</button>
              <button ref={deleteCancelRef} className="keep-walk-button" type="button" disabled={walkDeleting} onClick={onCancelDeleteWalk}>Оставить</button>
            </div>
          </section>
        </div>
      )}
      {petPendingDelete && (
        <div className="delete-confirm-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !petDeleting) onCancelDeletePet(); }}>
          <section className="delete-confirm" role="alertdialog" aria-modal="true" aria-labelledby="delete-pet-title" aria-describedby="delete-pet-description">
            <h2 id="delete-pet-title">{petPendingDelete.isOwner ? "Удалить питомца?" : "Удалить добавленного питомца?"}</h2>
            <p id="delete-pet-description">{petPendingDelete.isOwner ? "Вместе с питомцем будут удалены добавленные для него прогулки" : "Питомец будет удалён только из вашего списка. У владельца он останется"}</p>
            {petDeleteError && <p className="delete-confirm-error" role="alert">{petDeleteError}</p>}
            <div className="delete-confirm-actions">
              <button className="delete-confirm-button" type="button" disabled={petDeleting} onClick={onDeletePet}>{petDeleting ? "Удаляем…" : "Удалить"}</button>
              <button ref={deleteCancelRef} className="keep-walk-button" type="button" disabled={petDeleting} onClick={onCancelDeletePet}>Оставить</button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
