"use client";

import { CircleAlert, Plus } from "lucide-react";
import Image from "next/image";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { BrowserGuide, detectBrowserGuidePlatform, isInAppBrowser, type BrowserGuidePlatform } from "../../components/ui/BrowserGuide";
import { DogmeetState } from "../../components/ui/DogmeetState";
import { DogmeetDialog, DogmeetFrame, DogmeetHeader, requestDialogClose } from "../../components/ui/DogmeetFrame";
import { ApiRequestError } from "../../features/api/client";
import { addSharedPet, ensureClientSession, loadSharedPet, type SharedPet } from "../../features/share/api";

type ShareStage = "guide" | "checking" | "preview" | "already-added" | "success" | "error";

export default function SharedPetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [pet, setPet] = useState<SharedPet | null>(null);
  const [stage, setStage] = useState<ShareStage>("guide");
  const [guidePlatform, setGuidePlatform] = useState<BrowserGuidePlatform>("ios");
  const [adding, setAdding] = useState(false);
  const [addedPetId, setAddedPetId] = useState("");
  const [error, setError] = useState("");
  const [linkInactive, setLinkInactive] = useState(false);
  const guidePlatformSelected = useRef(false);

  useEffect(() => { if (!guidePlatformSelected.current) setGuidePlatform(detectBrowserGuidePlatform(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)); }, []);
  function selectGuidePlatform(platform: BrowserGuidePlatform) { guidePlatformSelected.current = true; setGuidePlatform(platform); }

  const continueFromBrowserGuide = useCallback(async () => {
    setStage("checking"); setError(""); setLinkInactive(false);
    try {
      await ensureClientSession();
      const data = await loadSharedPet(token);
      if (data.inactive) setLinkInactive(true);
      if (!data.pet) throw new Error(data.error || "Ссылка недействительна.");
      setPet(data.pet); setStage(data.alreadyAdded ? "already-added" : "preview");
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.status === 410) setLinkInactive(true);
      setError(requestError instanceof Error ? requestError.message : "Не удалось открыть питомца."); setStage("error");
    }
  }, [token]);

  useEffect(() => { const timer = window.setTimeout(() => { if (!isInAppBrowser(navigator.userAgent)) void continueFromBrowserGuide(); }, 0); return () => window.clearTimeout(timer); }, [continueFromBrowserGuide]);

  async function acceptPet() {
    if (!pet || adding) return;
    setAdding(true); setError("");
    try {
      await ensureClientSession();
      const data = await addSharedPet(token);
      if (data.inactive) setLinkInactive(true);
      if (!data.petId) throw new Error(data.error || "Не удалось добавить питомца.");
      if (data.alreadyAdded) { setStage("already-added"); setAdding(false); return; }
      setAddedPetId(data.petId); setStage("success"); setAdding(false);
    } catch (requestError) {
      if (requestError instanceof ApiRequestError && requestError.status === 410) setLinkInactive(true);
      setError(requestError instanceof Error ? requestError.message : "Не удалось добавить питомца."); setAdding(false);
    }
  }

  return (
    <DogmeetFrame>
      <main>
        <section className="shared-pet-page" aria-label="Добавление питомца по ссылке">
          {stage === "guide" && <BrowserGuide platform={guidePlatform} onPlatformChange={selectGuidePlatform} onContinue={continueFromBrowserGuide} onBack={() => window.location.replace("/")} />}
          {stage === "checking" && <DogmeetState state="loading" />}
          {stage === "success" && <DogmeetState state="success" title="Теперь вы гуляете вместе" message="Питомец доступен в вашем списке." onAction={() => window.location.replace(`/?sharedPet=${encodeURIComponent(addedPetId)}`)} />}
          {stage === "preview" && adding && <DogmeetState state="loading" title="Сохраняем…" />}
          {stage === "preview" && !adding && pet && <div className="screen accept-screen"><DogmeetHeader onBack={() => window.location.replace("/")} /><h1>Приглашение</h1><p className="lead">{pet.ownerName} делится<br />с вами питомцем.</p><Image className="portrait" src={pet.photoUrl} alt={pet.name} width={390} height={300} unoptimized={pet.photoUrl.startsWith("/api/")} /><div className="pet-title"><h2>{pet.name}</h2><span>{pet.breed}</span></div><p>Вы сможете менять данные питомца {pet.name} и сообщать о прогулках вместе с владельцем.</p>{error && <p className="field-error" role="alert">{error}</p>}<button className="button" type="button" disabled={adding} onClick={acceptPet}>{adding ? "Добавляем…" : "Добавить к моим питомцам"}<Plus /></button><button className="button quiet" type="button" disabled={adding} onClick={() => window.location.replace("/")}>Отказаться</button></div>}
          {stage === "error" && <div className="screen"><DogmeetHeader onBack={() => window.location.replace("/")} /><div className="state-block"><CircleAlert className="state-icon" /><h2>{linkInactive ? "Ссылка уже использована" : "Ссылка недействительна"}</h2><p>{linkInactive ? "По этой ссылке питомец уже добавлен. Для другого человека нужна новая ссылка." : error || "Владелец мог получить новую ссылку. Попросите его поделиться ещё раз."}</p><button className="button" type="button" onClick={() => window.location.replace("/")}>К прогулкам</button></div></div>}
        {stage === "already-added" && pet && <DogmeetDialog title="Питомец уже добавлен" role="alertdialog" onDismiss={() => window.location.replace("/")} footer={<button className="button" type="button" onClick={(event) => requestDialogClose(event.currentTarget, () => window.location.replace("/"))}>К моим питомцам</button>}><Image className="pet-face large" src={pet.photoUrl} alt={pet.name} width={92} height={92} unoptimized /><h2 id="already-added-title">Вы уже знакомы</h2><p>{pet.name} уже есть в вашем списке. Добавлять питомца снова не нужно.</p></DogmeetDialog>}
        </section>
      </main>
    </DogmeetFrame>
  );
}
