import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ui } from '@nodus/contracts';

import type { PopupData } from '../shell/shell-ipc.js';

const t = ui.desktop;

/**
 * Попап уведомления (ADR-0019 п.4, канон Telegram Desktop): клик по карточке —
 * открыть беседу; «Ответить» — незаметная ghost-кнопка, разворачивает поле
 * ввода на всю ширину с круглой кнопкой-стрелкой (send). Окно растёт ВВЕРХ —
 * низ на месте (Rust пересчитывает позицию слота). Автоскрытия нет: попап
 * живёт до реакции, сверх 4 на экране — очередь в Rust (вердикт 08.10).
 */
export function PopupView() {
  const [data, setData] = useState<PopupData | null>(null);
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Прозрачное окно: globals.css красит body в фон темы — для попапа
  // возвращаем прозрачность, иначе скруглённая карточка сидит на прямоугольнике.
  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
  }, []);

  // Pull-модель: окно забирает payload после загрузки — событие из Rust
  // могло бы прийти раньше монтирования React (гонка), pull её исключает.
  useEffect(() => {
    void invoke<PopupData | null>('popup_get_data').then((payload) => {
      setData(payload);
      setReplying(false);
      setText('');
    });
  }, []);

  function close() {
    void invoke('popup_close');
  }

  function startReply() {
    setReplying(true);
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
      className="group bg-card text-card-foreground relative flex h-screen w-screen flex-col rounded-xl border px-3 py-2.5 font-sans shadow-[0_8px_30px_rgba(0,0,0,0.25)]"
      onKeyDown={(e) => {
        if (e.key === 'Escape') close();
      }}
    >
      {/* Клик по карточке — открыть беседу (как клик по уведомлению в Telegram). */}
      <button
        type="button"
        onClick={openConversation}
        className="focus-visible:ring-ring flex min-w-0 cursor-pointer items-start gap-2.5 rounded-lg pr-5 text-left focus-visible:outline-none focus-visible:ring-2"
        title={t.popupOpen}
      >
        <Avatar url={data.avatarUrl} name={data.title} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13px] leading-5 font-semibold">{data.title}</span>
            {data.urgent ? (
              <span className="bg-warning-soft text-warning rounded px-1 py-px text-[10px] leading-3 font-medium">
                {t.urgentLabel}
              </span>
            ) : null}
          </span>
          <span className="text-muted-foreground mt-0.5 line-clamp-2 block text-[12.5px] leading-4">
            {data.preview}
          </span>
        </span>
      </button>

      {/* Крестик — проявляется на hover (Telegram), вне фокуса не мешает читать. */}
      <button
        type="button"
        aria-label={ui.common.close}
        onClick={close}
        className="text-muted-foreground hover:text-foreground absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-md text-xs opacity-0 transition-opacity group-hover:opacity-100"
      >
        ×
      </button>

      {replying ? (
        <div className="mt-auto flex items-end gap-1.5 pt-2">
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
            className="border-input bg-background focus:ring-ring w-full flex-1 resize-none rounded-lg border px-2.5 py-2 text-[13px] leading-[17px] outline-none focus:ring-2"
          />
          <button
            type="button"
            onClick={send}
            disabled={text.trim().length === 0 || sending}
            aria-label={t.popupSend}
            className="bg-primary text-primary-foreground focus-visible:ring-ring flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 disabled:opacity-50"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
              <path
                d="M8 13V3.5M8 3.5 4 7.5M8 3.5l4 4"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      ) : (
        <div className="mt-auto flex justify-end pt-1">
          {data.canReply ? (
            <button
              type="button"
              onClick={startReply}
              className="text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-ring -mr-1.5 cursor-pointer rounded-md px-2 py-0.5 text-[12.5px] font-medium outline-none focus-visible:ring-2"
            >
              {t.popupReply}
            </button>
          ) : null}
        </div>
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
      <div className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold">
        {initial}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      onError={() => setFailed(true)}
      className="size-8 shrink-0 rounded-full object-cover"
    />
  );
}
