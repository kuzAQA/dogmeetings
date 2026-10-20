import { useEffect, useState } from "react";
import { DogmeetHeader } from "../../../components/ui/DogmeetFrame";
import { DogmeetState } from "../../../components/ui/DogmeetState";
import { PetRow } from "../../../components/ui/PetRow";
import { requestJson } from "../../api/client";
import type { SharedPet } from "../../share/api";
import type { Location } from "../model";

export type DistrictPetSelection = { pet: SharedPet; location: Location };
type Complex = { location: Location; pets: SharedPet[] };

export function DistrictPets({ location, onBack, onOpen }: { location: Location; onBack: () => void; onOpen: (selection: DistrictPetSelection) => void }) {
  const [complexes, setComplexes] = useState<Complex[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void requestJson<{ complexes: Complex[] }>("/api/district-pets", { cache: "no-store", signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) setComplexes(data.complexes); })
      .catch((error: unknown) => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Не удалось загрузить питомцев района."); });
    return () => controller.abort();
  }, [location.city, location.district, attempt]);

  return <div className="screen district-pets-screen">
    <DogmeetHeader onBack={onBack} />
    <h1>Питомцы твоего района</h1>
    <p>{location.city}, {location.district}</p>
    {error ? <DogmeetState state="error" message={error} onAction={() => { setError(""); setComplexes(null); setAttempt((value) => value + 1); }} />
      : complexes === null ? <DogmeetState state="loading" />
      : complexes.length === 0 ? <DogmeetState state="empty" title="Пока нет ЖК" message="В вашем районе пока нет ЖК." />
      : complexes.map((group) => <details className="district-pets-complex" key={group.location.complex}>
        <summary>{group.location.complex}</summary>
        {group.pets.length === 0 ? <p role="status">В этом ЖК пока нет питомцев.</p>
          : <div className="pet-rows">{group.pets.map((pet) => <PetRow key={pet.id} pet={pet} onOpen={() => onOpen({ pet, location: group.location })} />)}</div>}
      </details>)}
  </div>;
}
