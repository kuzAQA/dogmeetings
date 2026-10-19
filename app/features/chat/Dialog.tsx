"use client";

import { Fragment, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCheck, EllipsisVertical, Trash2 } from "lucide-react";
import Image from "next/image";
import { DogmeetState } from "../../components/ui/DogmeetState";
import { ApiRequestError } from "../api/client";
import { CHAT_NOTICE, chatText, MAX_MESSAGE_LENGTH, messageLength, type ChatDialog, type ChatHistory, type ChatMessage } from "../../../server/domain/chat";
import { createMessageId, hideChat, loadChat, openChat, postMessage, readChat } from "./api";
import { DeleteDialog } from "./DeleteDialog";
import { useChatPolling } from "./use-chat-polling";

const timeFormat = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
type Draft = { text: string; attempt: { requestId: string; text: string } | null };
const drafts = new Map<string, Draft>();

export function Dialog({ id, walkId, petId, onBack, onResolved }: {
  id: string | null; walkId: string | null; petId?: string; onBack: () => void; onResolved: (id: string) => void;
}) {
  const [dialog, setDialog] = useState<ChatDialog | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState(() => drafts.get(id ?? walkId ?? "")?.text ?? "");
  const [attempt, setAttempt] = useState<Draft["attempt"]>(() => drafts.get(id ?? walkId ?? "")?.attempt ?? null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sendError, setSendError] = useState("");
  const [expired, setExpired] = useState(false);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const menu = useRef<HTMLDivElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [visible, setVisible] = useState(true);
  const activeDialog = useRef<ChatDialog | null>(null);
  const cursor = useRef<number | null>(null);
  const history = useRef<HTMLDivElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const busy = useRef(false);
  const readBusy = useRef(false);
  const readSent = useRef(new Set<number>());
  const scrollToEnd = useRef(true);
  const inputReady = Boolean(dialog);
  const draftKey = dialog?.id ?? id ?? walkId;

  useLayoutEffect(() => {
    if (!inputReady) return;
    input.current?.focus({ preventScroll: true });
  }, [inputReady]);

  useEffect(() => {
    if (!draftKey) return;
    if (text) drafts.set(draftKey, { text, attempt });
    else drafts.delete(draftKey);
  }, [draftKey, text, attempt]);

  useEffect(() => {
    if (!menuOpen) return;
    function dismiss(event: PointerEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape") return;
        menu.current?.querySelector("button")?.focus({ preventScroll: true });
      } else if (event.target instanceof Node && menu.current?.contains(event.target)) return;
      setMenuOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, [menuOpen]);

  const expire = useCallback(() => { setExpired(true); setMessages([]); setHasOlder(false); }, []);
  const report = useCallback((error: unknown) => {
    if (error instanceof ApiRequestError && [404, 410].includes(error.status)) expire();
    else setError(error instanceof Error ? error.message : "Не удалось загрузить переписку.");
  }, [expire]);
  function applyDialog(next: ChatDialog, serverTime: string, elapsed: number) {
    const draft = !dialog && drafts.get(next.id);
    if (draft) { setText(current => current || draft.text); setAttempt(draft.attempt); }
    activeDialog.current = next;
    setDialog(next);
    const remaining = next.expiresAt ? Date.parse(next.expiresAt) - Date.parse(serverTime) - elapsed : null;
    if (remaining !== null && remaining <= 0) { expire(); return false; }
    setDeadline(remaining === null ? null : performance.now() + remaining);
    return true;
  }
  function merge(data: ChatHistory) {
    setMessages(previous => {
      const all = new Map(previous.map(message => [message.seq, message]));
      for (const message of data.messages) all.set(message.seq, message);
      for (const receipt of data.receipts) {
        const message = all.get(receipt.seq);
        if (message) all.set(receipt.seq, { ...message, readAt: receipt.readAt });
      }
      return [...all.values()].filter(message => message.seq > data.dialog.hiddenThrough).sort((a, b) => a.seq - b.seq);
    });
  }
  const refresh = useChatPolling(expired ? null : id ?? walkId, async signal => {
    const started = performance.now();
    let current = activeDialog.current;
    if (!current) {
      if (id) {
        const data = await loadChat(id, new URLSearchParams(), signal);
        if (signal.aborted) return;
        if (!applyDialog(data.dialog, data.serverTime, performance.now() - started)) return;
        merge(data);
        cursor.current = data.messages.at(-1)?.seq ?? data.dialog.hiddenThrough;
        setHasOlder(data.hasOlder); setLoaded(true); setError("");
        return;
      }
      if (!walkId) throw new Error("Не выбран собеседник.");
      const data = await openChat({ walkId, petId }, signal);
      if (signal.aborted) return;
      current = data.dialog;
      activeDialog.current = current;
    }
    const pending = messages.filter(message => message.mine && !message.readAt).map(message => message.seq);
    const params = new URLSearchParams();
    if (cursor.current !== null) params.set("afterSeq", String(cursor.current));
    if (pending.length) params.set("pendingIds", pending.slice(0, 50).join(","));
    let data = await loadChat(current.id, params, signal);
    if (signal.aborted) return;
    if (!applyDialog(data.dialog, data.serverTime, performance.now() - started)) return;
    merge(data);
    if (cursor.current === null) setHasOlder(data.hasOlder);
    cursor.current = Math.max(cursor.current ?? 0, data.dialog.hiddenThrough, data.messages.at(-1)?.seq ?? 0);
    while (data.hasMore) {
      data = await loadChat(current.id, new URLSearchParams({ afterSeq: String(cursor.current) }), signal);
      if (signal.aborted) return;
      merge(data);
      cursor.current = Math.max(cursor.current, data.messages.at(-1)?.seq ?? 0);
    }
    for (let index = 50; index < pending.length; index += 50) {
      const receipts = await loadChat(current.id, new URLSearchParams({ afterSeq: String(cursor.current), pendingIds: pending.slice(index, index + 50).join(",") }), signal);
      if (signal.aborted) return;
      merge(receipts);
      cursor.current = Math.max(cursor.current, receipts.messages.at(-1)?.seq ?? 0);
    }
    setLoaded(true); setError("");
    if (id !== current.id) onResolved(current.id);
  }, report);

  useEffect(() => {
    const change = () => setVisible(document.visibilityState === "visible");
    change(); document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  useEffect(() => {
    if (deadline === null || expired) return;
    const timer = setTimeout(() => { setExpired(true); setMessages([]); setHasOlder(false); }, Math.max(0, deadline - performance.now()));
    return () => clearTimeout(timer);
  }, [deadline, expired]);
  useLayoutEffect(() => {
    const node = history.current;
    if (node && scrollToEnd.current) node.scrollTop = node.scrollHeight;
  }, [messages]);
  useLayoutEffect(() => {
    const node = input.current;
    if (!node) return;
    const resize = () => {
      node.style.height = "0px";
      node.style.height = `${node.scrollHeight}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    return () => observer.disconnect();
  }, [text]);
  useEffect(() => {
    const node = history.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      if (scrollToEnd.current) node.scrollTop = node.scrollHeight;
    });
    observer.observe(node);
    const viewport = window.visualViewport;
    const resize = () => {
      screen.current?.style.setProperty("--chat-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
      screen.current?.style.setProperty("--chat-viewport-top", `${viewport?.offsetTop ?? 0}px`);
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    return () => {
      observer.disconnect();
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
    };
  }, []);
  useEffect(() => {
    const node = history.current;
    if (!node || !dialog || !visible || expired || deleteOpen) return;
    const controller = new AbortController();
    const observer = new IntersectionObserver(entries => {
      const seqs = entries.filter(entry => entry.isIntersecting).map(entry => Number((entry.target as HTMLElement).dataset.seq))
        .filter(seq => !readSent.current.has(seq)).slice(0, 50);
      if (!seqs.length || readBusy.current || document.visibilityState !== "visible") return;
      readBusy.current = true;
      void readChat(dialog.id, seqs, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]))
        .then(() => { for (const seq of seqs) readSent.current.add(seq); window.dispatchEvent(new Event("dogmeet-chat-changed")); })
        .catch(error => { if (!controller.signal.aborted) report(error); })
        .finally(() => { readBusy.current = false; });
    }, { threshold: 0.01 });
    node.querySelectorAll("[data-incoming]").forEach(element => observer.observe(element));
    return () => { controller.abort(); observer.disconnect(); };
  }, [messages, dialog, visible, expired, deleteOpen, report]);

  async function send() {
    if (!dialog || busy.current || expired) return;
    const valid = chatText(text);
    if (valid === null) return;
    busy.current = true; setSending(true); setSendError("");
    const started = performance.now();
    try {
      const current = attempt ?? { requestId: createMessageId(), text: valid };
      setAttempt(current);
      const result = await postMessage(dialog.id, current);
      if (applyDialog(result.dialog, result.serverTime, performance.now() - started)) {
        scrollToEnd.current = true;
        setMessages(previous => [...previous.filter(message => message.seq !== result.message.seq), result.message].sort((a, b) => a.seq - b.seq));
      }
      drafts.delete(dialog.id); setText(""); setAttempt(null); refresh();
    } catch (error) {
      if (error instanceof ApiRequestError && [404, 410].includes(error.status)) expire();
      setSendError("Не удалось отправить. Текст сохранён — повторите попытку.");
    } finally { busy.current = false; setSending(false); }
  }
  async function older() {
    if (!dialog || loadingOlder) return;
    setLoadingOlder(true);
    const node = history.current;
    const oldHeight = node?.scrollHeight ?? 0;
    try {
      const data = await loadChat(dialog.id, new URLSearchParams({ beforeSeq: String(messages[0]?.seq ?? 0) }), AbortSignal.timeout(15000));
      scrollToEnd.current = false; merge(data); setHasOlder(data.hasOlder);
      requestAnimationFrame(() => { if (node) node.scrollTop += node.scrollHeight - oldHeight; });
    } catch (error) { report(error); }
    finally { setLoadingOlder(false); }
  }
  async function renew() {
    if (!dialog || busy.current) return;
    busy.current = true;
    try {
      const started = performance.now();
      const result = await openChat({ peerClientId: dialog.peer.clientId }, AbortSignal.timeout(15000));
      if (!applyDialog(result.dialog, result.serverTime, performance.now() - started)) return;
      cursor.current = null; readSent.current.clear(); setMessages([]); setAttempt(null);
      setExpired(false); setError(""); setSendError(""); setLoaded(false);
      onResolved(result.dialog.id);
    } catch (error) { report(error); }
    finally { busy.current = false; }
  }
  async function remove() {
    if (!dialog || deleting) return;
    setDeleting(true);
    try { await hideChat(dialog.id); setMessages([]); setDeleteOpen(false); onBack(); }
    catch (error) { setDeleteError(error instanceof Error ? error.message : "Не удалось удалить диалог."); }
    finally { setDeleting(false); }
  }

  return <div className="screen chat-screen" ref={screen}>
    <header className="chat-heading">
      <button className="icon-button chat-header-button" aria-label="Назад" type="button" onClick={onBack}><ArrowLeft aria-hidden="true" /></button>
      <div className="chat-peer">
        {dialog && <Image className="pet-face" src={dialog.peer.photoUrl ?? "/dog-placeholder.webp"} alt={`Собака ${dialog.peer.name}`} width={36} height={36} unoptimized={dialog.peer.photoUrl?.startsWith("/api/")} />}
        <h1 title={dialog?.peer.name}>{dialog?.peer.name ?? "Диалог"}</h1>
      </div>
      {dialog && !expired && <div className="chat-menu" ref={menu}>
        <button className="chat-header-button" aria-label="Меню диалога" aria-expanded={menuOpen} aria-controls={menuId} type="button" onClick={() => setMenuOpen(!menuOpen)}><EllipsisVertical aria-hidden="true" /></button>
        {menuOpen && <div className="chat-menu-panel" id={menuId}>
          <button aria-label="Удалить диалог" type="button" onClick={() => { setMenuOpen(false); setDeleteError(""); setDeleteOpen(true); }}><Trash2 aria-hidden="true" />Удалить</button>
        </div>}
      </div>}
    </header>
    {error && <div role="alert" className="chat-error"><p>{error}</p><button className="button secondary" type="button" onClick={refresh}>Повторить</button></div>}
    {!loaded && !expired && !error && <DogmeetState state="loading" />}
    {expired && <div className="chat-expired" role="status"><p>Срок хранения диалога истёк. Переписка удалена у обоих участников.</p>
      {dialog && <button className="button" type="button" onClick={() => { void renew(); }}>Начать новый диалог</button>}
    </div>}
    <div className="chat-history" ref={history} role="region" aria-label="История сообщений" onScroll={event => {
      const node = event.currentTarget;
      scrollToEnd.current = node.scrollHeight - node.scrollTop - node.clientHeight < 60;
    }}>
      {hasOlder && <button className="button quiet" type="button" disabled={loadingOlder} onClick={() => { void older(); }}>{loadingOlder ? "Загружаем…" : "Ранние сообщения"}</button>}
      {loaded && !expired && !dialog?.expiresAt && <p className="chat-notice">{CHAT_NOTICE}</p>}
      {messages.map((message, index) => {
        const day = dayFormat.format(new Date(message.createdAt));
        const previous = messages[index - 1];
        const next = messages[index + 1];
        const following = previous && previous.mine === message.mine && dayFormat.format(new Date(previous.createdAt)) === day;
        const groupEnd = !next || next.mine !== message.mine || dayFormat.format(new Date(next.createdAt)) !== day;
        const meta = <span className="chat-message-meta"><time dateTime={message.createdAt}>{timeFormat.format(new Date(message.createdAt))}</time>
          {message.mine && <span className={message.readAt ? "chat-receipt chat-receipt--read" : "chat-receipt"} role="img" aria-label={message.readAt ? "Прочитано" : "Отправлено"}><CheckCheck aria-hidden="true" /></span>}
        </span>;
        return <Fragment key={message.seq}>
          {(!previous || dayFormat.format(new Date(previous.createdAt)) !== day) && <p className="chat-day">{day}</p>}
          <div className={`chat-message${message.mine ? " chat-message--mine" : ""}${following ? " chat-message--group-following" : ""}${groupEnd ? " chat-message--group-end" : ""}`} data-seq={message.seq} data-incoming={message.mine ? undefined : true}>
            <p><span className="chat-message-text">{message.text}</span>{meta}</p>
          </div>
        </Fragment>;
      })}
    </div>
    <form className="chat-composer" onSubmit={event => { event.preventDefault(); void send(); }}>
      <div className="chat-composer-input">
        <textarea ref={input} aria-label="Сообщение" placeholder="Сообщение" inputMode="none" aria-describedby="chat-input-note" rows={1} value={text} readOnly={Boolean(attempt)}
          onPointerDown={event => {
            const node = event.currentTarget;
            if (node.inputMode !== "none") return;
            node.inputMode = "text";
            node.blur(); node.focus({ preventScroll: true });
          }}
          disabled={!dialog || sending} onChange={event => setText(event.target.value)} />
        <button className="chat-send" type="submit" aria-label="Отправить сообщение" aria-busy={sending}
          title={sending ? "Отправляем…" : attempt ? "Повторить отправку" : "Отправить сообщение"}
          disabled={!dialog || sending || expired || chatText(text) === null}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
            <path d="m21.854 2.147-10.94 10.939" />
          </svg>
        </button>
      </div>
      <p id="chat-input-note" className={messageLength(text) > MAX_MESSAGE_LENGTH ? "small-note" : "visually-hidden"}>
        {messageLength(text) > MAX_MESSAGE_LENGTH ? "Не более 2000 символов." : "Только текст. До 2000 символов."}
        <span aria-live="polite"> {messageLength(text)}/{MAX_MESSAGE_LENGTH}</span>
      </p>
      {sendError && <p className="form-error" role="alert">{sendError}</p>}
    </form>
    {deleteOpen && <DeleteDialog busy={deleting} error={deleteError} onCancel={() => { if (!deleting) setDeleteOpen(false); }} onDelete={() => { void remove(); }} />}
  </div>;
}
