import { and, asc, desc, eq, gt, inArray, lt, ne, or, sql } from "drizzle-orm";
import { type Database, withDb } from "../../db";
import { clientSessions, dialogMessages, dialogs, pets, walks } from "../../db/schema";
import type { ChatDialog, ChatHistory, ChatMessage, DialogSummary } from "../domain/chat";
import { petPhotoUrl } from "../domain/pet";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DialogRow = typeof dialogs.$inferSelect;
type MessageRow = typeof dialogMessages.$inferSelect;
const peerName = sql<string>`${pets.name} || ' • ' || ${pets.ownerName}`;

export class ChatError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function participant(clientId: string) {
  return or(eq(dialogs.clientLow, clientId), eq(dialogs.clientHigh, clientId));
}

function hiddenThrough(row: DialogRow, clientId: string) {
  return row.clientLow === clientId ? row.lowHiddenThrough : row.highHiddenThrough;
}

async function serverNow(tx: Pick<Database, "execute">) {
  return new Date((await tx.execute<{ now: string }>(sql`SELECT clock_timestamp() AS now`)).rows[0].now);
}

async function checkDeadline(tx: Transaction, row: DialogRow) {
  const now = await serverNow(tx);
  if (row.expiresAt && row.expiresAt <= now) throw new ChatError(410, "Срок хранения диалога истёк.");
  return now;
}

async function lockedDialog(tx: Transaction, id: string, clientId: string) {
  const [row] = await tx.select().from(dialogs).where(and(eq(dialogs.id, id), participant(clientId))).for("update");
  if (!row) throw new ChatError(404, "Диалог не найден или уже удалён.");
  const now = await checkDeadline(tx, row);
  return { row, now };
}

async function dialogView(tx: Transaction, row: DialogRow, clientId: string): Promise<ChatDialog> {
  const peerId = row.clientLow === clientId ? row.clientHigh : row.clientLow;
  const peerPetId = row.clientLow === clientId ? row.highPetId : row.lowPetId;
  const [pet] = await tx.select({ name: peerName, id: pets.id, updatedAt: pets.updatedAt, photoType: pets.photoType }).from(pets).where(eq(pets.clientId, peerId))
    .orderBy(desc(sql`${pets.id} = ${peerPetId ?? null}::uuid`), asc(pets.createdAt), asc(pets.id)).limit(1);
  return { id: row.id, peer: { clientId: peerId, name: pet?.name || "Собеседник",
    photoUrl: pet ? petPhotoUrl(pet.id, pet.updatedAt, pet.photoType) : "/dog-placeholder.webp" },
    expiresAt: row.expiresAt?.toISOString() ?? null, hiddenThrough: hiddenThrough(row, clientId) };
}

function messageView(row: MessageRow, clientId: string): ChatMessage {
  return { seq: row.seq, requestId: row.requestId, text: row.text, mine: row.senderClientId === clientId,
    createdAt: row.createdAt.toISOString(), readAt: row.readAt?.toISOString() ?? null };
}

export async function openDialog(clientId: string, target: { walkId?: string; peerClientId?: string; petId?: string }) {
  return withDb(db => db.transaction(async tx => {
    if (target.petId !== undefined) {
      const [ownedPet] = await tx.select({ id: pets.id }).from(pets)
        .where(and(eq(pets.id, target.petId), eq(pets.clientId, clientId))).limit(1).for("share");
      if (!ownedPet) throw new ChatError(404, "Питомец больше недоступен. Выберите другого питомца.");
    }
    let peerId = target.peerClientId;
    if (target.walkId) {
      const [owner] = await tx.select({ clientId: pets.clientId }).from(walks)
        .innerJoin(pets, eq(walks.petId, pets.id)).where(eq(walks.id, target.walkId)).limit(1);
      if (!owner) throw new ChatError(404, "Прогулка не найдена.");
      peerId = owner.clientId;
    }
    if (!peerId || peerId === clientId) throw new ChatError(400, "Нельзя написать самому себе.");
    const [recipient] = await tx.select({ clientId: clientSessions.clientId }).from(clientSessions)
      .where(and(eq(clientSessions.clientId, peerId), gt(clientSessions.expiresAt, sql`clock_timestamp()`))).limit(1);
    if (!recipient) throw new ChatError(409, "Собеседник ещё не активировал безопасную сессию.");
    const [low, high] = [clientId, peerId].sort();
    // Serialize creation even when the expired row has already been physically deleted.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${low + ":" + high}, 0))`);
    await tx.delete(dialogs).where(and(eq(dialogs.clientLow, low), eq(dialogs.clientHigh, high),
      sql`${dialogs.expiresAt} <= clock_timestamp()`));
    await tx.insert(dialogs).values({ clientLow: low, clientHigh: high }).onConflictDoNothing();
    let [row] = await tx.select().from(dialogs).where(and(eq(dialogs.clientLow, low), eq(dialogs.clientHigh, high))).for("update");
    if (target.petId !== undefined) {
      [row] = await tx.update(dialogs).set(row.clientLow === clientId
        ? { lowPetId: target.petId } : { highPetId: target.petId }).where(eq(dialogs.id, row.id)).returning();
    }
    return { dialog: await dialogView(tx, row, clientId), serverTime: (await serverNow(tx)).toISOString() };
  }));
}

export async function listDialogs(clientId: string, cursor?: { at: string; id: string }) {
  return withDb(async db => {
    const result = await db.execute<{
      id: string; peer_id: string; peer_name: string; expires_at: string; hidden: string;
      pet_id: string | null; pet_updated_at: string | null; pet_photo_type: string | null;
      seq: string; request_id: string; text: string; created_at: string; read_at: string | null; sender_client_id: string;
    }>(sql`
      SELECT d.id, d.expires_at,
        CASE WHEN d.client_low = ${clientId} THEN d.client_high ELSE d.client_low END AS peer_id,
        COALESCE(peer.name, 'Собеседник') AS peer_name,
        peer.id AS pet_id, peer.updated_at AS pet_updated_at, peer.photo_type AS pet_photo_type,
        CASE WHEN d.client_low = ${clientId} THEN d.low_hidden_through ELSE d.high_hidden_through END AS hidden,
        m.seq, m.request_id, m.text, m.created_at, m.read_at, m.sender_client_id
      FROM dialogs d
      LEFT JOIN LATERAL (SELECT ${peerName} AS name, ${pets.id} AS id,
        ${pets.updatedAt} AS updated_at, ${pets.photoType} AS photo_type FROM ${pets} WHERE ${pets.clientId} =
          CASE WHEN d.client_low = ${clientId} THEN d.client_high ELSE d.client_low END
          ORDER BY (${pets.id} = CASE WHEN d.client_low = ${clientId} THEN d.high_pet_id ELSE d.low_pet_id END) DESC,
            ${pets.createdAt}, ${pets.id} LIMIT 1) peer ON true
      JOIN LATERAL (SELECT * FROM dialog_messages m WHERE m.dialog_id = d.id AND m.seq >
        CASE WHEN d.client_low = ${clientId} THEN d.low_hidden_through ELSE d.high_hidden_through END
        ORDER BY m.seq DESC LIMIT 1) m ON true
      WHERE (d.client_low = ${clientId} OR d.client_high = ${clientId}) AND d.expires_at > clock_timestamp()
        ${cursor ? sql`AND (m.created_at, d.id) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)` : sql``}
      ORDER BY m.created_at DESC, d.id DESC LIMIT 51`);
    const now = await serverNow(db);
    const rows: DialogSummary[] = result.rows.filter(row => new Date(row.expires_at) > now).slice(0, 50).map(row => ({
      id: row.id, peer: { clientId: row.peer_id, name: row.peer_name,
        photoUrl: row.pet_id && row.pet_updated_at ? petPhotoUrl(row.pet_id, new Date(row.pet_updated_at), row.pet_photo_type) : "/dog-placeholder.webp" },
      expiresAt: new Date(row.expires_at).toISOString(),
      hiddenThrough: Number(row.hidden), lastMessage: { seq: Number(row.seq), requestId: row.request_id,
        text: row.text, createdAt: new Date(row.created_at).toISOString(), readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
        mine: row.sender_client_id === clientId }
    }));
    const last = rows.at(-1);
    return { dialogs: rows, nextCursor: result.rows.length > 50 && last ? `${last.lastMessage.createdAt}|${last.id}` : null };
  });
}

export async function dialogHistory(clientId: string, id: string,
  query: { before?: number; after?: number; pending: number[] }): Promise<ChatHistory> {
  return withDb(db => db.transaction(async tx => {
    const { row } = await lockedDialog(tx, id, clientId);
    const hidden = hiddenThrough(row, clientId);
    const rows = await tx.select().from(dialogMessages).where(and(eq(dialogMessages.dialogId, id),
      gt(dialogMessages.seq, Math.max(hidden, query.after ?? 0)),
      query.before !== undefined ? lt(dialogMessages.seq, query.before) : undefined))
      .orderBy(query.after !== undefined ? asc(dialogMessages.seq) : desc(dialogMessages.seq)).limit(51);
    const page = rows.slice(0, 50);
    if (query.after === undefined) page.reverse();
    const receipts = query.pending.length ? await tx.select({ seq: dialogMessages.seq, readAt: dialogMessages.readAt })
      .from(dialogMessages).where(and(eq(dialogMessages.dialogId, id), eq(dialogMessages.senderClientId, clientId),
        gt(dialogMessages.seq, hidden), inArray(dialogMessages.seq, query.pending))) : [];
    const dialog = await dialogView(tx, row, clientId);
    const now = await checkDeadline(tx, row);
    return { dialog, messages: page.map(m => messageView(m, clientId)),
      receipts: receipts.map(m => ({ seq: m.seq, readAt: m.readAt?.toISOString() ?? null })),
      hasOlder: query.after === undefined && rows.length > 50,
      hasMore: query.after !== undefined && rows.length > 50, serverTime: now.toISOString() };
  }));
}

export async function sendMessage(clientId: string, id: string, requestId: string, text: string) {
  return withDb(db => db.transaction(async tx => {
    const { row, now } = await lockedDialog(tx, id, clientId);
    const [existing] = await tx.select().from(dialogMessages).where(and(eq(dialogMessages.dialogId, id),
      eq(dialogMessages.senderClientId, clientId), eq(dialogMessages.requestId, requestId)));
    if (existing) {
      if (existing.text !== text) throw new ChatError(409, "Эта попытка отправки уже содержит другой текст.");
      // A retry after local deletion must not expose the hidden message again.
      if (existing.seq <= hiddenThrough(row, clientId)) throw new ChatError(409, "Сообщение уже было удалено у вас.");
      const dialog = await dialogView(tx, row, clientId);
      return { message: messageView(existing, clientId), dialog,
        serverTime: (await checkDeadline(tx, row)).toISOString(), duplicate: true };
    }
    const [updated] = await tx.update(dialogs).set({ lastSeq: row.lastSeq + 1,
      expiresAt: row.expiresAt ?? sql`${now.toISOString()}::timestamptz + interval '72 hours'` })
      .where(eq(dialogs.id, id)).returning();
    const [message] = await tx.insert(dialogMessages).values({ dialogId: id, seq: updated.lastSeq,
      senderClientId: clientId, requestId, text, createdAt: now }).returning();
    const dialog = await dialogView(tx, updated, clientId);
    return { message: messageView(message, clientId), dialog,
      serverTime: (await checkDeadline(tx, updated)).toISOString(), duplicate: false };
  }));
}

export async function updateDialog(clientId: string, id: string, action: "hide" | "read", seqs: number[]) {
  return withDb(db => db.transaction(async tx => {
    const { row, now } = await lockedDialog(tx, id, clientId);
    if (action === "hide") {
      await tx.update(dialogs).set(row.clientLow === clientId
        ? { lowHiddenThrough: row.lastSeq } : { highHiddenThrough: row.lastSeq }).where(eq(dialogs.id, id));
      await checkDeadline(tx, row);
      return { hiddenThrough: row.lastSeq };
    }
    if (seqs.length) await tx.update(dialogMessages).set({ readAt: sql`COALESCE(${dialogMessages.readAt}, ${now.toISOString()}::timestamptz)` })
      .where(and(eq(dialogMessages.dialogId, id), ne(dialogMessages.senderClientId, clientId),
        gt(dialogMessages.seq, hiddenThrough(row, clientId)), inArray(dialogMessages.seq, seqs)));
    await checkDeadline(tx, row);
    return { read: true };
  }));
}
