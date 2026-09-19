import { and, asc, eq } from "drizzle-orm";
import { withDb } from "../../../../db";
import { clientSessions, locations, places, walks } from "../../../../db/schema";
import { clearAdminLoginChallengeCookie, verifyAdminPasswordProof } from "../../../../lib/admin-auth";
import { authorizeAdminRequest } from "../../../../lib/admin-request";
import { databaseErrorMessage } from "../../../../lib/database-error";
import { privateJson } from "../../../../lib/session";
import { readJsonRecord } from "../../../../server/transport/request-json";

type LocationLevel = "city" | "district" | "complex";
type LocationTarget = { level: LocationLevel; city: string; district: string; complex: string };

function adminError(message: string, status: number, cookie?: string) {
  return privateJson({ error: message }, { status }, cookie);
}

function normalizeName(value: unknown, limit: number) {
  const name = String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");
  return name && name.length <= limit && /\p{L}/u.test(name) ? name : "";
}

function readTarget(payload: Record<string, unknown> | null): LocationTarget | null {
  const level = payload?.level;
  if (level !== "city" && level !== "district" && level !== "complex") return null;
  const city = normalizeName(payload?.city, 80);
  const district = normalizeName(payload?.district, 80);
  const complex = normalizeName(payload?.complex, 120);
  if (!city || (level !== "city" && !district) || (level === "complex" && !complex)) return null;
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

function isUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export async function GET(request: Request) {
  try {
    if (!await authorizeAdminRequest(request)) return adminError("Требуется вход.", 401);
    const rows = await withDb((db) => db
      .select({ city: locations.city, district: locations.district, complex: locations.residentialComplex })
      .from(locations)
      .orderBy(asc(locations.city), asc(locations.district), asc(locations.residentialComplex)));
    return privateJson({ locations: rows });
  } catch {
    return adminError("Не удалось загрузить локации.", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    if (!await authorizeAdminRequest(request, true)) return adminError("Требуется вход.", 401);
    const payload = await readJsonRecord(request);
    const target = readTarget(payload);
    const name = normalizeName(payload?.name, target?.level === "complex" ? 120 : 80);
    if (!target || !name) return adminError("Некорректное название локации.", 400);
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
    return adminError(isUniqueViolation(error) ? "Локация с таким названием уже существует." : databaseErrorMessage(error, "Не удалось сохранить локацию."), isUniqueViolation(error) ? 409 : 500);
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
    return adminError(databaseErrorMessage(error, "Не удалось удалить локацию."), 500, clearChallenge);
  }
}
