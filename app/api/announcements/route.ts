import { acknowledgeAnnouncement, listAnnouncements } from "../../../lib/announcements";
import { getClientSession, isSameOriginRequest, privateJson } from "../../../lib/session";
import { readJsonRecord } from "../../../server/transport/request-json";
import { isAnnouncementPreviewEnabled } from "../../../lib/announcement-preview";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const preview = url.searchParams.get("preview") === "1";
  if (preview && !isAnnouncementPreviewEnabled(url.host)) {
    return privateJson({ error: "Не найдено." }, { status: 404 });
  }
  try {
    const session = await getClientSession(request);
    if (!session) return privateJson({ error: "Сессия не найдена." }, { status: 401 });
    return privateJson(await listAnnouncements(session.clientId, preview, session.location, url.searchParams.get("information") === "1"));
  } catch {
    return privateJson({ error: "Не удалось загрузить нововведения." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return privateJson({ error: "Запрос отклонён." }, { status: 403 });
  try {
    const session = await getClientSession(request);
    if (!session) return privateJson({ error: "Сессия не найдена." }, { status: 401 });
    const payload = await readJsonRecord(request);
    if (typeof payload?.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,99}$/.test(payload.id)) {
      return privateJson({ error: "Некорректный баннер." }, { status: 400 });
    }
    if (!await acknowledgeAnnouncement(session.clientId, payload.id, session.location)) {
      return privateJson({ error: "Срок показа баннера завершён." }, { status: 410 });
    }
    return privateJson({ acknowledged: true });
  } catch {
    return privateJson({ error: "Не удалось сохранить подтверждение. Повторите попытку." }, { status: 500 });
  }
}
