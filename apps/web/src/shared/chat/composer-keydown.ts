import type { KeyboardEvent } from 'react';

import { useChatDrafts } from './chat-drafts.js';
import { mentionAutocompleteKeydown } from './composer-mention-autocomplete.js';
import { mentionIndexAtKey, type DraftMention } from './composer-mention-registry.js';
import { useForwardPending } from './forward-pending.js';
import { isSendShortcut } from './send-keys.js';

/**
 * Клавиатура композера чата (I5-сплит из chat-composer.tsx, #224): единый
 * keydown-конвейер поля — атомарное удаление чипа-токена, автокомплит
 * @упоминаний, шорткат отправки, Esc-каскад режимов, ↑-правка последнего.
 */

/** Контекст композера, необходимый клавиатуре (всё — замыкания хоста). */
export interface ComposerKeyboardCtx {
  focusId: string;
  text: string;
  /** Реестр чипов черновика + удаление по индексу (#228). */
  mentions: DraftMention[];
  removeMention: (index: number) => void;
  /** Панель @упоминаний: состояние + выбор/закрытие. */
  autocomplete: {
    open: boolean;
    count: number;
    active: number;
    setActive: (i: number) => void;
    pick: (i: number) => void;
    dismiss: () => void;
  };
  submit: () => void;
  /** Режимы Esc-каскада: пересылка / ответ / правка. */
  pendingForward: boolean;
  hasReply: boolean;
  hasEdit: boolean;
  /** ↑ на пустом поле — править последнее своё (Telegram). */
  onEditLast?: () => void;
}

export function composerKeyDown(
  event: KeyboardEvent<HTMLTextAreaElement>,
  ctx: ComposerKeyboardCtx,
): void {
  // Атомарное удаление чипа (#224/#228): Backspace/Delete у диапазона
  // сносят чип ЦЕЛИКОМ — label не разбирается посимвольно.
  if (
    (event.key === 'Backspace' || event.key === 'Delete') &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    const el = event.currentTarget;
    if (el.selectionStart === el.selectionEnd) {
      const index = mentionIndexAtKey(ctx.mentions, el.selectionStart ?? 0, event.key);
      if (index !== null) {
        const start = ctx.mentions[index]!.start;
        event.preventDefault();
        ctx.removeMention(index);
        requestAnimationFrame(() => {
          const next = el; // элемент жив, менялось только value
          next.setSelectionRange(start, start);
        });
        return;
      }
    }
  }
  // Автокомплит @упоминаний (#176): Enter выбирает (НЕ отправляет), ↑↓ по
  // списку, Esc гасит панель; Slack.
  const eaten = mentionAutocompleteKeydown(
    event,
    ctx.autocomplete,
    ctx.autocomplete.pick,
    ctx.autocomplete.dismiss,
  );
  if (eaten) return;
  if (isSendShortcut(event.key, event.shiftKey, event.ctrlKey)) {
    event.preventDefault();
    ctx.submit();
    return;
  }
  // Esc-каскад (канон Discord): сначала режимы композера (пересылка —
  // верхний, самый сиюминутный); preventDefault не даёт SliderPanel закрыть
  // карточку (фильтр канона #71).
  if (event.key === 'Escape') {
    const store = useChatDrafts.getState();
    if (ctx.pendingForward) {
      event.preventDefault();
      useForwardPending.getState().clear(ctx.focusId);
    } else if (ctx.hasReply) {
      event.preventDefault();
      store.cancelReply(ctx.focusId);
    } else if (ctx.hasEdit) {
      event.preventDefault();
      store.cancelEdit(ctx.focusId);
    }
    return;
  }
  // ↑ на пустом поле — править последнее своё (официальный шорткат Telegram).
  if (
    event.key === 'ArrowUp' &&
    !event.shiftKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    ctx.text.length === 0 &&
    !ctx.hasEdit &&
    !ctx.hasReply &&
    !ctx.pendingForward &&
    ctx.onEditLast
  ) {
    event.preventDefault();
    ctx.onEditLast();
  }
}
