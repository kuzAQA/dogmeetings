"use client";

import { ArrowLeft, Dog, UserRound } from "lucide-react";
import Image from "next/image";
import { use, useEffect, useState } from "react";

type SharedPet = {
  id: string;
  name: string;
  breed: string;
  ownerName: string;
  photoUrl: string;
};

async function ensureClientSession() {
  const current = await fetch("/api/session", { cache: "no-store" });
  if (current.ok) return;
  if (current.status !== 401) throw new Error("Не удалось восстановить сессию.");

  const created = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  if (!created.ok) {
    const data = await created.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || "Браузер не сохранил безопасную сессию.");
  }
}

export default function SharedPetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [pet, setPet] = useState<SharedPet | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/pet-shares/${encodeURIComponent(token)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { pet?: SharedPet; error?: string };
        if (!response.ok || !data.pet) throw new Error(data.error || "Ссылка недействительна.");
        if (active) setPet(data.pet);
      })
      .catch((requestError) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Не удалось открыть питомца.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  async function acceptPet() {
    if (!pet || adding) return;
    setAdding(true);
    setError("");
    try {
      await ensureClientSession();
      const response = await fetch(`/api/pet-shares/${encodeURIComponent(token)}`, { method: "POST" });
      const data = await response.json() as { petId?: string; added?: boolean; alreadyAdded?: boolean; error?: string };
      if (!response.ok || !data.petId) throw new Error(data.error || "Не удалось добавить питомца.");
      const resultParameter = data.alreadyAdded ? "sharedPetAlreadyAdded" : "sharedPet";
      window.location.replace(`/?${resultParameter}=${encodeURIComponent(data.petId)}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось добавить питомца.");
      setAdding(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="app-shell shared-pet-page" aria-label="Добавление питомца по ссылке">
        <button className="icon-button back-button" type="button" aria-label="Отказаться и вернуться на главную" onClick={() => window.location.replace("/")}>
          <ArrowLeft />
        </button>

        {loading ? (
          <div className="share-page-status" role="status">
            <span className="saving-spinner" aria-hidden="true" />
            <p>Открываем питомца…</p>
          </div>
        ) : pet ? (
          <div className="shared-pet-content">
            <div className="screen-heading shared-pet-heading">
              <h1>С вами поделились питомцем!</h1>
              <p>Хотите добавить его к себе?</p>
            </div>
            <article className="shared-pet-preview">
              <Image src={pet.photoUrl} alt={`Питомец ${pet.name}`} width={112} height={112} unoptimized />
              <span className="shared-pet-preview-info">
                <strong>{pet.name}</strong>
                <small><Dog aria-hidden="true" />{pet.breed}</small>
                <small><UserRound aria-hidden="true" />{pet.ownerName}</small>
              </span>
            </article>
            {error && <p className="form-error shared-pet-error" role="alert">{error}</p>}
            <div className="shared-pet-actions">
              <button className="primary-button" type="button" disabled={adding} onClick={acceptPet}>
                {adding ? "Добавляем…" : "Добавить"}
              </button>
              <button className="decline-share-button" type="button" disabled={adding} onClick={() => window.location.replace("/")}>
                Отказаться
              </button>
            </div>
          </div>
        ) : (
          <div className="share-page-status share-page-status--error">
            <h1>Ссылка недействительна</h1>
            <p>{error || "Владелец мог получить новую ссылку."}</p>
            <button className="primary-button" type="button" onClick={() => window.location.replace("/")}>На главную</button>
          </div>
        )}

        {adding && (
          <div className="saving-overlay" role="status" aria-live="polite">
            <span className="saving-spinner" aria-hidden="true" />
            <p>Добавляем питомца</p>
          </div>
        )}
      </section>
    </main>
  );
}
