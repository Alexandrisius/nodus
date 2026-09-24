import { ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { ConversationListItem, ConversationType } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Dialog, DialogContent, DialogTitle } from '@nodus/ui/components/dialog';
import { Input } from '@nodus/ui/components/input';
import { cn } from '@nodus/ui/lib/utils';
import { useNavigate } from '@tanstack/react-router';

import { openCardViaBridge } from '../lib/card-bridge.js';
import { useAuthStore } from '../auth-store.js';
import { useConversations, useConversationMessages } from './api.js';
import { focusComposer, hasComposer } from './composer-focus.js';
import { ConversationAvatar } from './conversation-avatar.js';
import { conversationSubtitle, conversationTitle, sortByActivity } from './conversations.js';
import { useForwardDialog, type ForwardRequest } from './dialog-stores.js';
import { forwardFromLabel, forwardScopeKey, useForwardPending } from './forward-pending.js';
import { ThreadLevel } from './forward-thread-picker.js';
import { useSelectionStore } from './selection-store.js';

/**
 * Диалог пересылки (A7, #87; переделка по вердикту владельца 24.09): пикер
 * выбирает ОДНОГО получателя — массовой рассылки НЕТ («зачем нам спам:
 * несколько сообщений одному — да, сообщение нескольким — нет»; модели
 * Telegram и Bitrix24 обе одиночные). Чипы-фильтры категорий (реф Bitrix24:
 «Все / Чаты / Чаты задач / …») + поиск по всем беседам — кросс-сущностная
 * пересылка (вердикт 24.09: «в Битриксе её нет» — у нас есть). Канал — второй
 * уровень «куда поместить» (forward-thread-picker): в ленту постом или в
 * обсуждение поста — тут мы сильнее Bitrix24 (вердикт). Комментария в диалоге
 * НЕТ: после выбора диалог закрывается и получатель получает бар пересылки
 * над полем ввода (модель Bitrix24, седьмой скрин вердикта) — текст поля
 * уйдёт комментарием вместе с блоком. Опций «скрыть отправителя/подписи» НЕТ
 * (корпоратив: атрибуция обязательна).
 */

type FilterId = 'all' | 'chats' | 'tasks' | 'letters' | 'channels';

const FILTERS: { id: FilterId; label: string; types: ConversationType[] | null }[] = [
  { id: 'all', label: ui.chat.filterAll, types: null },
  { id: 'chats', label: ui.chat.filterChats, types: ['direct', 'group'] },
  { id: 'tasks', label: ui.chat.filterTasks, types: ['task'] },
  { id: 'letters', label: ui.chat.filterLetters, types: ['letter'] },
  { id: 'channels', label: ui.chat.filterChannels, types: ['project_channel'] },
];

export function ForwardDialogHost() {
  const request = useForwardDialog((s) => s.request);
  const close = useForwardDialog((s) => s.close);
  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      {/* Высота ФИКСИРОВАНА (research: wix/react-native-ui-lib#3493 — список
          занимает всю оставшуюся высоту, «height will not change when the
          content changes so theres no jump»; primeng#17372 — прыжки панели
          при фильтре = баг): фильтр/поиск/шаг меняют СОДЕРЖИМОЕ списка, не
          габарит окна (баг-вердикт 24.09). */}
      <DialogContent className="flex h-[min(34rem,80vh)] w-full flex-col bg-card sm:max-w-lg [&_[data-slot=dialog-close]]:top-[18px]">
        {request ? (
          <ForwardBody key={request.messageIds.join()} request={request} onDone={close} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ForwardBody({ request, onDone }: { request: ForwardRequest; onDone: () => void }) {
  const meId = useAuthStore((s) => s.user?.id);
  const navigate = useNavigate();
  const { data } = useConversations();
  const { data: sourceData } = useConversationMessages(request.sourceConversationId);
  const [drill, setDrill] = useState<ConversationListItem | null>(null);

  const fromLabel = useMemo(
    () => forwardFromLabel(request.messageIds, sourceData?.items, meId ?? undefined),
    [request.messageIds, sourceData, meId],
  );

  /** Получатель выбран: бар пересылки в его композер, селект снят, диалог
   *  закрыт и «провал» в приёмник: открытый композер — фокус; страница
   *  мессенджера — маршрут (тред — search ?thread=); иначе — полноэкранная
   *  карточка мессенджера поверх текущей (мост стека, ADR-0009). */
  function finalize(conversation: ConversationListItem, threadRootId: string | null) {
    const scopeKey = forwardScopeKey(conversation, threadRootId);
    useForwardPending.getState().set({
      scopeKey,
      conversationId: conversation.id,
      threadRootId,
      sourceConversationId: request.sourceConversationId,
      messageIds: request.messageIds,
      fromLabel,
    });
    useSelectionStore.getState().exit();
    onDone();
    window.setTimeout(() => {
      if (hasComposer(scopeKey)) {
        focusComposer(scopeKey);
        return;
      }
      if (window.location.pathname.startsWith('/chat')) {
        void navigate({
          to: '/chat/$conversationId',
          params: { conversationId: conversation.id },
          search: (prev) => ({ ...prev, thread: threadRootId ?? undefined }),
        });
        return;
      }
      openCardViaBridge({ kind: 'messenger', id: conversation.id });
    }, 0);
  }

  if (drill) {
    return (
      <ThreadLevel
        conversation={drill}
        meId={meId}
        onBack={() => setDrill(null)}
        onPick={(threadRootId) => finalize(drill, threadRootId)}
      />
    );
  }
  return (
    <ConversationLevel
      conversations={sortByActivity(data?.items ?? [])}
      meId={meId}
      onPick={(conversation) => finalize(conversation, null)}
      onDrill={setDrill}
    />
  );
}

function ConversationLevel({
  conversations,
  meId,
  onPick,
  onDrill,
}: {
  conversations: ConversationListItem[];
  meId?: string | null;
  onPick: (conversation: ConversationListItem) => void;
  onDrill: (conversation: ConversationListItem) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterId>('all');
  const filterTypes = FILTERS.find((f) => f.id === filter)?.types ?? null;
  const filtered = conversations.filter(
    (c) =>
      (filterTypes === null || filterTypes.includes(c.type)) &&
      conversationTitle(c, meId).toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <>
      {/* Шаги пикера — строка h-8: центр крестика (top-[18px] + icon-sm)
          совпадает с центром шапки обоих шагов (баг-вердикт 24.09). */}
      <DialogTitle className="flex h-8 items-center text-base font-semibold text-foreground">
        {ui.chat.forwardTitle}
      </DialogTitle>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={ui.chat.forwardSearchPlaceholder}
        className="mt-3 rounded-lg border-input"
        autoFocus
      />
      <span className="mt-2 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition-colors',
              filter === f.id
                ? 'border-info bg-info-soft/40 font-medium text-info'
                : 'border-border text-muted-foreground hover:bg-accent/40 hover:text-foreground',
            )}
          >
            {f.label}
          </button>
        ))}
      </span>
      <ul className="-mx-1 mt-2 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {filtered.length === 0 ? (
          <li className="px-2 py-8 text-center text-xs text-muted-foreground">
            {ui.chat.forwardEmpty}
          </li>
        ) : null}
        {filtered.map((conversation) => {
          const isChannel = conversation.type === 'project_channel';
          return (
            <li key={conversation.id}>
              <button
                type="button"
                onClick={() => (isChannel ? onDrill(conversation) : onPick(conversation))}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent/40"
              >
                <ConversationAvatar conversation={conversation} meId={meId} className="size-9" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {conversationTitle(conversation, meId)}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {conversationSubtitle(conversation)}
                  </span>
                </span>
                {isChannel ? (
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground"
                    strokeWidth={1.75}
                  />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}
