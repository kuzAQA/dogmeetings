import { and, asc, eq } from "drizzle-orm";
import { withDb } from "../../../../db";
import { clientSessions, locations, places, walks } from "../../../../db/schema";
import { clearAdminLoginChallengeCookie, verifyAdminPasswordProof } from "../../../../lib/admin-auth";
import { authorizeAdminRequest } from "../../../../lib/admin-request";
import { databaseErrorMessage } from "../../../../lib/database-error";
import { privateJson } from "../../../../lib/session";
import { readJsonRecord } from "../../../../server/transport/request-json";
import { capitalizePlaceName, MAX_WALK_PLACE_LENGTH, normalizePlaceName } from "../../../../server/domain/walk";

type LocationTarget = { city: string; district: string; complex: string } & (
  { level: "city" | "district" | "complex" } | { level: "place"; id: string }
);

function adminError(message: string, status: number, cookie?: string) {
  return privateJson({ error: message }, { status }, cookie);
}

function normalizeName(value: unknown, limit: number) {
  const name = String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
  return name && name.length <= limit && /\p{L}/u.test(name) ? name : "";
}

function readTarget(payload: Record<string, unknown> | null): LocationTarget | null {
  const level = payload?.level;
  if (level !== "city" && level !== "district" && level !== "complex" && level !== "place") return null;
  const city = normalizeName(payload?.city, 80);
  const district = normalizeName(payload?.district, 80);
  const complex = normalizeName(payload?.complex, 120);
  if (!city || (level !== "city" && !district) || ((level === "complex" || level === "place") && !complex)) return null;
  if (level === "place") {
    const id = String(payload?.id ?? "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
    return { level, id, city, district, complex };
  }
  return { level, city, district, complex };
}

function locationWhere(target: LocationTarget) {
  if (target.level === "city") return eq(locations.city, target.city);
  if (target.level === "district") return and(eq(locations.city, target.city), eq(locations.district, target.district));
  return and(eq(locations.city, target.city), eq(locations.district, target.district), eq(locations.residentialComplex, target.complex));
}

function sessionWhere(target: LocationTarget) {
  if (target.level === "city") return eq(clientSessions.city, target.city);
  if (target.level === "district") return and(eq(clientSessions.city, target.city), eq(clientSessions.district, target.district));
  return and(eq(clientSessions.city, target.city), eq(clientSessions.district, target.district), eq(clientSessions.residentialComplex, target.complex));
}

function placeWhere(target: LocationTarget) {
  if (target.level === "place") return and(eq(places.id, target.id), eq(places.city, target.city), eq(places.district, target.district), eq(places.residentialComplex, target.complex));
  if (target.level === "city") return eq(places.city, target.city);
  if (target.level === "district") return and(eq(places.city, target.city), eq(places.district, target.district));
  return and(eq(places.city, target.city), eq(places.district, target.district), eq(places.residentialComplex, target.complex));
}

function walkWhere(target: LocationTarget) {
  if (target.level === "city") return eq(walks.city, target.city);
  if (target.level === "district") return and(eq(walks.city, target.city), eq(walks.district, target.district));
  return and(eq(walks.city, target.city), eq(walks.district, target.district), eq(walks.residentialComplex, target.complex));
}

function targetName(target: LocationTarget) {
  return target.level === "city" ? target.city : target.level === "district" ? target.district : target.complex;
}

function isDatabaseViolation(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  return ("code" in error && error.code === code) || ("cause" in error && isDatabaseViolation(error.cause, code));
}

export async function GET(request: Request) {
  try {
    if (!await authorizeAdminRequest(request)) return adminError("Требуется вход.", 401);
    const data = await withDb(async (db) => {
      const rows = await db
        .select({ city: locations.city, district: locations.district, complex: locations.residentialComplex })
        .from(locations)
        .orderBy(asc(locations.city), asc(locations.district), asc(locations.residentialComplex));
      const placeRows = await db
        .select({ id: places.id, name: places.name, city: places.city, district: places.district, complex: places.residentialComplex })
        .from(places)
        .orderBy(asc(places.name));
      return { locations: rows, places: placeRows };
    });
    return privateJson(data);
  } catch {
    return adminError("Не удалось загрузить локации.", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    if (!await authorizeAdminRequest(request, true)) return adminError("Требуется вход.", 401);
    const payload = await readJsonRecord(request);
    const target = readTarget(payload);
    const name = target?.level === "place"
      ? normalizeName(capitalizePlaceName(String(payload?.name ?? "")), MAX_WALK_PLACE_LENGTH)
      : normalizeName(payload?.name, target?.level === "complex" ? 120 : 80);
    if (!target || !name) return adminError(target?.level === "place" ? `Укажите название места до ${MAX_WALK_PLACE_LENGTH} символов.` : "Некорректное название локации.", 400);
    if (target.level === "place") {
      const updated = await withDb((db) => db.transaction(async (tx) => {
        const [place] = await tx.update(places)
          .set({ name, normalizedName: normalizePlaceName(name) })
          .where(placeWhere(target))
          .returning({ id: places.id });
        if (!place) return false;
        await tx.update(walks).set({ place: name, updatedAt: new Date() }).where(eq(walks.placeId, place.id));
        return true;
      }));
      if (!updated) return adminError("Место не найдено.", 404);
      return privateJson({ updated: true });
    }
    if (name === targetName(target)) return privateJson({ updated: true });

    const updated = await withDb((db) => db.transaction(async (tx) => {
      const [existing] = await tx.select({ city: locations.city }).from(locations).where(locationWhere(target)).limit(1);
      if (!existing) return "missing";

      const collision = target.level === "city"
        ? eq(locations.city, name)
        : target.level === "district"
          ? and(eq(locations.city, target.city), eq(locations.district, name))
          : and(eq(locations.city, target.city), eq(locations.district, target.district), eq(locations.residentialComplex, name));
      const [duplicate] = await tx.select({ city: locations.city }).from(locations).where(collision).limit(1);
      if (duplicate) return "duplicate";

      const values = target.level === "city" ? { city: name } : target.level === "district" ? { district: name } : { residentialComplex: name };
      await tx.update(clientSessions).set(values).where(sessionWhere(target));
      await tx.update(walks).set(values).where(walkWhere(target));
      await tx.update(places).set(values).where(placeWhere(target));
      await tx.update(locations).set(values).where(locationWhere(target));
      return "updated";
    }));

    if (updated === "missing") return adminError("Локация не найдена.", 404);
    if (updated === "duplicate") return adminError("Локация с таким названием уже существует.", 409);
    return privateJson({ updated: true });
  } catch (error) {
    return adminError(isDatabaseViolation(error, "23505") ? "Название уже используется в этой локации." : databaseErrorMessage(error, "Не удалось сохранить локацию."), isDatabaseViolation(error, "23505") ? 409 : 500);
  }
}

export async function DELETE(request: Request) {
  const clearChallenge = clearAdminLoginChallengeCookie(request);
  try {
    if (!await authorizeAdminRequest(request, true)) return adminError("Требуется вход.", 401, clearChallenge);
    const payload = await readJsonRecord(request);
    const target = readTarget(payload);
    const proof = String(payload?.proof ?? "");
    if (!target || !/^[A-Za-z0-9_-]{43}$/.test(proof)) return adminError("Некорректные данные удаления.", 400, clearChallenge);
    if (!await verifyAdminPasswordProof(request, proof)) return adminError("Пароль не подтверждён.", 403, clearChallenge);

    if (target.level === "place") {
      const deleted = await withDb((db) => db.delete(places).where(placeWhere(target)).returning({ id: places.id }));
      if (!deleted.length) return adminError("Место не найдено.", 404, clearChallenge);
      return privateJson({ deleted: true }, {}, clearChallenge);
    }

    const deleted = await withDb((db) => db.transaction(async (tx) => {
      const [existing] = await tx.select({ city: locations.city }).from(locations).where(locationWhere(target)).limit(1);
      if (!existing) return false;
      await tx.delete(walks).where(walkWhere(target));
      await tx.delete(places).where(placeWhere(target));
      await tx.update(clientSessions).set({ city: null, district: null, residentialComplex: null, hasLocation: false, updatedAt: new Date() }).where(sessionWhere(target));
      await tx.delete(locations).where(locationWhere(target));
      return true;
    }));

    if (!deleted) return adminError("Локация не найдена.", 404, clearChallenge);
    return privateJson({ deleted: true }, {}, clearChallenge);
  } catch (error) {
    if (isDatabaseViolation(error, "23503")) return adminError("Нельзя удалить место: оно используется в прогулках.", 409, clearChallenge);
    return adminError(databaseErrorMessage(error, "Не удалось удалить локацию."), 500, clearChallenge);
  }
}
