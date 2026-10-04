import { useLayoutEffect, useRef, useState, type ClipboardEvent, type RefObject } from 'react';
import { toast } from 'sonner';

import { ui } from '@nodus/contracts';

import { emitTyping } from '../socket/typing-emitter.js';
import { addFiles } from './composer-files.js';
import type { StickerSubmitPayload } from './sticker-api.js';

/** Рост поля против базовой строки (ResizeObserver) — хореография иконок
 *  композера (в покое — self-center, вырос — self-end, канон Битрикс24).
 *  Вынесено из chat-composer.tsx (I5, #177). */
export function useGrown(inputRef: RefObject<HTMLTextAreaElement | null>): boolean {
  const [grown, setGrown] = useState(false);
  const baseHeight = useRef(0);
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (baseHeight.current === 0) baseHeight.current = el.clientHeight;
      setGrown(el.clientHeight > baseHeight.current + 4);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [inputRef]);
  return grown;
}

export function ctrlOrAlt(event: { ctrlKey: boolean; altKey: boolean }): boolean {
  return event.ctrlKey || event.altKey;
}

/** Ввод-действия композера (вынесено из chat-composer.tsx — I5, #177):
 *  эмодзи в каретку (#130), стикер-отправка мимо гейтов (#143), paste
 *  файлов (#87) с вежливой подсказкой при запрете вложений хостом. */
export function useComposerInputActions(deps: {
  focusId: string;
  conversationId?: string;
  typingThreadRootId?: string | null;
  text: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  attachmentsEnabled: boolean;
  /** Стор-экшн черновика (useChatDrafts.setText) — пишем в ключ фокуса. */
  setText: (key: string, text: string) => void;
  onSubmit: (submit: {
    text: string;
    attachments: [];
    reply: null;
    edit: null;
    sticker: StickerSubmitPayload;
  }) => void;
  requestScrollEnd: () => void;
}) {
  const {
    focusId,
    conversationId,
    typingThreadRootId,
    text,
    inputRef,
    attachmentsEnabled,
    setText,
    onSubmit,
    requestScrollEnd,
  } = deps;

  /** Вставка эмодзи из панели (#130): в позицию КАРЕТКИ поля, каретка — за
   *  вставленным глифом (канон мессенджеров); поле получает фокус обратно. */
  function insertEmoji(emoji: string) {
    const el = inputRef.current;
    if (!el) {
      setText(focusId, text + emoji);
      return;
    }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? start;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(focusId, next);
    if (conversationId && next.length > 0) emitTyping(conversationId, typingThreadRootId);
    const caret = start + emoji.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  }

  /** Выбор стикера (#143): мгновенная отправка отдельным сообщением — мимо
   *  textarea и гейтов canSubmit (стикер самодостаточен, модель Telegram);
   *  панель пикера не закрывается (можно поставить серию). */
  function pickSticker(payload: StickerSubmitPayload) {
    onSubmit({ text: '', attachments: [], reply: null, edit: null, sticker: payload });
    requestScrollEnd();
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files);
    if (files.length === 0) return;
    // Хост запретил вложения (панельные исключения) — вежливая подсказка
    // вместо ошибки загрузки.
    if (!attachmentsEnabled) {
      toast(ui.chat.attachFile);
      return;
    }
    event.preventDefault();
    addFiles(focusId, files);
  }

  return { insertEmoji, pickSticker, onPaste };
}
