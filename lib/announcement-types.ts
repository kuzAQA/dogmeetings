export const telegramReconnectCampaignId = "telegram-reconnect-2026-10-21";

export type AnnouncementPage = {
  title: string;
  text: string;
  example?: "pet-contact" | "telegram-dock" | "site-share" | "pet-share" | "places-help" | "walk-periods";
};

export type Announcement = {
  id: string;
  startsAt: string | null;
  endsAt: string | null;
  permanent: boolean;
  pages: AnnouncementPage[];
};

export type AnnouncementsResponse = {
  serverTime: string;
  banners: Announcement[];
};

// Geography uses the same compound names as locations and client sessions.
export type AnnouncementLocation = { city: string; district: string; complex: string };
export type AnnouncementExclusions = {
  cities: string[];
  districts: { city: string; district: string }[];
  complexes: AnnouncementLocation[];
};
export type AnnouncementStatus = "active" | "paused" | "disabled" | "information";
export type AdminAnnouncement = Announcement & { exclusions: AnnouncementExclusions; status: AnnouncementStatus };
export type AdminAnnouncementsResponse = {
  serverTime: string;
  banners: AdminAnnouncement[];
  locations: AnnouncementLocation[];
};

export type AnnouncementSchedule = { permanent: boolean; startsAt: string | null; endsAt: string | null };
