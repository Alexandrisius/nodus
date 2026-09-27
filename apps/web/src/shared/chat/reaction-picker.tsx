import { ChevronDown, SmilePlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Popover, PopoverContent, PopoverTrigger } from '@nodus/ui/components/popover';
import { cn } from '@nodus/ui/lib/utils';

import { useReactionToggle } from './message-mutations.js';
import { ReactionGlyph } from './reaction-glyph.js';
import { REACTION_MORE, REACTION_QUICK } from './reaction-presets.js';

/** Задержка закрытия при переезде курсора с кнопки на панель (hover-intent). */
const CLOSE_GRACE_MS = 180;

/**
 * Ховер-попап реакций (#124, референс владельца: Битрикс24/Telegram, вердикты
 * 27.09): кнопка SmilePlus в НИЖНЕМ углу пузыря (открывается НАВЕДЕНИЕМ, не
 * кликом); панель встаёт ПОД кнопку (side=bottom), поэтому раскрытие сетки
 * «выезжает» вниз из-под быстрого ряда, а не перепрыгивает (grid-rows
 * анимация). Курсор ушёл — кнопка прячется (opacity-0 вне hover строки).
 * Исключение канона «без кнопок на сообщении» (вердикт 14.09) — реакции
 * ховер-попапом, вердикт 27.09.
 */
export function ReactionPicker({ message, atEnd }: { message: ChatMessage; atEnd: boolean }) {
  const toggle = useReactionToggle(message.conversationId);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const closeTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    [],
  );

  function cancelClose() {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function scheduleClose() {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_GRACE_MS);
  }

  function mineOf(emoji: string): boolean {
    return message.reactions.find((reaction) => reaction.emoji === emoji)?.mine ?? false;
  }

  function pick(emoji: string) {
    toggle.mutate({ messageId: message.id, emoji, remove: mineOf(emoji) });
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Esc/внешний клик закрывают сразу; уход курсора — через scheduleClose.
        setOpen(next);
        if (!next) setExpanded(false);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          data-slot="reaction-picker-trigger"
          aria-label={ui.chat.addReaction}
          title={ui.chat.addReaction}
          onMouseEnter={() => {
            cancelClose();
            setOpen(true);
          }}
          onMouseLeave={scheduleClose}
          className={cn(
            'absolute -bottom-3 z-10 flex size-6 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/msg:opacity-100',
            atEnd ? '-left-2' : '-right-2',
          )}
        >
          <SmilePlus className="size-4" strokeWidth={1.75} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align={atEnd ? 'end' : 'start'}
        sideOffset={4}
        data-slot="reaction-pop"
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
        className="w-auto p-1"
      >
        <div className="flex items-center gap-0.5">
          {REACTION_QUICK.map((emoji) => (
            <EmojiButton key={emoji} emoji={emoji} active={mineOf(emoji)} onPick={pick} />
          ))}
          <button
            type="button"
            aria-label={ui.chat.moreReactions}
            aria-expanded={expanded}
            title={ui.chat.moreReactions}
            onClick={() => setExpanded((value) => !value)}
            className="flex size-10 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronDown
              className={cn('size-4 transition-transform duration-200', expanded && 'rotate-180')}
              strokeWidth={1.75}
            />
          </button>
        </div>
        {/* Раскрытие — панель НА МЕСТЕ, сетка выезжает вниз (grid-rows 0fr→1fr,
            вердикт 27.09 п.5: без перепрыгивания попапа). */}
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-200 ease-out',
            expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="overflow-hidden">
            <div className="mt-1 grid grid-cols-6 gap-0.5 border-t border-border pt-1">
              {REACTION_MORE.map((emoji) => (
                <EmojiButton key={emoji} emoji={emoji} active={mineOf(emoji)} onPick={pick} />
              ))}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Эмодзи выбора ×1.5 к прежнему размеру (вердикт 27.09 п.3): глиф 24px,
 *  анимированный APNG (Fluent, MIT). */
function EmojiButton({
  emoji,
  active,
  onPick,
}: {
  emoji: string;
  active: boolean;
  onPick: (emoji: string) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={emoji}
      onClick={() => onPick(emoji)}
      className={cn(
        'flex size-10 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-110 hover:bg-accent',
        active && 'bg-info-soft/60 hover:bg-info-soft/60',
      )}
    >
      <ReactionGlyph emoji={emoji} className="size-6" />
    </button>
  );
}
