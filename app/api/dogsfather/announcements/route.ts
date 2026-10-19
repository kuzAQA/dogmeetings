import { and, asc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { withDb } from "../../../../db";
import { announcementCampaigns, announcementReceipts, locations } from "../../../../db/schema";
import { authorizeAdminRequest } from "../../../../lib/admin-request";
import { ANNOUNCEMENT_MAX_END, parseAnnouncementExclusions, parseAnnouncementSchedule, validExtensionDays } from "../../../../lib/announcement-settings";
import { privateJson } from "../../../../lib/session";
import { readJsonRecord } from "../../../../server/transport/request-json";

export async function GET(request: Request) {
  try {
    if (!await authorizeAdminRequest(request)) return privateJson({ error: "Требуется вход." }, { status: 401 });
    return privateJson(await withDb((db) => db.transaction(async (tx) => {
      const banners = await tx.select().from(announcementCampaigns)
        .orderBy(asc(announcementCampaigns.startsAt), asc(announcementCampaigns.id));
      const catalog = await tx.select({ city: locations.city, district: locations.district, complex: locations.residentialComplex })
        .from(locations).orderBy(asc(locations.city), asc(locations.district), asc(locations.residentialComplex));
      const clock = await tx.execute(sql`SELECT CURRENT_TIMESTAMP AS "serverTime"`);
      return { banners, locations: catalog, serverTime: clock.rows[0].serverTime };
    })));
  } catch {
    return privateJson({ error: "Не удалось загрузить баннеры. Повторите попытку." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    if (!await authorizeAdminRequest(request, true)) return privateJson({ error: "Требуется вход." }, { status: 401 });
    const payload = await readJsonRecord(request);
    if (typeof payload?.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(payload.id)) {
      return privateJson({ error: "Некорректный баннер." }, { status: 400 });
    }
    const id = payload.id;
    if (["pause", "resume", "disable", "information", "delete"].includes(payload.action as string)) {
      return await withDb((db) => db.transaction(async (tx) => {
        const [current] = await tx.select().from(announcementCampaigns).where(eq(announcementCampaigns.id, id)).for("update");
        if (!current) return privateJson({ error: "Баннер не найден." }, { status: 404 });
        if (payload.action === "delete") {
          await tx.delete(announcementReceipts).where(eq(announcementReceipts.bannerId, id));
          await tx.delete(announcementCampaigns).where(eq(announcementCampaigns.id, id));
          return privateJson({ deleted: true });
        }
        if (payload.action === "resume") {
          if (current.status !== "paused") return privateJson({ error: "Возобновить можно только приостановленный баннер." }, { status: 409 });
          const clock = await tx.execute(sql`SELECT clock_timestamp() AS now`);
          if (current.endsAt && current.endsAt <= new Date(clock.rows[0].now as string)) {
            return privateJson({ error: "Срок показа завершён. Сначала исправьте окончание." }, { status: 409 });
          }
        }
        const status = payload.action === "pause" ? "paused" : payload.action === "resume" ? "active" : payload.action === "disable" ? "disabled" : "information";
        const [banner] = await tx.update(announcementCampaigns).set({ status, ...(payload.action === "information" ? { permanent: true } : {}) }).where(eq(announcementCampaigns.id, id)).returning();
        return privateJson({ banner });
      }));
    }
    if (payload.action === "schedule" || payload.action === "start-now") {
      const schedule = payload.action === "schedule" ? parseAnnouncementSchedule(payload) : null;
      if (payload.action === "schedule" && !schedule) return privateJson({ error: "Проверьте постоянность, даты и интервал показа." }, { status: 400 });
      return await withDb((db) => db.transaction(async (tx) => {
        const [current] = await tx.select().from(announcementCampaigns).where(eq(announcementCampaigns.id, id)).for("update");
        if (!current) return privateJson({ error: "Баннер не найден." }, { status: 404 });
        const clock = await tx.execute(sql`SELECT clock_timestamp() AS now`);
        const now = new Date(clock.rows[0].now as string);
        if (payload.action === "start-now" && current.endsAt && current.endsAt <= now) {
          return privateJson({ error: "Срок показа завершён. Сначала исправьте окончание." }, { status: 409 });
        }
        const [banner] = await tx.update(announcementCampaigns).set(schedule ? {
          permanent: schedule.permanent, startsAt: schedule.startsAt ? new Date(schedule.startsAt) : null,
          endsAt: schedule.endsAt ? new Date(schedule.endsAt) : null
        } : { startsAt: now, status: "active" }).where(eq(announcementCampaigns.id, id)).returning();
        return privateJson({ banner });
      }));
    }
    if (payload.action === "extend") {
      if (!validExtensionDays(payload.days)) return privateJson({ error: "Укажите положительное целое число дней в допустимом диапазоне." }, { status: 400 });
      const days = payload.days;
      // Increment in SQL: concurrent extensions add up rather than overwrite each other.
      const [banner] = await withDb((db) => db.update(announcementCampaigns)
        .set({ endsAt: sql`${announcementCampaigns.endsAt} + ${days}::integer * interval '24 hours'` })
        .where(and(eq(announcementCampaigns.id, id),
          sql`${announcementCampaigns.endsAt} <= ${ANNOUNCEMENT_MAX_END}::timestamptz - ${days}::integer * interval '24 hours'`))
        .returning());
      if (!banner) return privateJson({ error: "У баннера нет окончания или новая дата выходит за допустимый диапазон. Обновите список." }, { status: 409 });
      return privateJson({ banner });
    }
    if (payload.action !== "exclusions") return privateJson({ error: "Некорректное действие." }, { status: 400 });
    const exclusions = parseAnnouncementExclusions(payload.exclusions);
    if (!exclusions) return privateJson({ error: "Некорректные исключения аудитории." }, { status: 400 });
    return await withDb((db) => db.transaction(async (tx) => {
      const catalog = await tx.select().from(locations).for("share");
      const valid = exclusions.cities.every((city) => catalog.some((row) => row.city === city))
        && exclusions.districts.every((item) => catalog.some((row) => row.city === item.city && row.district === item.district))
        && exclusions.complexes.every((item) => catalog.some((row) => row.city === item.city && row.district === item.district && row.residentialComplex === item.complex));
      if (!valid) return privateJson({ error: "Город, район или ЖК не найден либо не принадлежит выбранной локации. Обновите список." }, { status: 400 });
      const [banner] = await tx.update(announcementCampaigns).set({ exclusions })
        .where(eq(announcementCampaigns.id, id)).returning();
      if (!banner) return privateJson({ error: "Баннер не найден. Обновите список." }, { status: 409 });
      return privateJson({ banner });
    }));
  } catch {
    return privateJson({ error: "Не удалось сохранить баннер. Повторите попытку." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!await authorizeAdminRequest(request, true)) return privateJson({ error: "Требуется вход." }, { status: 401 });
    const payload = await readJsonRecord(request);
    const schedule = payload && parseAnnouncementSchedule({ ...payload, permanent: payload.permanent === undefined ? false : payload.permanent });
    if (!payload || !schedule || typeof payload.title !== "string" || !payload.title.trim() || payload.title.length > 200
      || typeof payload.text !== "string" || !payload.text.trim() || payload.text.length > 10000) {
      return privateJson({ error: "Проверьте заголовок, текст и даты показа." }, { status: 400 });
    }
    const pages = [{ title: payload.title.trim(), text: payload.text.trim() }];
    return await withDb((db) => db.transaction(async (tx) => {
      const clock = await tx.execute(sql`SELECT clock_timestamp() AS now`);
      if (schedule.endsAt && Date.parse(schedule.endsAt) <= +new Date(clock.rows[0].now as string)) {
        return privateJson({ error: "Окончание должно быть в будущем." }, { status: 400 });
      }
      const [banner] = await tx.insert(announcementCampaigns).values({
        id: randomUUID(), permanent: schedule.permanent,
        startsAt: schedule.startsAt ? new Date(schedule.startsAt) : null,
        endsAt: schedule.endsAt ? new Date(schedule.endsAt) : null,
        pages
      }).returning();
      return privateJson({ banner }, { status: 201 });
    }));
  } catch {
    return privateJson({ error: "Не удалось создать баннер. Повторите попытку." }, { status: 500 });
  }
}
