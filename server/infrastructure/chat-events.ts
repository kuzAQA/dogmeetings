import { Client } from "pg";
import type { EventEmitter } from "node:events";

type Change = { type: "message" | "read" | "hide"; userIds: string[]; dialogId: string; messageSeq?: number };
type Snapshot = { unreadCount: number; expiresInMs: number | null };
type Sink = { send: (event: "unread" | "message", data: Record<string, unknown>) => void; close: () => void };
type Listener = {
  connect: () => Promise<unknown>; query: (query: string) => Promise<unknown>; end: () => Promise<unknown>;
} & Pick<EventEmitter, "on" | "removeListener">;
type User = { sinks: Set<Sink>; revision: number; running: boolean; expiry?: ReturnType<typeof setTimeout> };
const channel = "dogmeet_chat";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseChatChange(payload: string): Change | null {
  try {
    const value = JSON.parse(payload);
    if (!value || !["message", "read", "hide"].includes(value.type) || !uuid.test(value.dialogId) ||
      !Array.isArray(value.userIds) || value.userIds.length < 1 || value.userIds.length > 2 ||
      !value.userIds.every((id: unknown) => typeof id === "string" && uuid.test(id)) ||
      Object.keys(value).some(key => !["type", "userIds", "dialogId", "messageSeq"].includes(key)) ||
      (value.type === "message" && (!Number.isSafeInteger(value.messageSeq) || value.messageSeq < 1)) ||
      (value.type !== "message" && value.messageSeq !== undefined)) return null;
    return value;
  } catch { return null; }
}

export class ChatEvents {
  private users = new Map<string, User>();
  private listener?: Listener;
  private starting?: Promise<void>;
  private subscribing = 0;
  private retryAfter = 0;
  private detachListener?: () => Promise<unknown>;
  private stopping?: Promise<unknown>;
  private createListener: () => Listener;
  private snapshot: (userId: string) => Promise<Snapshot>;

  constructor(createListener: () => Listener, snapshot: (userId: string) => Promise<Snapshot>) {
    this.createListener = createListener;
    this.snapshot = snapshot;
  }

  private notification = (event: { channel: string; payload?: string }) => {
    if (event.channel !== channel || !event.payload) return;
    const change = parseChatChange(event.payload);
    if (!change) return;
    for (const id of new Set(change.userIds)) {
      const user = this.users.get(id);
      if (!user) continue;
      if (change.type === "message") for (const sink of user.sinks) {
        sink.send("message", { dialogId: change.dialogId, messageSeq: change.messageSeq });
      }
      user.revision++;
      void this.refresh(id, user);
    }
  };

  private lost = () => {
    this.retryAfter = Date.now() + 5000;
    this.releaseListener();
    // NOTIFY has no replay: force every stream to authorize and read a fresh snapshot.
    for (const user of this.users.values()) {
      clearTimeout(user.expiry);
      for (const sink of [...user.sinks]) sink.close();
    }
    this.users.clear();
  };

  private releaseListener() {
    const listener = this.listener;
    if (!listener) return;
    this.listener = undefined;
    listener.removeListener("notification", this.notification);
    const stopping = this.detachListener?.();
    this.stopping = stopping;
    void stopping?.finally(() => { if (this.stopping === stopping) this.stopping = undefined; });
  }

  private async listen() {
    if (this.stopping) await this.stopping;
    if (this.starting) return this.starting;
    if (this.listener) return;
    if (Date.now() < this.retryAfter) throw new Error("Chat listener is reconnecting");
    const listener = this.createListener();
    this.listener = listener;
    const lost = () => { if (this.listener === listener) this.lost(); };
    listener.on("error", lost);
    listener.on("end", lost);
    this.detachListener = () => {
      listener.removeListener("end", lost);
      // An old connection must not close a replacement listener while it is ending.
      return listener.end().catch(() => {}).finally(() => listener.removeListener("error", lost));
    };
    listener.on("notification", this.notification);
    this.starting = (async () => {
      try {
        await listener.connect();
        await listener.query(`LISTEN ${channel}`);
        if (this.listener !== listener) throw new Error("Chat listener disconnected");
      } catch (error) {
        this.lost();
        throw error;
      } finally { this.starting = undefined; }
    })();
    return this.starting;
  }

  async subscribe(userId: string, sink: Sink) {
    this.subscribing++;
    try {
      await this.listen();
      if (!this.listener) throw new Error("Chat listener disconnected");
      let user = this.users.get(userId);
      if (!user) {
        user = { sinks: new Set(), revision: 0, running: false };
        this.users.set(userId, user);
      }
      user.sinks.add(sink);
      void this.refresh(userId, user);
      return () => {
        user.sinks.delete(sink);
        if (!user.sinks.size) {
          clearTimeout(user.expiry);
          if (this.users.get(userId) === user) this.users.delete(userId);
        }
        if (!this.users.size && !this.subscribing) this.releaseListener();
      };
    } finally {
      this.subscribing--;
      if (!this.users.size && !this.subscribing) this.releaseListener();
    }
  }

  private async refresh(id: string, user: User) {
    if (user.running) return;
    user.running = true;
    clearTimeout(user.expiry);
    try {
      while (this.users.get(id) === user && user.sinks.size) {
        const revision = user.revision;
        const snapshot = await this.snapshot(id);
        if (this.users.get(id) !== user) return;
        if (revision !== user.revision) continue;
        for (const sink of user.sinks) sink.send("unread", { unreadCount: snapshot.unreadCount });
        if (snapshot.expiresInMs !== null && user.sinks.size) user.expiry = setTimeout(() => {
          user.revision++;
          void this.refresh(id, user);
        }, Math.max(1, snapshot.expiresInMs));
        return;
      }
    } catch {
      for (const sink of [...user.sinks]) sink.close();
    } finally { user.running = false; }
  }
}

const globalEvents = globalThis as typeof globalThis & { __dogmeetChatEvents?: ChatEvents };
export function getChatEvents() {
  return globalEvents.__dogmeetChatEvents ??= new ChatEvents(
    () => new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000,
      keepAlive: true, application_name: "dogmeet-chat-listener" }),
    async id => (await import("./chat-repository")).unreadSnapshot(id)
  );
}

export function chatEventStream(request: Request, session: { clientId: string; expiresAt: Date }, hub = getChatEvents()) {
  const encoder = new TextEncoder();
  let stop: (closeController?: boolean) => void = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let unsubscribe: (() => void) | undefined;
      const heartbeat = setInterval(() => write(": heartbeat\n\n"), 25000);
      // Bound revocation/session replacement latency without checking the DB on heartbeats.
      const lifetime = setTimeout(() => stop(), Math.max(0, Math.min(300000, session.expiresAt.getTime() - Date.now())));
      stop = (closeController = true) => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearTimeout(lifetime);
        request.signal.removeEventListener("abort", abort);
        unsubscribe?.();
        if (closeController) controller.close();
      };
      function write(frame: string) {
        if (closed) return;
        if ((controller.desiredSize ?? 0) <= 0) { stop(); return; }
        controller.enqueue(encoder.encode(frame));
      }
      const abort = () => stop();
      request.signal.addEventListener("abort", abort, { once: true });
      if (request.signal.aborted) { stop(); return; }
      write("retry: 5000\n\n");
      void hub.subscribe(session.clientId, {
        send: (event, data) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`), close: stop
      }).then(remove => { unsubscribe = remove; if (closed) remove(); }).catch(stop);
    },
    cancel() { stop(false); }
  }, { highWaterMark: 16 });
  return new Response(body, { headers: {
    "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, private, no-transform",
    "X-Accel-Buffering": "no", "X-Content-Type-Options": "nosniff"
  } });
}
