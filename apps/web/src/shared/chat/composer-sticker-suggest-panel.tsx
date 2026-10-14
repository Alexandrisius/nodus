import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import {
  detectEmojiStickerQuery,
  rankStickersByEmoji,
  type SuggestedSticker,
} from './composer-sticker-suggest.js';
import {
  buildStickerAttachment,
  useStickerPacks,
  type StickerSubmitPayload,
} from './sticker-api.js';
import { pushRecentSticker, recentStickers, type RecentSticker } from './sticker-recent.js';
import { StickerGlyph } from './sticker-message.js';

/**
 * Плашка стикеров-подсказок при вводе соло-эмодзи (#294, канон Telegram):
 * в поле ровно один эмодзи — над строкой ввода один ряд стикеров с этим
 * эмодзи (данные — привязки Sticker.emojis #143). Паттерн — автокомплит
 * @упоминаний (#176): панель внутри композера (absolute bottom-full, не
 * порталится, «вечный курсор» живёт в поле), клики — mousedown с
 * preventDefault.
 *
 * Подсветка ТОЛЬКО стрелками (ховер — визуальный, CSS): Enter без стрелок
 * отправляет сообщение, а не стикер — решение владельца #294 (ловушка
 * tdesktop#5927, где Enter угонялся первым стикером). Esc гасит плашку до
 * смены эмодзи в поле (dismissed-эмодзи, модель dismissed-@ #176).
 */

/** Состояние плашки: детект соло-эмодзи + совпадения + клавиатурная
 *  подсветка + выбор стикера (поведение при данных). suppressed — режимы,
 *  где подсказки неуместны (селект, правка, пересылка, открытый
 *  медиа-пикер — его портал z-70 перекрыл бы плашку, а вкладка «Стикеры»
 *  и так рядом). */
export function useStickerSuggest(opts: {
  text: string;
  caret: number;
  suppressed: boolean;
  /** Ключ черновика: выбор из плашки стирает соло-эмодзи (он — весь текст). */
  focusId: string;
  /** Стор-экшн черновика (useChatDrafts.setText). */
  setText: (key: string, text: string) => void;
  /** Отправка стикера хостом (pickSticker композера): ответ-стикером
   *  работает (#288), лента оптимистична. */
  submitSticker: (payload: StickerSubmitPayload) => void;
}) {
  const emoji = detectEmojiStickerQuery(opts.text, opts.caret);
  // dismissed-эмодзи: Esc закрыл — не откроется снова, пока в поле не
  // появится другой эмодзи; очистка поля сбрасывает (перебор и повторный
  // ввод того же эмодзи — новое намерение, модель Telegram). state, не
  // ref: скрытие обязано быть в рендере, не ждать чужого обновления.
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    setActive(null);
    if (emoji === null) setDismissed(null);
  }, [emoji]);

  // Паки — лениво, при первом соло-эмодзи (не каждым монтированием
  // композера; кэш TanStack делает повторные открытия мгновенными).
  const packsQuery = useStickerPacks({ enabled: emoji !== null });
  // Недавние — localStorage, перечитываются на смену эмодзи: выбор из
  // плашки чистит поле (эмодзи → null) и подтягивает новый порядок.
  const [recents, setRecents] = useState<RecentSticker[]>(() => recentStickers());
  useEffect(() => {
    setRecents(recentStickers());
  }, [emoji]);

  const matches = useMemo<SuggestedSticker[]>(
    () => (emoji ? rankStickersByEmoji(packsQuery.data?.items ?? [], recents, emoji) : []),
    [packsQuery.data, recents, emoji],
  );

  /** Выбор стикера из плашки (#294): эмодзи стирается, стикер уходит через
   *  submitSticker хоста, «Недавние» пополняются (порядок плашки обновится
   *  на эффекте смены эмодзи — поле стало пустым). */
  function pick(index: number) {
    const match = matches[index];
    if (!match) return;
    pushRecentSticker(match.sticker, match.pack);
    opts.setText(opts.focusId, '');
    opts.submitSticker({
      stickerId: match.sticker.id,
      attachment: buildStickerAttachment(match.sticker, match.sticker.emojis, match.pack),
    });
  }

  return {
    emoji,
    matches,
    active,
    setActive,
    pick,
    open: emoji !== null && !opts.suppressed && emoji !== dismissed && matches.length > 0,
    dismiss: () => setDismissed(emoji),
  };
}

/** Обработка клавиш плашки: возвращает true, если событие съедено. Стрелки
 *  (←→↑↓ с заворотом) — подсветка; Enter выбирает ТОЛЬКО подсвеченный
 *  стрелками стикер (чистый Enter — обычная отправка, решение владельца
 *  #294); Esc — спрятать. */
export function stickerSuggestKeydown(
  event: KeyboardEvent<HTMLTextAreaElement>,
  state: {
    open: boolean;
    count: number;
    active: number | null;
    setActive: (i: number | null) => void;
    pick: (i: number) => void;
    dismiss: () => void;
  },
): boolean {
  if (!state.open || state.count === 0) return false;
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      event.preventDefault();
      state.setActive(
        state.active === null || state.active >= state.count - 1 ? 0 : state.active + 1,
      );
      return true;
    case 'ArrowLeft':
    case 'ArrowUp':
      event.preventDefault();
      state.setActive(
        state.active === null || state.active <= 0 ? state.count - 1 : state.active - 1,
      );
      return true;
    case 'Enter':
      if (state.active !== null && !event.shiftKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        state.pick(state.active);
        return true;
      }
      return false;
    case 'Escape':
      event.preventDefault();
      state.dismiss();
      return true;
    default:
      return false;
  }
}

/** Плашка-ряд стикеров: absolute над строкой ввода, один ряд фиксированной
 *  высоты с горизонтальным скроллом (канон пикеров — габарит не прыгает),
 *  НЕ перехватывает фокус (клики — mousedown с preventDefault, каретка в
 *  поле). Ховер подсвечивает визуально, клавиатурная подсветка — отдельно. */
export function StickerSuggestPanel({
  matches,
  active,
  onPick,
}: {
  matches: SuggestedSticker[];
  active: number | null;
  onPick: (index: number) => void;
}) {
  const cells = useRef(new Map<number, HTMLButtonElement>());
  useEffect(() => {
    if (active === null) return;
    cells.current.get(active)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  return (
    <div
      role="listbox"
      aria-label={ui.chat.stickerSuggestLabel}
      className="composer-reveal absolute bottom-full left-0 z-20 mb-1.5 flex w-fit max-w-full items-center gap-0.5 overflow-x-auto overscroll-x-contain rounded-2xl border border-border bg-popover p-1 text-popover-foreground shadow-sm"
    >
      {matches.map((match, i) => (
        <button
          key={match.sticker.id}
          ref={(el) => {
            if (el) cells.current.set(i, el);
            else cells.current.delete(i);
          }}
          type="button"
          role="option"
          aria-selected={i === active}
          title={match.pack.title}
          onMouseDown={(e) => {
            e.preventDefault(); // каретка остаётся в textarea
            onPick(i);
          }}
          className={cn(
            'flex size-16 shrink-0 cursor-pointer items-center justify-center rounded-lg p-1 transition-colors',
            i === active ? 'bg-accent' : 'hover:bg-accent/60',
          )}
        >
          <StickerGlyph
            url={match.sticker.url}
            mime={match.sticker.mime}
            alt={match.pack.title}
            className="size-14 object-contain"
          />
        </button>
      ))}
    </div>
  );
}
