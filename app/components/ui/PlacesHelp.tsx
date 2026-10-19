export function PlacesHelp({ onOpen }: { onOpen?: () => void }) {
  return <p className="small-note places-help">Вы можете управлять местами для прогулок {onOpen
    ? <a href="#my-places" onClick={event => { event.preventDefault(); onOpen(); }}>здесь</a>
    : <span className="places-help-link">здесь</span>}</p>;
}
