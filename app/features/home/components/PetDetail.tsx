import { MapPin } from "lucide-react";
import Image from "next/image";
import { DogmeetHeader } from "../../../components/ui/DogmeetFrame";
import type { Location, Pet } from "../model";

export function PetDetail({ pet, location, onBack }: { pet: Pet; location: Location; onBack: () => void }) {
  const complex = location.complex.trim();
  const area = [location.city, location.district].map((value) => value.trim()).filter(Boolean).join(", ");

  return (
    <div className="screen walk-detail-screen">
      <DogmeetHeader onBack={onBack} />
      <h1>Паспорт питомца</h1>
      <Image className="portrait" data-pet-photo={pet.id} src={pet.photoUrl} alt={pet.name} width={390} height={300} unoptimized={pet.photoUrl.startsWith("/api/")} />
      <div className="pet-title"><h2 tabIndex={-1}>{pet.name}</h2><span>{pet.breed}</span></div>
      <p>Хозяин: {pet.ownerName}</p>
      {(complex || area) && <div className="place-detail"><MapPin aria-hidden="true" /><div>{complex && <h3>{complex}</h3>}{area && <p>{area}</p>}</div></div>}
      {pet.description?.trim() && <section className="pet-about"><h3>О нас</h3><p>{pet.description}</p></section>}
    </div>
  );
}
