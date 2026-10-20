import { ChevronRight } from "lucide-react";
import Image from "next/image";

type PetRowData = { id: string; name: string; breed: string; ownerName: string; photoUrl: string };

export function PetRow({ pet, onOpen }: { pet: PetRowData; onOpen: () => void }) {
  return <button className="pet-row" type="button" onClick={onOpen}><Image className="pet-face" src={pet.photoUrl} alt={`Собака ${pet.name}`} width={72} height={72} unoptimized /><span><strong>{pet.name}</strong><small>{pet.breed} · {pet.ownerName}</small></span><ChevronRight aria-hidden="true" /></button>;
}
