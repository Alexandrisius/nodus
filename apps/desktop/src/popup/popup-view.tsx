import { useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { ui } from '@nodus/contracts';

import type { PopupData } from '../shell/shell-ipc.js';

const t = ui.desktop;

/**
 * Попап уведомления (ADR-0019 п.4): frameless always-on-top окно, аватар+имя+
 * превью, «Ответить» инлайн, «Открыть» — фокус портала и переход в беседу.
 * Автоскрытие (6 c, важные — до реакции) ведёт Rust; фокус поля ответа
 * снимает таймер (`popup_hold`). Окно закрывается только из Rust (`popup_close`).
 */
export function PopupView() {
  const [data, setData] = useState<PopupData | null>(null);
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const un = listen<PopupData>('popup:data', (e) => {
      setData(e.payload);
      setReplying(false);
      setText('');
    });
    return () => void un.then((f) => f());
  }, []);

  function close() {
    void invoke('popup_close');
  }

  function startReply() {
    setReplying(true);
    void invoke('popup_hold');
    void invoke('popup_set_expanded', { expanded: true });
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function send() {
    if (!data || text.trim().length === 0 || sending) return;
    setSending(true);
    void invoke('popup_submit_reply', {
      payload: { id: data.id, conversationId: data.conversationId, text: text.trim() },
    })
      .then(close)
      .catch(() => setSending(false));
  }

  function openConversation() {
    if (!data) return;
    void invoke('popup_open', { conversationId: data.conversationId }).then(close);
  }

  if (!data) {
    return <div className="h-screen w-screen bg-transparent" />;
  }

  return (
    <div
      className="bg-card text-card-foreground flex h-screen w-screen flex-col rounded-[14px] border p-3 font-sans shadow-lg"
      onKeyDown={(e) => {
        if (e.key === 'Escape') close();
      }}
    >
      <header className="flex items-start gap-2.5">
        <Avatar url={data.avatarUrl} name={data.title} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold">{data.title}</p>
            {data.urgent ? (
              <span className="bg-warning-soft text-warning rounded px-1.5 py-px text-[11px] font-medium">
                {t.urgentLabel}
              </span>
            ) : null}
          </div>
          <p className="text-muted-foreground mt-0.5 line-clamp-2 text-sm leading-snug">
            {data.preview}
          </p>
        </div>
        <button
          type="button"
          aria-label={ui.common.close}
          onClick={close}
          className="text-muted-foreground hover:text-foreground -mr-0.5 -mt-0.5 h-6 w-6 shrink-0 rounded-md text-sm"
        >
          ×
        </button>
      </header>

      {replying ? (
        <div className="mt-2.5 flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={t.popupReplyPlaceholder}
            rows={2}
            maxLength={4000}
            className="border-input bg-background focus:ring-ring min-h-0 flex-1 resize-none rounded-[10px] border px-2.5 py-1.5 text-sm outline-none focus:ring-2"
          />
          <button
            type="button"
            onClick={send}
            disabled={text.trim().length === 0 || sending}
            className="bg-primary text-primary-foreground h-9 shrink-0 rounded-[10px] px-3 text-sm font-medium disabled:opacity-60"
          >
            {t.popupSend}
          </button>
        </div>
      ) : (
        <footer className="mt-2.5 flex justify-end gap-2">
          {data.canReply ? (
            <button
              type="button"
              onClick={startReply}
              className="bg-primary text-primary-foreground h-8 rounded-[10px] px-3 text-sm font-medium"
            >
              {t.popupReply}
            </button>
          ) : null}
          <button
            type="button"
            onClick={openConversation}
            className="border-input bg-background hover:bg-accent h-8 rounded-[10px] border px-3 text-sm font-medium"
          >
            {t.popupOpen}
          </button>
        </footer>
      )}
    </div>
  );
}

/** Аватар автора: удалённая картинка портала, сбой — графитовая заглушка с инициалом. */
function Avatar({ url, name }: { url?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const initial = name.trim().charAt(0).toUpperCase() || 'N';
  if (!url || failed) {
    return (
      <div className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
        {initial}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      onError={() => setFailed(true)}
      className="size-9 shrink-0 rounded-full object-cover"
    />
  );
}
