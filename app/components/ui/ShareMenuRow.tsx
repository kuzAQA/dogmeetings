import { ChevronRight, Share2 } from "lucide-react";

export function ShareMenuRow({ kind, onClick }: { kind: "pet" | "site"; onClick?: () => void }) {
  const content = <><Share2 aria-hidden="true" /><span><strong>{kind === "pet" ? "Поделиться питомцем" : "Поделиться сайтом"}</strong><small>{kind === "pet" ? "Для совместных прогулок" : "QR-код для ваших друзей"}</small></span><ChevronRight aria-hidden="true" /></>;
  return onClick
    ? <button className="menu-row" type="button" onClick={onClick}>{content}</button>
    : <div className="menu-row announcement-share-example">{content}</div>;
}
