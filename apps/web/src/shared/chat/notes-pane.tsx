import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, FavoriteCard } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@nodus/ui/components/message-scroller';
import { Empty, EmptyTitle } from '@nodus/ui/components/empty';
import { MessageGroup } from '@nodus/ui/components/message';

import { useAuthStore } from '../auth-store.js';
import { useConversationMessages, useConversations, useSendChatMessage } from './api.js';
import { ChatComposer, type ComposerSubmit } from './chat-composer.js';
import { ChatMessageItem } from './chat-message.js';
import { DayChip } from './day-chip.js';
import { toEditVars } from './message-edit.js';
import { useEditMessage } from './message-mutations.js';
import { FavoriteLabelChips, FavoriteLabels } from './favorite-labels.js';
import { FavoriteMenu } from './favorite-menu.js';
import { favoriteSourceTitle, toFavoriteMessage } from './favorite-message.js';
import { useFavorites } from './favorites-api.js';
import { JumpResponder } from './use-jump-responder.js';
import { MessageMenu } from './message-menu.js';
import { MessageRow } from './message-row.js';
import { buildMessageRuns, formatDayLabel, startsNewDay } from './message-groups.js';
import { MessageRunView } from './message-run.js';
import { mergeNotesFlow } from './notes-flow.js';
import { reconcileServerDraft } from './draft-sync.js';
import { setOpenConversation } from './notifications.js';
import { registerScopeSubmit } from './submit-registry.js';
import { toSendVars } from './composer-submit.js';
import { useFeedSelection, selectionComposerProps } from './use-feed-selection.js';

/**
 * Витрина «Избранного» (#171, ревизия 04.10): беседа с собой = плоский
 * единый поток — свои записи + карточки избранного — КЛАССИЧЕСКИМИ пузырями:
 * один конвейер buildMessageRuns → MessageRunView → ChatMessageItem (серии
 * по автору, дата-чипы, медиа-геометрия #187 — ничего нового не выдумано).
 * Карточка — псевдо-сообщение оригинала: имя автора + подпись источника
 * «из …», личные эмодзи-метки вместо публичных реакций (Ф2). Действия над
 * карточкой — ПКМ-меню (FavoriteMenu): «Показать в чате», «Убрать из
 * избранного»; кнопок на пузыре нет. Поиск/фильтры — правая панель беседы
 * в режиме поиска (лупа в шапке, chat-search-panel). Звезда внутри витрины
 * отсутствует (self-reference): пункт меню и звезда селекта скрыты;
 * пересылка ИЗ витрины работает.
 * Открывается вниз (как каналы, #175), без якоря непрочитанных.
 */
export function NotesPane({ conversationId }: { conversationId: string }) {
  const scope = `conversation:${conversationId}`;
  const listQuery = useConversations();
  const conversation = listQuery.data?.items.find((c) => c.id === conversationId) ?? null;
  const meId = useAuthStore((s) => s.user?.id ?? null);

  // Реконсилейшн серверного черновика — синхронно до рендера композера (#132).
  useState(() => {
    reconcileServerDraft(scope, conversation);
    return true;
  });
  useEffect(() => {
    setOpenConversation(conversationId);
    return () => setOpenConversation(null);
  }, [conversationId]);

  const messagesQuery = useConversationMessages(conversationId);
  const favoritesQuery = useFavorites();
  const send = useSendChatMessage(conversationId, scope);

  const messages = useMemo(
    () => (messagesQuery.data?.items ?? []).filter((m) => !m.deletedAt),
    [messagesQuery.data],
  );
  const cards = useMemo(
    () => (favoritesQuery.data?.pages ?? []).flatMap((page) => page.items),
    [favoritesQuery.data],
  );
  const cardsById = useMemo(() => new Map(cards.map((card) => [card.messageId, card])), [cards]);
  // Дедуп (#171 р.5): сообщение-запись с тэг-строкой рендерится ОДНОЙ
  // строкой (записью с тэгами) — карточку того же messageId в поток не
  // пускаем. Личные тэги — ЕДИНЫЙ слой реакций всей витрины (публичных
  // реакций тут нет): и на записях, и на карточках.
  const feedCards = useMemo(
    () => cards.filter((card) => !messages.some((m) => m.id === card.messageId)),
    [cards, messages],
  );
  const entries = useMemo(() => mergeNotesFlow(messages, feedCards), [messages, feedCards]);
  const items = useMemo(
    () =>
      entries.map((entry) =>
        entry.kind === 'note' ? entry.message : toFavoriteMessage(entry.card),
      ),
    [entries],
  );
  const feedCardIds = useMemo(() => new Set(feedCards.map((card) => card.messageId)), [feedCards]);
  const runs = useMemo(() => buildMessageRuns(items, meId ?? undefined), [items, meId]);

  const selection = useFeedSelection(scope, messages, undefined);
  // Правка в Заметках (#188, находка живой пробы): сообщения витрины — свои,
  // «Редактировать» в меню предлагается — хост обязан маршрутизировать правку
  // (раньше submit уходил отправкой НОВОГО сообщения). Окно правки вложений
  // идёт через реестр с составом (editComposition).
  const edit = useEditMessage(conversationId, scope);
  const editRef = useRef(edit);
  editRef.current = edit;
  // Реестр окна вложений (#144): стабильный колбэк по scope (send/edit — новый
  // объект каждый рендер; mutate стабилен, ref держит актуальный).
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(
    () =>
      registerScopeSubmit(scope, (submit: ComposerSubmit) => {
        if (submit.edit) {
          const vars = toEditVars(submit);
          return vars ? editRef.current.mutateAsync(vars) : Promise.resolve();
        }
        return sendRef.current.mutateAsync(toSendVars(submit));
      }),
    [scope],
  );

  function handleSubmit(submit: ComposerSubmit) {
    if (submit.edit) {
      const vars = toEditVars(submit);
      if (vars) edit.mutate(vars);
      return;
    }
    send.mutate(toSendVars(submit));
  }

  // Viewport витрины — цель прыжка с подсветкой (панель поиска, клик по
  // строке выдачи): тот же резидент, что у ленты беседы.
  const viewportRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <MessageScrollerProvider autoScroll>
        <JumpResponder
          conversationId={conversationId}
          threadRootId={null}
          itemCount={items.length}
          containerRef={viewportRef}
        />
        <MessageScroller className="min-h-0 flex-1 bg-chat-zone">
          <MessageScrollerViewport ref={viewportRef}>
            <MessageScrollerContent className="feed-reveal flex flex-col gap-3 px-4 pt-4 pb-0">
              {messagesQuery.isLoading && favoritesQuery.isLoading ? null : items.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <Empty>
                    <EmptyTitle>{ui.chat.notesEmpty}</EmptyTitle>
                  </Empty>
                </div>
              ) : (
                <MessageGroup className="gap-3">
                  {runs.map((run, runIndex) => {
                    const prevRun = runIndex === 0 ? undefined : runs[runIndex - 1];
                    return (
                      <Fragment key={run.first.id}>
                        {startsNewDay(prevRun?.last, run.first) ? (
                          <MessageScrollerItem>
                            <DayChip label={formatDayLabel(run.first.createdAt)} />
                          </MessageScrollerItem>
                        ) : null}
                        <MessageRunView
                          run={run}
                          showName={!run.mine}
                          renderItem={(message, attrs) => (
                            <FavoriteRunMessage
                              message={message}
                              card={
                                (feedCardIds.has(message.id) ? cardsById.get(message.id) : null) ??
                                null
                              }
                              labelTarget={
                                cardsById.get(message.id) ?? { messageId: message.id, labels: [] }
                              }
                              mine={run.mine}
                              showName={attrs.showName}
                              tail={attrs.tail}
                              style={attrs.style}
                              conversationId={conversationId}
                              scope={scope}
                              selectionActive={selection.selectionActive}
                              selectedSet={selection.selectedSet}
                              onToggle={selection.toggle}
                            />
                          )}
                        />
                      </Fragment>
                    );
                  })}
                </MessageGroup>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
        </MessageScroller>
      </MessageScrollerProvider>

      <ChatComposer
        key={conversationId}
        placeholder={ui.chat.notesComposerPlaceholder}
        focusId={scope}
        conversationId={conversationId}
        attachmentsEnabled
        selection={selectionComposerProps(conversationId, selection, false)}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

/** Одна строка потока «Избранного»: запись или карточка. Личные тэги —
 *  ЕДИНЫЙ слой реакций (публичного пикера в витрине нет): карточка берёт
 *  тэги из себя, запись — из своей тэг-строки-закладки (cardsById). */
function FavoriteRunMessage({
  message,
  card,
  labelTarget,
  mine,
  showName,
  tail,
  style,
  conversationId,
  scope,
  selectionActive,
  selectedSet,
  onToggle,
}: {
  message: ChatMessage;
  /** Карточка (строка — псевдо-сообщение оригинала) или null (запись). */
  card: FavoriteCard | null;
  /** Тэг-цель строки: карточка/тэг-строка записи/пустышка записи (апсерт). */
  labelTarget: { messageId: string; labels: string[] };
  mine: boolean;
  showName: boolean;
  tail: boolean;
  style?: React.CSSProperties;
  conversationId: string;
  scope: string;
  selectionActive: boolean;
  selectedSet: Set<string>;
  onToggle: (id: string, shift: boolean) => void;
}) {
  // Карточки в режиме селекта не выделяются (селект — про СВОИ записи).
  const selectable = selectionActive && card === null;
  const labels = labelTarget.labels;
  const labelSlots =
    message.deletedAt || selectionActive
      ? {}
      : {
          reactionsRow:
            labels.length > 0 ? (
              <FavoriteLabelChips
                labels={labels}
                messageId={labelTarget.messageId}
                onFilled={mine}
              />
            ) : undefined,
          reactionPicker: (atEnd: boolean) => (
            <FavoriteLabels labels={labels} messageId={labelTarget.messageId} atEnd={atEnd} />
          ),
        };
  const row =
    card === null ? (
      <MessageMenu
        message={message}
        mine={mine}
        conversationId={conversationId}
        scope={scope}
        hideFavorite
      >
        <ChatMessageItem
          message={message}
          mine={mine}
          showName={showName}
          avatarSlot="none"
          tail={tail}
          reactionsHidden={selectionActive}
          {...labelSlots}
        />
      </MessageMenu>
    ) : (
      <FavoriteMenu card={card}>
        <ChatMessageItem
          message={message}
          mine={mine}
          showName={showName}
          avatarSlot="none"
          tail={tail}
          nameSuffix={<SourceSuffix card={card} />}
          {...labelSlots}
        />
      </FavoriteMenu>
    );
  return (
    <MessageScrollerItem messageId={message.id} style={style}>
      <MessageRow
        messageId={message.id}
        selectable={selectable}
        selected={selectedSet.has(message.id)}
        onToggle={(shift) => onToggle(message.id, shift)}
      >
        {row}
      </MessageRow>
    </MessageScrollerItem>
  );
}

/** Подпись источника карточки рядом с именем автора: «из <чат>». */
function SourceSuffix({ card }: { card: FavoriteCard }) {
  const title = favoriteSourceTitle(card);
  if (!title) return null;
  return (
    <span className="ml-1 truncate text-xs font-normal text-muted-foreground">
      {ui.chat.favoriteFrom} «{title}»
    </span>
  );
}
