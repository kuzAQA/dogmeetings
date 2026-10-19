export function isAnnouncementPreviewEnabled(host: string | null) {
  return process.env.ANNOUNCEMENT_PREVIEW === "1"
    && /^(localhost|127\.0\.0\.1|192\.168\.0\.137)(:\d+)?$/.test(host ?? "");
}
