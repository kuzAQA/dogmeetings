import { eq } from "drizzle-orm";
import { withDb } from "../../../../db";
import { adminLoginAttempts } from "../../../../db/schema";
import {
  adminRateLimitKey,
  clearAdminLoginChallengeCookie,
  clearAdminSessionCookie,
  createAdminSessionCookie,
  hasValidAdminSession,
  verifyAdminLoginProof
} from "../../../../lib/admin-auth";
import { isSameOriginRequest, privateJson } from "../../../../lib/session";

const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

export async function GET(request: Request) {
  try {
    return privateJson({ authenticated: await hasValidAdminSession(request) });
  } catch {
    return privateJson({ authenticated: false }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return privateJson({ error: "Запрос отклонён." }, { status: 403 });
  }

  try {
    const payload = await request.json().catch(() => null) as { accountHash?: unknown; proof?: unknown } | null;
    const accountHash = String(payload?.accountHash ?? "");
    const proof = String(payload?.proof ?? "");
    const clearChallengeCookie = clearAdminLoginChallengeCookie(request);
    if (!/^[A-Za-z0-9_-]{43}$/.test(accountHash) || !/^[A-Za-z0-9_-]{43}$/.test(proof)) {
      return privateJson({ error: "Неверный логин или пароль." }, { status: 401 }, clearChallengeCookie);
    }

    const key = await adminRateLimitKey(request);
    const [attempt] = await withDb((db) => db
      .select()
      .from(adminLoginAttempts)
      .where(eq(adminLoginAttempts.key, key))
      .limit(1));
    const now = new Date();
    const isLocked = Boolean(attempt?.lockedUntil && attempt.lockedUntil > now);
    const credentialsAreValid = await verifyAdminLoginProof(request, accountHash, proof);

    if (isLocked) {
      return privateJson(
        { error: "Слишком много попыток. Повторите вход позже." },
        { status: 429, headers: { "Retry-After": String(LOCK_MINUTES * 60) } },
        clearChallengeCookie
      );
    }

    if (!credentialsAreValid) {
      const lockHasExpired = Boolean(attempt?.lockedUntil && attempt.lockedUntil <= now);
      const nextFailureCount = (lockHasExpired ? 0 : attempt?.failureCount ?? 0) + 1;
      const lockedUntil = nextFailureCount >= MAX_FAILURES
        ? new Date(now.getTime() + LOCK_MINUTES * 60 * 1000)
        : null;
      await withDb((db) => db
        .insert(adminLoginAttempts)
        .values({ key, failureCount: nextFailureCount, lockedUntil, updatedAt: now })
        .onConflictDoUpdate({
          target: adminLoginAttempts.key,
          set: { failureCount: nextFailureCount, lockedUntil, updatedAt: now }
        }));
      return privateJson({ error: "Неверный логин или пароль." }, { status: 401 }, clearChallengeCookie);
    }

    if (attempt) {
      await withDb((db) => db.delete(adminLoginAttempts).where(eq(adminLoginAttempts.key, key)));
    }
    return privateJson(
      { authenticated: true },
      {},
      [await createAdminSessionCookie(request), clearChallengeCookie]
    );
  } catch (error) {
    const isConfigurationError = error instanceof Error && error.message.startsWith("ADMIN_CONFIGURATION");
    return privateJson(
      { error: isConfigurationError ? "Вход администратора не настроен." : "Не удалось выполнить вход." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) {
    return privateJson({ error: "Запрос отклонён." }, { status: 403 });
  }
  return privateJson({ authenticated: false }, {}, clearAdminSessionCookie(request));
}
