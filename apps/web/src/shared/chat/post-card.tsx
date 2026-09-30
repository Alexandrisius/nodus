import { ArrowRight } from 'lucide-react';
import type { ChatMessage } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { formatTime, plural, withoutPatronymic } from '../lib/format.js';
import { PersonAvatar } from '../ui/person-avatar.js';
import { attachmentsContentWidth, MessageAttachments } from './attachments.js';
import { MessageReactions } from './chat-message.js';
import { messageSurface } from './message-surface.js';
import { MessageMeta } from './message-meta.js';
import { MessageText } from './message-text.js';
import { ReactionPicker } from './reaction-picker.js';
import { StickerGlyph, stickerAttachmentOf } from './sticker-message.js';
import { StickerWindowTrigger } from './sticker-pack-window.js';
import { MessageTombstone } from './tombstone.js';

/** «N ответов» — полоса поста (ед./мн. по правилам ru). */
function repliesLabel(count: number): string {
  return `${count} ${plural(count, [ui.chat.repliesOne, ui.chat.repliesFew, ui.chat.repliesMany])}`;
}

/**
 * Карточка поста канала — ЕДИНАЯ сущность «сообщение» для ленты новостей
 * (#127): поверхность из общей точки решения (message-surface), мягкая
 * карточка БЕЗ хвостика. Вердикт владельца 30.09 (#164, без отдельного
 * issue): аватар вынесен в колонку слева, как у пузырей чата — рендер
 * поста идёт через тот же run-grid (MessageRunView), один пост = серия
 * из одного сообщения; sticky-аватар достаётся высоким постам бесплатно.
 * Имя автора остаётся ПЕРВОЙ строкой карточки (пост самодостаточен, серий
 * у новостей нет).
 *
 * Надгробие удалённого поста (#163 «по ответам»): пост с живым тредом
 * остаётся двухуровневой карточкой — сверху приглушённая строка «Сообщение
 * удалено», снизу ТА ЖЕ полоса обсуждения (участники, «N ответов ·
 * Обсудить», кнопка) — доступ к обсуждениям сохраняется. Без живых ответов
 * сервер убирает пост бесследно (obliterated), надгробия не возникает.
 */
export function PostCard({
  message,
  mine,
  atEnd,
  showName,
  repliesCount,
  participants,
  lastReplyAt,
  threadUnread,
  reactionsHidden,
  onOpenThread,
}: {
  message: ChatMessage;
  mine: boolean;
  /** «По обе стороны»: свой пост прижат вправо (аватар — справа, зеркало run-grid). */
  atEnd: boolean;
  /** Имя автора первой строкой — только у ПЕРВОГО поста серии (канон чатов,
   *  вердикт владельца 30.09: у постов одного автора подряд один аватар);
   *  у остальных — sr-only автор для скринридера. */
  showName: boolean;
  repliesCount: number;
  participants: ChatMessage['author'][];
  lastReplyAt: string | null;
  /** Точка «есть новые» в треде (наблюдателю, раунд 3). */
  threadUnread: boolean;
  /** Режим выделения: реакции недоступны (#132 р.4). */
  reactionsHidden: boolean;
  onOpenThread: () => void;
}) {
  const surface = messageSurface(mine);
  const sticker = stickerAttachmentOf(message);

  // Надгробие: контент обнулён сервером (текст/вложения/реакции), действий
  // нет — остаётся шапка автора, строка удаления и полоса обсуждения.
  if (message.deletedAt) {
    return (
      <div
        className={cn(
          surface.fill,
          'relative w-fit max-w-2xl rounded-xl border border-border p-3.5 text-left',
        )}
        data-slot="post-surface"
        data-surface={surface.tone}
      >
        {/* В надгробии имя — ВСЕГДА (не по серии): контент пуст, авторство —
            единственная опора цепочки обсуждения (#163). */}
        <span className="block text-sm font-medium">
          {withoutPatronymic(message.author.displayName)}
        </span>
        <span className="mt-2 block">
          <MessageTombstone mine={mine} />
        </span>
        {repliesCount > 0 ? (
          <button
            type="button"
            onClick={onOpenThread}
            className="-mx-3.5 -mb-3.5 mt-2.5 flex h-8 w-[calc(100%+1.75rem)] cursor-pointer items-center gap-2 rounded-b-[0.8125rem] border-t border-border/60 bg-current/10 px-3.5 text-left transition-colors hover:bg-current/20"
          >
            <ThreadStrip
              surface={surface}
              participants={participants}
              repliesCount={repliesCount}
              lastReplyAt={lastReplyAt}
              threadUnread={threadUnread}
            />
            <span
              className={cn(
                'ml-auto inline-flex items-center gap-1 text-xs font-medium',
                surface.linkText,
              )}
            >
              {ui.chat.toThread}
              <ArrowRight className="size-3" strokeWidth={1.75} />
            </span>
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        // Р.7: завершение выделения текста — НЕ клик по карточке; интерактивы
        // (галерея, реакции, ссылки) отсекаются гардой.
        if (!window.getSelection()?.isCollapsed) return;
        const interactive = (e.target as HTMLElement).closest('button, a, input, [role="button"]');
        if (interactive && interactive !== e.currentTarget) return;
        onOpenThread();
      }}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpenThread();
        }
      }}
      className={cn(
        surface.fill,
        'relative w-fit max-w-2xl cursor-pointer rounded-xl border border-border p-3.5 text-left transition-colors hover:border-input group/msg group/bubble',
      )}
      data-slot="post-surface"
      data-surface={surface.tone}
    >
      {/* Автор — первая строка карточки, только у первого поста серии; у
          остальных — sr-only (AT не теряет автора, как в пузырях чатов). */}
      {showName ? (
        <span className="block text-sm font-medium">
          {withoutPatronymic(message.author.displayName)}
        </span>
      ) : (
        <span className="sr-only">{message.author.displayName}: </span>
      )}
      {/* Стикер-пост (#143): глиф вместо вложений-карточек. */}
      {sticker ? (
        <span className="mt-2 block w-fit">
          <StickerWindowTrigger message={message} attachment={sticker}>
            <StickerGlyph
              url={sticker.url ?? ''}
              mime={sticker.mime}
              alt={sticker.sticker?.packTitle}
              className="size-24 object-contain"
            />
          </StickerWindowTrigger>
        </span>
      ) : message.attachments.length > 0 ? (
        // Ширина блока вложений детерминирована (#150): карточки/медиа задают
        // ширину поста, а не наоборот.
        <span
          className="mt-2 block max-w-full"
          style={{ width: attachmentsContentWidth(message.attachments) ?? undefined }}
        >
          <MessageAttachments message={message} mine={mine} />
        </span>
      ) : null}
      {/* Текст — MessageText (р.6): старт на тексте даёт нативное выделение,
          выход за карточку превращает жест в выделение поста целиком. */}
      <span className="mt-2 block text-sm leading-relaxed">
        <MessageText text={message.text} />
      </span>
      {/* Мета — общая с пузырём чата композиция (#96): реакции слева,
          пин/«изменено»/время/галочки справа, микро-кегль. */}
      <span className="mt-[3px] flex items-end gap-2">
        <MessageReactions message={message} onFilled={surface.onFilled} />
        <MessageMeta
          message={message}
          onFilled={surface.onFilled}
          ticks={mine}
          className="ml-auto"
        />
      </span>
      {/* Полоса обсуждения — ПОСТОЯННАЯ высота h-8 (вердикт 28.09): аватарки
          size-5 центрируются, текстовая строка 16px — прыжков высоты нет. */}
      <span className="-mx-3.5 -mb-3.5 mt-[6px] flex h-8 items-center gap-2 rounded-b-[0.8125rem] border-t border-border/60 bg-current/10 px-3.5">
        <ThreadStrip
          surface={surface}
          participants={participants}
          repliesCount={repliesCount}
          lastReplyAt={lastReplyAt}
          threadUnread={threadUnread}
        />
        <span
          className={cn(
            'ml-auto inline-flex items-center gap-1 text-xs font-medium',
            surface.linkText,
          )}
        >
          {ui.chat.toThread}
          <ArrowRight className="size-3" strokeWidth={1.75} />
        </span>
      </span>
      {/* Ховер-кнопка реакций поста (#124 → #132); в селекте недоступны. */}
      {reactionsHidden ? null : <ReactionPicker message={message} atEnd={atEnd} />}
    </div>
  );
}

/** Нижняя полоса обсуждения (в живом посте — хвост карточки, в надгробии —
 *  содержимое кнопки): участники треда, счётчик с точкой «есть новые»,
 *  время последнего ответа. */
function ThreadStrip({
  surface,
  participants,
  repliesCount,
  lastReplyAt,
  threadUnread,
}: {
  surface: ReturnType<typeof messageSurface>;
  participants: ChatMessage['author'][];
  repliesCount: number;
  lastReplyAt: string | null;
  threadUnread: boolean;
}) {
  return (
    <>
      {participants.length > 0 ? (
        <span className="flex shrink-0 -space-x-1.5">
          {participants.slice(0, 3).map((p) => (
            <PersonAvatar
              key={p.id}
              name={p.displayName}
              className={cn('size-5 ring-2', surface.ring)}
            />
          ))}
        </span>
      ) : null}
      {/* Счётчик — ТОЛЬКО при ответах (баг-вердикт 30.09: «0 ответов» в пустой
          полосе — мусор; раньше было пусто, остаётся пусто). */}
      {repliesCount > 0 ? (
        <span
          className={cn(
            'flex items-center gap-1.5 font-mono text-label-sm tabular-nums',
            // Тон счётчика — тон поверхности (AA на любой заливке, валидатор #127).
            surface.stripText,
          )}
        >
          {threadUnread ? (
            <span
              aria-label={ui.chat.threadUnreadHint}
              className={cn('size-1.5 shrink-0 rounded-full', surface.accentBg)}
            />
          ) : null}
          {repliesLabel(repliesCount)}
          {lastReplyAt ? ` · ${formatTime(lastReplyAt)}` : ''}
        </span>
      ) : null}
    </>
  );
}
