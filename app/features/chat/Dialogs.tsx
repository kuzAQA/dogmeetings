"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import Image from "next/image";
import { DogmeetHeader } from "../../components/ui/DogmeetFrame";
import { DogmeetState } from "../../components/ui/DogmeetState";
import type { DialogSummary } from "../../../server/domain/chat";
import { hideChat, listChats } from "./api";
import { DeleteDialog } from "./DeleteDialog";
import { useChatPolling } from "./use-chat-polling";

const timeFormat = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function Dialogs({ onBack, onOpen }: { onBack: () => void; onOpen: (id: string) => void }) {
  const [dialogs, setDialogs] = useState<DialogSummary[] | null>(null);
  const [pages, setPages] = useState(1);
  const [more, setMore] = useState(false);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const hidden = useRef(new Map<string, number>());
  const [selected, setSelected] = useState<string | null>(null);
  const menuId = useId();
  const menu = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  function cancelHold() {
    if (holdTimer.current !== null) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    pointer.current = null;
  }

  useEffect(() => cancelHold, []);
  useEffect(() => {
    if (!selected) return;
    menu.current?.querySelector("button")?.focus({ preventScroll: true });
    function dismiss(event: PointerEvent | KeyboardEvent) {
      if (event instanceof KeyboardEvent) {
        if (event.key !== "Escape" && event.key !== "Tab") return;
        if (event.key === "Escape") {
          event.preventDefault();
          trigger.current?.focus({ preventScroll: true });
        }
      } else if (event.target instanceof Node && menu.current?.contains(event.target)) return;
      setSelected(null);
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, [selected]);
  const refresh = useChatPolling("dialogs", async signal => {
    const rows: DialogSummary[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < pages; page++) {
      const data = await listChats(cursor, signal);
      rows.push(...data.dialogs);
      cursor = data.nextCursor;
      if (!cursor) break;
    }
    if (signal.aborted) return;
    setDialogs(rows.filter(row => row.lastMessage.seq > (hidden.current.get(row.id) ?? -1)));
    setMore(Boolean(cursor));
    setError("");
  }, error => setError(error instanceof Error ? error.message : "Не удалось загрузить диалоги."));
  useEffect(() => { if (pages > 1) refresh(); }, [pages, refresh]);

  function confirmDelete(id: string) { setDeleteError(""); setPendingDelete(id); }
  async function remove() {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    try {
      const result = await hideChat(pendingDelete);
      hidden.current.set(pendingDelete, result.hiddenThrough);
      setDialogs(rows => rows?.filter(row => row.id !== pendingDelete) ?? []);
      setPendingDelete(null);
      refresh();
    } catch (error) { setDeleteError(error instanceof Error ? error.message : "Не удалось удалить диалог."); }
    finally { setDeleting(false); }
  }

  return <div className="screen dialogs-screen">
    <DogmeetHeader onBack={onBack} /><h1>Диалоги</h1>
    {error && <DogmeetState state="error" message={error} onAction={refresh} />}
    {dialogs === null && !error && <DogmeetState state="loading" />}
    {dialogs?.length === 0 && !error && <DogmeetState state="empty" title="Вы еще никому не писали" />}
    {dialogs?.map(row => <div className={`chat-list-row${selected === row.id ? " is-selected" : ""}`} key={row.id}>
      <button className="chat-list-open" type="button" aria-haspopup="menu" aria-expanded={selected === row.id}
        aria-controls={selected === row.id ? menuId : undefined}
        onContextMenu={event => {
          event.preventDefault(); cancelHold();
          trigger.current = event.currentTarget; setSelected(row.id);
        }}
        onKeyDown={event => {
          suppressClick.current = false;
          if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            event.preventDefault(); cancelHold();
            trigger.current = event.currentTarget; setSelected(row.id);
          }
        }}
        onPointerDown={event => {
          cancelHold(); suppressClick.current = false;
          if (event.pointerType !== "touch" || !event.isPrimary) return;
          pointer.current = { x: event.clientX, y: event.clientY };
          trigger.current = event.currentTarget;
          holdTimer.current = setTimeout(() => {
            suppressClick.current = true; setSelected(row.id); cancelHold();
          }, 500);
        }}
        onPointerMove={event => {
          const start = pointer.current;
          if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) cancelHold();
        }}
        onPointerCancel={cancelHold} onPointerUp={cancelHold}
        onClick={event => {
          if (suppressClick.current) { event.preventDefault(); suppressClick.current = false; return; }
          if (!pendingDelete && !selected) onOpen(row.id);
        }}>
        <span className="chat-list-avatar">
          <Image className="pet-face" src={row.peer.photoUrl ?? "/dog-placeholder.webp"} alt={`Собака ${row.peer.name}`} width={48} height={48} unoptimized={row.peer.photoUrl?.startsWith("/api/")} />
          {selected === row.id && <Check className="chat-list-check" aria-label="Выбран диалог" />}
        </span>
        <span><strong>{row.peer.name}</strong><small>{row.lastMessage.text}</small></span>
        <time dateTime={row.lastMessage.createdAt}>{timeFormat.format(new Date(row.lastMessage.createdAt))}</time>
      </button>
      {selected === row.id && <div className="chat-menu-panel" id={menuId} role="menu" aria-label={`Действия с диалогом ${row.peer.name}`} ref={menu}>
        <button type="button" role="menuitem" onClick={() => { trigger.current?.focus({ preventScroll: true }); setSelected(null); confirmDelete(row.id); }}><Trash2 aria-hidden="true" />Удалить</button>
      </div>}
    </div>)}

    {more && <button className="button secondary" type="button" onClick={() => setPages(value => value + 1)}>Показать ещё</button>}
    {pendingDelete && <DeleteDialog busy={deleting} error={deleteError} onCancel={() => { if (!deleting) setPendingDelete(null); }} onDelete={() => { void remove(); }} />}
  </div>;
}
