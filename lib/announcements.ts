import { eq, sql } from "drizzle-orm";
import { withDb, type Database } from "../db";
import { announcementCampaigns, locations } from "../db/schema";
import type { AdminAnnouncement, AnnouncementLocation, AnnouncementsResponse } from "./announcement-types";
import { allowsAnnouncement } from "./announcement-settings";

export async function syncAnnouncementLocations(db: Pick<Database, "select" | "update">, target: AnnouncementLocation & { level: "city" | "district" | "complex" }, name?: string) {
  // Read the catalog after the lock so concurrent renames use the latest committed names.
  const campaigns = await db.select().from(announcementCampaigns).for("update");
  const catalog = await db.select().from(locations);
  for (const campaign of campaigns) {
    const previous = campaign.exclusions;
    const matches = (item: { city: string; district?: string; complex?: string }) => item.city === target.city
      && (target.level === "city" || item.district === target.district)
      && (target.level !== "complex" || item.complex === target.complex);
    const rename = <T extends { city: string; district?: string; complex?: string }>(item: T): T => name && matches(item)
      ? { ...item, [target.level === "city" ? "city" : target.level === "district" ? "district" : "complex"]: name } : item;
    const exclusions = {
      cities: previous.cities.map((city) => target.level === "city" && city === target.city && name ? name : city)
        .filter((city) => catalog.some((row) => row.city === city)),
      districts: previous.districts.map(rename)
        .filter((item) => catalog.some((row) => row.city === item.city && row.district === item.district)),
      complexes: previous.complexes.map(rename)
        .filter((item) => catalog.some((row) => row.city === item.city && row.district === item.district && row.residentialComplex === item.complex))
    };
    if (JSON.stringify(exclusions) !== JSON.stringify(previous)) {
      await db.update(announcementCampaigns).set({ exclusions }).where(eq(announcementCampaigns.id, campaign.id));
    }
  }
}

export function listAnnouncements(clientId: string, includeAcknowledged = false, location: AnnouncementLocation | null = null, information = false) {
  return withDb((db) => db.transaction(async (tx) => {
    const result = await tx.execute(sql`
      SELECT CURRENT_TIMESTAMP AS "serverTime", COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', c.id, 'startsAt', c.starts_at, 'endsAt', c.ends_at, 'pages', c.pages, 'exclusions', c.exclusions, 'permanent', c.permanent
        ) ORDER BY c.starts_at, c.id)
        FROM announcement_campaigns c
        WHERE (c.starts_at IS NULL OR c.starts_at <= CURRENT_TIMESTAMP)
          AND (CASE WHEN ${information} THEN c.permanent ELSE c.ends_at IS NULL OR c.ends_at > CURRENT_TIMESTAMP END)
          AND (${information} OR ${includeAcknowledged} OR NOT EXISTS (
            SELECT 1 FROM announcement_receipts r WHERE r.banner_id = c.id AND r.client_id = ${clientId}::uuid
          ))
      ), '[]'::jsonb) AS banners
    `);
    const row = result.rows[0];
    const banners = (row.banners as AdminAnnouncement[])
      .filter((banner) => allowsAnnouncement(banner.exclusions, location))
      .map(({ id, startsAt, endsAt, pages, permanent }) => ({ id, startsAt, endsAt, pages, permanent }));
    return { serverTime: row.serverTime, banners } as AnnouncementsResponse;
  }));
}

export function acknowledgeAnnouncement(clientId: string, id: string, location: AnnouncementLocation | null = null) {
  return withDb((db) => db.transaction(async (tx) => {
    const campaign = await tx.execute(sql`SELECT exclusions FROM announcement_campaigns
      WHERE id = ${id} AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
        AND (ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP) FOR SHARE`);
    if (!campaign.rows[0] || !allowsAnnouncement(campaign.rows[0].exclusions as AdminAnnouncement["exclusions"], location)) return false;
    const result = await tx.execute(sql`
      INSERT INTO announcement_receipts (client_id, banner_id)
      SELECT ${clientId}::uuid, id FROM announcement_campaigns
      WHERE id = ${id} AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
        AND (ends_at IS NULL OR ends_at > CURRENT_TIMESTAMP)
      ON CONFLICT (client_id, banner_id) DO UPDATE SET banner_id = EXCLUDED.banner_id
      RETURNING banner_id
    `);
    return result.rowCount === 1;
  }));
}
