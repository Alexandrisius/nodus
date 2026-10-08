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

/** Фаза угасания: Rust-тикер решает КОГДА, CSS здесь — плавность. */
type FadePhase = 'idle' | 'fading' | 'reset';

/**
 * Попап уведомления (ADR-0019 п.4, канон Telegram Desktop по фидбеку 08.10):
 * клик по карточке — открыть беседу; «Ответить» — маленькая кнопка, проявляется
 * на hover ПОВЕРХ контента; поле ответа — мягкое, без рамок, в одну строку с
 * гексагоном внутри; активность пользователя (клик/клавиша) медленно гасит
 * попап (~3 c), hover возвращает; неактивен — висит неограниченно. Скролл
 * запрещён на всех уровнях; превью — максимум 2 строки с обрывом.
 */
export function PopupView() {
  const [data, setData] = useState<PopupData | null>(null);
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [fade, setFade] = useState<FadePhase>('idle');
  const inputRef = useRef<HTMLInputElement>(null);

  // Прозрачное окно + запрет скролла: впритык-геометрия на дробном DPI даёт
  // субпиксельное переполнение — глушим на корне (фидбек 08.10).
  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  }, []);

  // Pull-модель: окно забирает payload после загрузки (без гонки с маунтом).
  useEffect(() => {
    void invoke<PopupData | null>('popup_get_data').then((payload) => {
      setData(payload);
      setReplying(false);
      setText('');
    });
  }, []);

  // Rust-арбитр угасания сигналит напрямую (мост портала сюда не инъектируется).
  useEffect(() => {
    (window as { __popupFade?: (phase: string) => void }).__popupFade = (phase: string) => {
      setFade(phase === 'start' ? 'fading' : 'reset');
      if (phase !== 'start') {
        setTimeout(() => setFade('idle'), 350);
      }
    };
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

  const fadeClass =
    fade === 'fading'
      ? 'opacity-0 transition-opacity duration-[3000ms] ease-linear'
      : fade === 'reset'
        ? 'opacity-100 transition-opacity duration-300'
        : 'opacity-100';

  return (
    <div
      className={`group bg-card text-card-foreground relative flex h-screen w-screen flex-col overflow-hidden rounded-xl border px-3 pt-2 pb-3.5 font-sans ${fadeClass}`}
      onMouseEnter={() => void invoke('popup_set_hover', { hover: true })}
      onMouseLeave={() => void invoke('popup_set_hover', { hover: false })}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        if (replying) {
          setReplying(false);
          void invoke('popup_set_expanded', { expanded: false });
        } else {
          close();
        }
      }}
    >
      {/* Клик по карточке — открыть беседу (как клик по уведомлению в Telegram). */}
      <button
        type="button"
        onClick={openConversation}
        className="flex min-w-0 cursor-pointer items-start gap-2.5 pr-6 text-left"
        title={t.popupOpen}
      >
        <Avatar url={data.avatarUrl} name={data.title} />
        <span className="mt-px min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13px] leading-4 font-semibold">{data.title}</span>
            {data.urgent ? (
              <span className="bg-warning-soft text-warning rounded px-1 py-px text-[10px] leading-3 font-medium">
                {t.urgentLabel}
              </span>
            ) : null}
          </span>
          <span
            className={`mt-1 line-clamp-2 block max-h-8 overflow-hidden text-[12px] leading-4 [overflow-wrap:anywhere] ${
              data.previewAttachment ? 'text-info' : 'text-muted-foreground'
            }`}
          >
            {data.preview}
          </span>
        </span>
      </button>

      {/* Крестик: зона ховера = визуальный размер глифа (фидбек 08.10:
       «маленький крестик с огромным ховером»). */}
      <button
        type="button"
        aria-label={ui.common.close}
        onClick={close}
        className="text-muted-foreground hover:text-foreground hover:bg-accent absolute top-1 right-1 flex size-6 items-center justify-center rounded-md text-[16px] leading-none opacity-60 transition-opacity hover:opacity-100"
      >
        ×
      </button>

      {replying ? (
        // Поле мягкое как композер: БЕЗ бордера и БЕЗ рамки фокуса (фон
        // muted), одна строка; гексагон — ВНУТРИ поля по центру высоты.
        <div className="relative mt-2">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                send();
              }
            }}
            placeholder={t.popupReplyPlaceholder}
            maxLength={4000}
            className="bg-muted w-full rounded-lg border-0 py-2 pl-3 pr-10 text-[13px] leading-4 caret-foreground outline-none"
          />
          <button
            type="button"
            onClick={send}
            disabled={text.trim().length === 0 || sending}
            aria-label={t.popupSend}
            title={t.popupSend}
            className="text-info hover:text-info/80 absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center disabled:opacity-40"
          >
            <SendHexIcon className="size-5" />
          </button>
        </div>
      ) : null}

      {/* «Ответить» — маленькая, поверх контента, только на hover (Telegram). */}
      {!replying && data.canReply ? (
        <button
          type="button"
          onClick={startReply}
          className="text-muted-foreground hover:text-foreground absolute right-2 bottom-2 cursor-pointer rounded-md bg-card px-2 py-0.5 text-[12px] font-medium opacity-0 transition-opacity group-hover:opacity-100"
        >
          {t.popupReply}
        </button>
      ) : null}
    </div>
  );
}

/** Аватар автора крупный (Telegram): удалённая картинка, сбой — заглушка. */
function Avatar({ url, name }: { url?: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const initial = name.trim().charAt(0).toUpperCase() || 'N';
  if (!url || failed) {
    return (
      <div className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-full text-base font-semibold">
        {initial}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      onError={() => setFailed(true)}
      className="size-10 shrink-0 rounded-full object-cover"
    />
  );
}
