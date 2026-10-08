import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ui } from '@nodus/contracts';

import type { PopupData } from '../shell/shell-ipc.js';

const t = ui.desktop;

/** Гексагон отправки — зеркало web/shared/ui/send-hex-icon.tsx (канон
 *  композера, вердикт 24.09): мини-UI оболочки не импортирует web-код. */
function SendHexIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <polygon points="12,2.8 20,7.4 20,16.6 12,21.2 4,16.6 4,7.4" />
    </svg>
  );
}

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
        // Канон композера портала: поле на всю ширину, кнопка-гексагон —
        // ВНУТРИ строки ввода (не сужает текстовое поле), высота в 1 строку.
        <div className="relative mt-auto pt-2">
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
            rows={1}
            maxLength={4000}
            className="border-input bg-background focus:ring-ring w-full resize-none rounded-lg border py-[7px] pl-2.5 pr-10 text-[13px] leading-[16px] outline-none focus:ring-2"
          />
          <button
            type="button"
            onClick={send}
            disabled={text.trim().length === 0 || sending}
            aria-label={t.popupSend}
            title={t.popupSend}
            className="text-info hover:text-info/80 absolute right-2 bottom-[7px] flex size-6 items-center justify-center disabled:opacity-40"
          >
            <SendHexIcon className="size-5" />
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
