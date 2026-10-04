import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';
import { toast } from 'sonner';

import { useUpdateFavorite } from './favorites-api.js';
import { ReactionGlyph } from './reaction-glyph.js';
import { ReactionPicker } from './reaction-picker.js';
const LABEL_LIMIT = 20;

/** Личные тэги-эмодзи (модель Telegram Premium, набор владельца 04.10 р.5):
 *  звёздочка — база пилюли, компактный ряд раскрывается шевроном. */
export const TAG_BASE = '⭐';
export const TAG_QUICK = ['⭐', '✍️', '💡', '📁', '✅', '📅', '🔥'];
export const TAG_MORE = ['⚡', '❓', '📰', '✈️', '📚', '📂'];

/**
 * Личные эмодзи-тэги сообщения витрины «Избранного» (#171, ревизия 04.10
 * р.5): ЕДИНЫЙ слой на всём потоке — и на записях, и на карточках; публичных
 * реакций в витрине нет. Ховер-пилюля + компактная панель с раскрытием —
 * ТОТ же ReactionPicker (генерализован layer-пропами), база — ⭐: клик по
 * пилюле ставит/снимает звезду-тэг. Тэг на записи без закладки — апсерт
 * (useUpdateFavorite: 404 → POST → PATCH; записи «Избранного» сервером
 * разрешены с этой ревизии). Видны только владельцу.
 */
export function FavoriteLabels({
  labels,
  messageId,
  atEnd,
}: {
  /** Состав тэгов цели (карточка ИЛИ тэг-строка записи). */
  labels: string[];
  messageId: string;
  atEnd: boolean;
}) {
  const update = useUpdateFavorite();

  function toggle(emoji: string) {
    const has = labels.includes(emoji);
    if (!has && labels.length >= LABEL_LIMIT) {
      toast(ui.chat.favoriteLabelLimit);
      return;
    }
    update.mutate({
      messageId,
      body: {
        labels: has ? labels.filter((label) => label !== emoji) : [...labels, emoji],
      },
    });
  }

  return (
    <ReactionPicker
      atEnd={atEnd}
      quickItems={TAG_QUICK}
      moreItems={TAG_MORE}
      baseEmoji={TAG_BASE}
      isActive={(emoji) => labels.includes(emoji)}
      onPick={toggle}
      ariaLabel={ui.chat.favoriteLabelsTitle}
    />
  );
}

/** Ряд «моих» тэгов сообщения: чипы в стиле mine-реакций (клик — снять).
 *  Рендерится строкой реакций псевдо-сообщения/записи в витрине. */
export function FavoriteLabelChips({
  labels,
  messageId,
  onFilled = false,
}: {
  labels: string[];
  messageId: string;
  onFilled?: boolean;
}) {
  const update = useUpdateFavorite();
  if (labels.length === 0) return null;
  function remove(emoji: string) {
    update.mutate({
      messageId,
      body: { labels: labels.filter((label) => label !== emoji) },
    });
  }
  return (
    <span className="flex flex-wrap gap-1">
      {labels.map((emoji) => (
        <button
          key={emoji}
          type="button"
          aria-pressed
          aria-label={`${emoji} ${ui.chat.favoriteLabelsTitle}`}
          onClick={() => remove(emoji)}
          className={cn(
            'reaction-pop inline-flex cursor-pointer items-center rounded-full border px-2 py-0.5 font-mono text-label-sm transition-colors',
            onFilled
              ? 'border-bubble-out-accent/50 bg-bubble-out-accent/20 text-bubble-out-foreground'
              : 'border-info/40 bg-info-soft/60 text-info',
          )}
        >
          <ReactionGlyph emoji={emoji} className="size-4" />
        </button>
      ))}
    </span>
  );
}
