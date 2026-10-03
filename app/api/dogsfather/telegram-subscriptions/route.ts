import { count, eq } from "drizzle-orm";
import { withDb } from "../../../../db";
import { telegramComplexSubscriptions } from "../../../../db/schema";
import { authorizeAdminRequest } from "../../../../lib/admin-request";
import { privateJson } from "../../../../lib/session";

export async function GET(request: Request) {
  try {
    if (!await authorizeAdminRequest(request)) {
      return privateJson({ error: "Требуется вход." }, { status: 401 });
    }

    const [summary] = await withDb((db) => db
      .select({ activeSubscriptions: count() })
      .from(telegramComplexSubscriptions)
      .where(eq(telegramComplexSubscriptions.active, true)));

    return privateJson({ activeSubscriptions: summary.activeSubscriptions });
  } catch {
    return privateJson({ error: "Не удалось загрузить подписки Telegram." }, { status: 500 });
  }
}
