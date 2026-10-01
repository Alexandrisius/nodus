import { Forward } from 'lucide-react';
import type { ForwardedFrom, ReplyPreview } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { withoutPatronymic } from '../lib/format.js';
import { personTone } from '../ui/person-tone.js';

/**
 * Шапки пузыря (A2/A7, #87): цитата ответа и атрибуция пересылки.
 * Плоско, на currentColor — шапка наследует тон пузыря (свой default /
 * чужой card), акцентная линия слева (структура ступенью тона, канон).
 * Обе кликабельны — прыжок к оригиналу + вспышка (jump-store).
 */

/** Цитата ответа: ЗАМОРОЖЕННЫЙ снапшот (вердикт 24.09) — автор + сниппет
 *  или «фрагмент» частичной цитаты; удалённый оригинал → placeholder
 *  (канон Telegram lng_deleted_message). Клик (#163, вердикт владельца
 *  30.09): оригинал-надгробие (deleted, не obliterated) — прыжок к пузырю
 *  «Сообщение удалено» с подсветкой; бесследно исчезнувший — no-op.
 *  Бар — акцент поверхности (#127, канон Telegram: msgOutReplyBarColor
 *  / msgInReplyBarColor); ИМЯ цитируемого — персональный цвет автора
 *  (#180, модель Telegram: identity в любом хосте имени; удалённый
 *  оригинал без автора — прежний акцент поверхности); сниппет и hover —
 *  на currentColor пузыря. */
export function ReplyHeader({
  reply,
  onClick,
  onFilled = false,
}: {
  reply: ReplyPreview;
  onClick?: () => void;
  /** Цитата внутри залитого своего пузыря — акцент пузыря вместо info. */
  onFilled?: boolean;
}) {
  const snippet = reply.quoteText
    ? `«${reply.quoteText}»`
    : reply.text ||
      (reply.attachmentKind === 'image'
        ? ui.chat.quotePhoto
        : reply.attachmentKind === 'file'
          ? ui.chat.quoteFile
          : reply.attachmentKind === 'sticker'
            ? ui.chat.stickerPreview
            : '');
  // Кликабельна: живой оригинал ИЛИ надгробие (#163). obliterated — нет якоря.
  const interactive = (!reply.deleted || !reply.obliterated) && onClick !== undefined;
  const Tag = interactive ? 'button' : 'span';
  return (
    <Tag
      {...(interactive ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'flex min-w-0 max-w-full items-stretch gap-1.5 rounded-md text-left',
        // pr-2 только у кликабельной: плашка ховера шириной в самую широкую
        // строку пузыря (репро 30.09) — без воздухa справа она упирается
        // ровно в последний глиф сниппета (баг-репорт владельца 30.09).
        interactive && 'pr-2 transition-colors hover:bg-current/10',
      )}
    >
      <span
        aria-hidden
        className={cn('w-0.5 shrink-0 rounded-full', onFilled ? 'bg-bubble-out-accent' : 'bg-info')}
      />
      <span className="flex min-w-0 flex-col py-0.5">
        <span
          className={cn(
            'truncate text-xs font-semibold',
            reply.author
              ? personTone(reply.author.id)
              : onFilled
                ? 'text-bubble-out-accent'
                : 'text-info',
          )}
        >
          {reply.deleted
            ? ui.chat.deletedPlaceholder
            : withoutPatronymic(reply.author?.displayName ?? '')}
        </span>
        {reply.deleted ? null : (
          <span
            className={cn(
              'truncate text-xs',
              // На залитом пузыре сниппет плотнее (opacity-80): 70% foreground
              // на тёмной заливке не дотягивал AA (валидатор #127).
              onFilled ? 'opacity-80' : 'opacity-70',
            )}
          >
            {snippet}
          </span>
        )}
      </span>
    </Tag>
  );
}

/** «Переслано от X» (канон Telegram lng_forwarded): имя источника —
 *  ПЕРСОНАЛЬНЫЙ цвет автора пересылки (#180, identity в любом хосте
 *  имени; было info-тон); клик — переход к оригиналу (с учётом прав). */
export function ForwardedHeader({ from, onClick }: { from: ForwardedFrom; onClick?: () => void }) {
  return (
    <span className="flex min-w-0 items-center gap-1 text-xs">
      <Forward className="size-3 shrink-0 text-muted-foreground" strokeWidth={1.75} />
      <span className="shrink-0 text-muted-foreground">{ui.chat.forwardedFrom}</span>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className={cn(
            'min-w-0 truncate font-semibold transition-opacity hover:opacity-80',
            personTone(from.author.id),
          )}
        >
          {withoutPatronymic(from.author.displayName)}
        </button>
      ) : (
        <span className={cn('min-w-0 truncate font-semibold', personTone(from.author.id))}>
          {withoutPatronymic(from.author.displayName)}
        </span>
      )}
    </span>
  );
}
