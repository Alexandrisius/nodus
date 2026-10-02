import type { ChatMessage } from '@nodus/contracts';
import { cn } from '@nodus/ui/lib/utils';

import { withoutPatronymic } from '../lib/format.js';
import { personTone } from '../ui/person-tone.js';
import { attachmentsLayout, mediaBubbleWidth, MessageAttachments } from './attachments.js';
import { MessageReactions } from './chat-message.js';
import { messageSurface } from './message-surface.js';
import { MessageMeta } from './message-meta.js';
import { MessageText } from './message-text.js';
import { ThreadStrip, ThreadStripEnter } from './post-thread-strip.js';
import { ReactionPicker } from './reaction-picker.js';
import { StickerGlyph, stickerAttachmentOf, stickerFeedClass } from './sticker-message.js';
import { StickerWindowTrigger } from './sticker-pack-window.js';
import { MessageTombstone } from './tombstone.js';

/**
 * Карточка поста канала — ЕДИНАЯ сущность «сообщение» для ленты новостей
 * (#127): поверхность из общей точки решения (message-surface), мягкая
 * карточка БЕЗ хвостика. Вердикт владельца 30.09 (#164): аватар вынесен в
 * колонку слева, как у пузырей чата — рендер поста идёт через тот же
 * run-grid (MessageRunView), один пост = серия из одного сообщения; имя
 * автора — ПЕРВАЯ строка карточки (только у первого ЧУЖОГО поста серии,
 * свои БЕЗ имени — канон чатов #180).
 *
 * Медиа-стиль Telegram (#187): изображение — ЧАСТЬ карточки, full-bleed
 * (без боковых полей; ширина картинки = ширина карточки), шапка имени и
 * подпись — блоки с полями 10px (#181); потолок ширины — ОТНОСИТЕЛЬНЫЙ
 * min(100%, 42rem): при сужении ленты (окно треда) пост сжимается вместе
 * с ней, а не обрезается справа (баг #187 Ф1а); пропорции картинки держит
 * aspect-ratio плитки (attachment-gallery).
 *
 * Надгробие удалённого поста (#163 «по ответам»): пост с живым тредом
 * остаётся двухуровневой карточкой — сверху приглушённая строка «Сообщение
 * удалено», снизу ТА ЖЕ полоса обсуждения (кнопка) — доступ к обсуждениям
 * сохраняется. Без живых ответов сервер убирает пост бесследно.
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
  /** Имя автора первой строкой — только у ПЕРВОГО ЧУЖОГО поста серии. */
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
  const layout = attachmentsLayout(message.attachments);
  const media = (layout.mode === 'single' || layout.mode === 'gallery') && !sticker;
  // Ширина медиа-поста задаёт вложение (механика Telegram, #150/#187); у
  // поста всегда есть нижняя полоса обсуждения и, как правило, текст — пол
  // колонки текста держим всегда.
  const postWidth = media ? mediaBubbleWidth(message.attachments, { hasTextColumn: true }) : null;

  // Надгробие: контент обнулён сервером (текст/вложения/реакции), действий
  // нет — остаётся шапка автора, строка удаления и полоса обсуждения.
  if (message.deletedAt) {
    return (
      <div
        className={cn(
          surface.fill,
          'relative w-fit max-w-[min(100%,42rem)] overflow-hidden rounded-xl border border-border text-left',
        )}
        data-slot="post-surface"
        data-surface={surface.tone}
      >
        {/* Имя в надгробии — у ЧУЖИХ постов (контент пуст, авторство — опора
            цепочки обсуждения #163); свой удалённый пост БЕЗ имени, как свои
            живые посты (канон чатов #180) — AT получает sr-only. */}
        {showName ? (
          <span
            className={cn(
              '-mt-[3px] block px-2.5 pt-2.5 text-sm leading-[19px] font-semibold',
              personTone(message.author.id),
            )}
          >
            {withoutPatronymic(message.author.displayName)}
          </span>
        ) : (
          <span className="sr-only">{message.author.displayName}: </span>
        )}
        <span className={cn('block px-2.5 pb-2.5', showName ? 'pt-[2px]' : 'pt-[7px]')}>
          <MessageTombstone mine={mine} />
        </span>
        {repliesCount > 0 ? (
          <button
            type="button"
            onClick={onOpenThread}
            className="flex h-8 w-full cursor-pointer items-center gap-2 border-t border-border/60 bg-current/10 px-2.5 text-left transition-colors hover:bg-current/20"
          >
            <ThreadStrip
              surface={surface}
              participants={participants}
              repliesCount={repliesCount}
              lastReplyAt={lastReplyAt}
              threadUnread={threadUnread}
            />
            <ThreadStripEnter surface={surface} />
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
        'relative w-fit max-w-[min(100%,42rem)] cursor-pointer overflow-hidden rounded-xl border border-border text-left transition-colors hover:border-input group/msg group/bubble',
      )}
      data-slot="post-surface"
      data-surface={surface.tone}
      style={postWidth ? { width: postWidth, maxWidth: '100%' } : undefined}
    >
      {/* Автор — первая строка карточки, только у первого ЧУЖОГО поста серии;
          у остальных и у своих — sr-only (AT не теряет автора, как в пузырях
          чатов). Цвет персональный (#180). -mt-[3px] — оптическая компенсация
          воздуха строки имени: визуальный верх = полям 10px (#181). */}
      {showName ? (
        <span
          className={cn(
            '-mt-[3px] block px-2.5 pt-2.5 text-sm leading-[19px] font-semibold',
            personTone(message.author.id),
          )}
        >
          {withoutPatronymic(message.author.displayName)}
        </span>
      ) : (
        <span className="sr-only">{message.author.displayName}: </span>
      )}
      {/* Плотность (#181): поля карточки одинаковые сверху/слева/справа для
          ВСЕГО контента; медиа — full-bleed без полей (#187); имя → контент
          2px (leading-[19px] короб строки #96). */}
      {sticker ? (
        <span className={cn('block w-fit px-2.5 pt-2.5', showName && 'pt-[2px]')}>
          <StickerWindowTrigger message={message} attachment={sticker}>
            <StickerGlyph
              url={sticker.url ?? ''}
              mime={sticker.mime}
              alt={sticker.sticker?.packTitle}
              className={stickerFeedClass}
            />
          </StickerWindowTrigger>
        </span>
      ) : media ? (
        // Медиа — full-bleed: ширина изображения = ширина карточки, боковых
        // полей нет; геометрия детерминирована (#150), сужение — aspect-ratio.
        <MessageAttachments message={message} mine={mine} />
      ) : message.attachments.length > 0 ? (
        <span
          className={cn('block max-w-full px-2.5 pt-2.5', showName && 'pt-[2px]')}
          style={{
            width: mediaBubbleWidth(message.attachments, { hasTextColumn: true }) ?? undefined,
          }}
        >
          <MessageAttachments message={message} mine={mine} />
        </span>
      ) : null}
      {/* Текст — MessageText (р.6): старт на тексте даёт нативное выделение,
          выход за карточку превращает жест в выделение поста целиком.
          Ширина поста — от ВЛОЖЕНИЯ (как пузырь чата): текст поджимается
          под колонку медиа. Первый (без имени/медиа) — оптическая
          компенсация -mt-[3px] (#181). Ритм: текст→мета 3px, мета→полоса 6px. */}
      <span
        className={cn(
          showName || sticker || message.attachments.length > 0
            ? 'block px-2.5 pt-[2px]'
            : 'block px-2.5 pt-[7px]',
          'text-sm',
        )}
      >
        <MessageText text={message.text} />
      </span>
      {/* Мета — общая с пузырём чата композиция (#96): реакции слева,
          пин/«изменено»/время/галочки справа, микро-кегль. */}
      <span className="flex items-end gap-2 px-2.5 pt-[3px]">
        <MessageReactions message={message} onFilled={surface.onFilled} />
        <MessageMeta
          message={message}
          onFilled={surface.onFilled}
          ticks={mine}
          className="ml-auto"
        />
      </span>
      {/* Полоса обсуждения — ПОСТОЯННАЯ высота h-8 (вердикт 28.09): аватарки
          size-5 центрируются, прыжков высоты нет; нижний full-bleed блок. */}
      <span className="mt-[6px] flex h-8 items-center gap-2 border-t border-border/60 bg-current/10 px-2.5">
        <ThreadStrip
          surface={surface}
          participants={participants}
          repliesCount={repliesCount}
          lastReplyAt={lastReplyAt}
          threadUnread={threadUnread}
        />
        <ThreadStripEnter surface={surface} />
      </span>
      {/* Ховер-кнопка реакций поста (#124 → #132); в селекте недоступны. */}
      {reactionsHidden ? null : <ReactionPicker message={message} atEnd={atEnd} />}
    </div>
  );
}
