import { ChevronRight, MapPin } from "lucide-react";

export function MyPlacesMenuRow({ onClick }: { onClick?: () => void }) {
  const content = <><MapPin aria-hidden="true" /><span><strong>Мои места</strong><small>Места для прогулок, добавленные вами</small></span><ChevronRight aria-hidden="true" /></>;
  return onClick
    ? <button className="menu-row" type="button" onClick={onClick}>{content}</button>
    : <div className="menu-row announcement-share-example">{content}</div>;
}
