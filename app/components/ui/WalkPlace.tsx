const MAX_WALK_PLACE_LENGTH = 40;

type WalkPlaceProps = {
  place: string;
};

export function WalkPlace({ place }: WalkPlaceProps) {
  const displayedPlace = Array.from(place).slice(0, MAX_WALK_PLACE_LENGTH).join("").trimEnd();

  return (
    <div className="walk-place-row walk-location-block">
      <span className="walk-card-icon walk-card-icon--pin" aria-hidden="true" />
      <button className="walk-place-trigger" type="button" aria-label={place} disabled>
        <span className="walk-place-text">{displayedPlace}</span>
      </button>
    </div>
  );
}
