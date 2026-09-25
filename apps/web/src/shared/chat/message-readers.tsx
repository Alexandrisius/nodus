import type { ChatMessage } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Tooltip, TooltipContent, TooltipTrigger } from '@nodus/ui/components/tooltip';
import { cn } from '@nodus/ui/lib/utils';

import { useConversations } from './api.js';
import { PersonAvatar } from '../ui/person-avatar.js';

const MAX_AVATARS = 5;

/**
 * Прочитавшие СВОИХ сообщений (#102, реф Битрикс24/Telegram): галочка
 * «прочитано» — по первому прочитавшему, под сообщением — строка прочитавших.
 * В direct/«Заметках» строки НЕТ (только галочки меты); тип беседы читается
 * из кэша списка бесед (без проброса пропов сквозь ленты).
 *
 * membersPreview живого API — участники КРОМЕ зрителя (conversation-item
 * .mapper); для своих сообщений зритель = автор, но веб-моки кладут в
 * membersPreview и автора — M фильтруется по автору, устойчиво к обоим
 * форматам. Беседы нет в кэше (карточка без списка) — строку не показываем,
 * пока тип не известен (direct не мигает).
 */
export function useReadersVisibility(
  conversationId: string,
  authorId: string,
): {
  show: boolean;
  memberCount?: number;
} {
  const { data } = useConversations();
  const conversation = data?.items.find((c) => c.id === conversationId);
  if (!conversation) {
    return { show: false };
  }
  return {
    show: conversation.type !== 'direct',
    // M = участники без автора («Прочитано N из M»).
    memberCount: Math.max(conversation.membersPreview.filter((m) => m.id !== authorId).length, 1),
  };
}

/**
 * Строка прочитавших под СВОИМ сообщением: стек аватарок с тултипами ФИО +
 * подпись «Прочитано N» (буквальный критерий #102: «у поста сразу галочка и
 * „Прочитано 1“ + аватар»), при >5 — «Прочитано N из M» и первые аватарки
 * (длинные списки на полный штат целиком не рендерим — спека #102). Пустой
 * readBy → null (ничего не занимает и не рвёт серии).
 */
export function MessageReaders({
  message,
  className,
}: {
  message: ChatMessage;
  className?: string;
}) {
  const { show, memberCount } = useReadersVisibility(message.conversationId, message.author.id);
  const readers = message.readBy;
  if (!show || readers.length === 0) {
    return null;
  }
  const shown = readers.slice(0, MAX_AVATARS);
  const label =
    readers.length > MAX_AVATARS && memberCount !== undefined
      ? `${ui.chat.readByLabel} ${readers.length} ${ui.chat.readByOf} ${memberCount}`
      : `${ui.chat.readByLabel} ${readers.length}`;

  return (
    <div
      data-slot="message-readers"
      className={cn('flex items-center gap-1.5 text-badge text-muted-foreground', className)}
    >
      <span className="flex -space-x-1">
        {shown.map((reader) => (
          <Tooltip key={reader.id}>
            <TooltipTrigger asChild>
              <span className="cursor-default">
                <PersonAvatar
                  name={reader.displayName}
                  avatarUrl={reader.avatarUrl}
                  className="size-4 rounded-full ring-1 ring-background"
                  fallbackClass="text-[7px]"
                />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">{reader.displayName}</TooltipContent>
          </Tooltip>
        ))}
      </span>
      <span className="font-mono tabular-nums">{label}</span>
    </div>
  );
}
