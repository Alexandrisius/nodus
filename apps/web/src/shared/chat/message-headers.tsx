import { Forward } from 'lucide-react';
import type { ForwardedFrom, ReplyPreview } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

/**
 * Шапки пузыря (A2/A7, #87): цитата ответа и атрибуция пересылки.
 * Плоско, на currentColor — шапка наследует тон пузыря (свой default /
 * чужой card), акцентная линия слева (структура ступенью тона, канон).
 * Обе кликабельны — прыжок к оригиналу + вспышка (jump-store).
 */

/** Цитата ответа: ЗАМОРОЖЕННЫЙ снапшот (вердикт 24.09) — автор + сниппет
 *  или «фрагмент» частичной цитаты; удалённый оригинал → placeholder
 *  (канон Telegram lng_deleted_message), клик — no-op. */
export function ReplyHeader({ reply, onClick }: { reply: ReplyPreview; onClick?: () => void }) {
  const snippet = reply.quoteText
    ? `«${reply.quoteText}»`
    : reply.text ||
      (reply.attachmentKind === 'image'
        ? ui.chat.quotePhoto
        : reply.attachmentKind === 'file'
          ? ui.chat.quoteFile
          : '');
  const interactive = !reply.deleted && onClick !== undefined;
  const Tag = interactive ? 'button' : 'span';
  return (
    <Tag
      {...(interactive ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'flex min-w-0 max-w-full items-stretch gap-1.5 rounded-md text-left',
        interactive && 'transition-colors hover:bg-current/10',
      )}
    >
      <span aria-hidden className="w-0.5 shrink-0 rounded-full bg-current opacity-55" />
      <span className="flex min-w-0 flex-col py-0.5">
        <span className="truncate text-xs font-semibold opacity-90">
          {reply.deleted ? ui.chat.deletedPlaceholder : (reply.author?.displayName ?? '')}
        </span>
        {reply.deleted ? null : <span className="truncate text-xs opacity-70">{snippet}</span>}
      </span>
    </Tag>
  );
}

/** «Переслано от X» (канон Telegram lng_forwarded): имя источника — info-тон
 *  (атрибуция = данные, не хром); клик — переход к оригиналу (с учётом прав). */
export function ForwardedHeader({ from, onClick }: { from: ForwardedFrom; onClick?: () => void }) {
  return (
    <span className="flex min-w-0 items-center gap-1 text-xs">
      <Forward className="size-3 shrink-0 text-muted-foreground" strokeWidth={1.75} />
      <span className="shrink-0 text-muted-foreground">{ui.chat.forwardedFrom}</span>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="min-w-0 truncate font-semibold text-info transition-opacity hover:opacity-80"
        >
          {from.author.displayName}
        </button>
      ) : (
        <span className="min-w-0 truncate font-semibold text-info">{from.author.displayName}</span>
      )}
    </span>
  );
}
