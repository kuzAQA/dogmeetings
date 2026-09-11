type SavedLocation = {
  city: string;
  district: string;
  complex: string;
};

export function getSavedLocation(session: {
  hasLocation: boolean;
  location: SavedLocation | null;
}) {
  if (!session.hasLocation || !session.location?.city || !session.location.district || !session.location.complex) {
    return null;
  }
  return session.location;
}
