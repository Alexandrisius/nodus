import { FileText, Loader2, MessageSquare, MessagesSquare, X } from 'lucide-react';
import { useId, type KeyboardEvent, type ReactNode } from 'react';
import type { LetterDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@nodus/ui/components/empty';
import { Spinner } from '@nodus/ui/components/spinner';
import { cn } from '@nodus/ui/lib/utils';

import { useLetterConversation } from '../../../../shared/chat/chat-queries.js';
import { ChatPanelToggle } from '../../../../shared/chat/chat-side-panel.js';
import { ConversationPane } from '../../../../shared/chat/conversation-pane.js';
import { FileTypeIcon } from '../../../../shared/files/file-type-icon.js';
import {
  fileIdOf,
  fileTabId,
  type LetterTabId,
  type LetterTabsState,
} from '../../lib/letter-tabs.js';
import { LetterBodyView } from '../letter-body-view.js';

interface TabDef {
  id: LetterTabId;
  label: string;
  icon: ReactNode;
  /** Счётчик непрочитанного у «Чата». */
  badge?: number;
}

/** Чат письма (Р10; редизайн #56 — обсуждение живёт и у незарегистриро-
 *  ванного): участнику — обычная беседа мессенджера (композер в покое h-16
 *  = бару действий — одна горизонталь), остальным — объяснение и
 *  «Присоединиться к обсуждению» / «Начать обсуждение» (канцелярия до
 *  регистрации), если письмо ещё в работе. */
function LetterChatTab({
  letter,
  joining,
  onJoin,
}: {
  letter: LetterDetail;
  joining: boolean;
  onJoin: () => void;
}) {
  const { data, error } = useLetterConversation(letter.id, letter.access.isParticipant);
  const joinLabel =
    letter.registeredAt === null ? ui.letters.card.startDiscussion : ui.letters.card.join;

  if (letter.access.isParticipant && data) {
    return (
      <ConversationPane
        conversationId={data.id}
        conversation={data}
        emptyLabel={ui.letters.card.chatEmpty}
        composerClassName="flex min-h-16 flex-col justify-end"
      />
    );
  }
  if (letter.access.isParticipant) {
    return (
      <div className="grid h-full place-items-center bg-chat-zone p-6 text-center">
        {error ? (
          <Empty>
            <EmptyTitle>{ui.common.loadError}</EmptyTitle>
          </Empty>
        ) : (
          <Spinner className="size-5" />
        )}
      </div>
    );
  }
  return (
    <div className="flex h-full items-center justify-center bg-chat-zone p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessagesSquare strokeWidth={1.75} />
          </EmptyMedia>
          <EmptyTitle>{ui.letters.card.chatGuestTitle}</EmptyTitle>
          <EmptyDescription>{ui.letters.card.chatGuestHint}</EmptyDescription>
        </EmptyHeader>
        {letter.access.canJoin ? (
          <EmptyContent>
            {/* Outline, а не заливка: primary на экране один («Зарегистрировать»
                в баре действий), а то же действие в баре — outline-кнопка:
                одно действие — один вес в обоих входах. */}
            <Button
              variant="outline"
              onClick={onJoin}
              disabled={joining}
              aria-busy={joining || undefined}
            >
              {joining ? (
                <Loader2 className="animate-spin" />
              ) : (
                <MessageSquare data-icon="inline-start" />
              )}
              {joinLabel}
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    </div>
  );
}

/**
 * Правая панель карточки письма (#55, U7): «Письмо», «Чат» и «Текст
 * письма» (когда текстовая часть есть — редизайн #56) — неснимаемые
 * вкладки, вложения — закрываемые (≤ 6, `letter-tabs.ts`). Содержимое
 * вкладки монтируется при первом показе и дальше живёт скрытым
 * (`invisible` + `inert`, не `display: none`): прокрутка, страница и
 * масштаб документа при возврате на вкладку на месте. ←/→ на полосе —
 * соседняя вкладка.
 */
export function LetterSideTabs({
  letter,
  tabs,
  joining,
  panelOpen,
  onActivate,
  onClose,
  onJoin,
  onPanelToggle,
}: {
  letter: LetterDetail;
  tabs: LetterTabsState;
  joining: boolean;
  /** Панель вложений беседы (как в мессенджере) открыта — тоггл подсвечен. */
  panelOpen: boolean;
  /** Текстовая часть письма (role body при документе) — вкладка «Текст
   *  письма»; null — вкладки нет. */
  onActivate: (tab: LetterTabId) => void;
  onClose: (attachmentId: string) => void;
  onJoin: () => void;
  onPanelToggle: () => void;
}) {
  const baseId = useId();
  const { data: conversation } = useLetterConversation(letter.id, letter.access.isParticipant);
  const domId = (tab: LetterTabId) => `${baseId}-${tab.replace(':', '-')}`;

  const strip: TabDef[] = [
    { id: 'body', label: ui.letters.card.tabBody, icon: <FileText className="size-3.5" /> },
    {
      id: 'chat',
      label: ui.letters.card.tabChat,
      icon: <MessageSquare className="size-3.5" />,
      badge: conversation?.unreadCount,
    },
    ...tabs.files.flatMap((fileId) => {
      const file = letter.attachments.find((a) => a.id === fileId);
      return file
        ? [
            {
              id: fileTabId(fileId),
              label: file.name,
              icon: <FileTypeIcon mime={file.mime} className="size-3.5" />,
            },
          ]
        : [];
    }),
  ];

  function onStripKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const index = strip.findIndex((tab) => tab.id === tabs.active);
    const next =
      strip[(index + (event.key === 'ArrowRight' ? 1 : -1) + strip.length) % strip.length];
    if (!next) return;
    event.preventDefault();
    onActivate(next.id);
    document.getElementById(`${domId(next.id)}-tab`)?.focus();
  }

  const panel = (tab: LetterTabId): ReactNode => {
    if (tab === 'body') return <LetterBodyView letter={letter} />;
    if (tab === 'chat') return <LetterChatTab letter={letter} joining={joining} onJoin={onJoin} />;
    const fileId = fileIdOf(tab);
    return fileId ? <LetterBodyView letter={letter} attachmentId={fileId} /> : null;
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div
        role="tablist"
        aria-label={ui.letters.card.tabsLabel}
        onKeyDown={onStripKeyDown}
        className="content-fade flex h-10 shrink-0 items-center gap-1 overflow-x-auto overflow-y-hidden border-b border-border px-3"
      >
        {strip.map((tab) => {
          const active = tab.id === tabs.active;
          const fileId = fileIdOf(tab.id);
          return (
            <div
              key={tab.id}
              className={cn(
                'flex h-10 shrink-0 items-center border-b-2 transition-colors',
                active
                  ? 'border-port text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground/80',
              )}
            >
              <button
                type="button"
                role="tab"
                id={`${domId(tab.id)}-tab`}
                aria-selected={active}
                aria-controls={`${domId(tab.id)}-panel`}
                tabIndex={active ? 0 : -1}
                title={fileId ? tab.label : undefined}
                onClick={() => onActivate(tab.id)}
                className={cn(
                  'flex h-full max-w-48 min-w-0 items-center gap-1.5 text-body-xs font-medium focus-visible:outline-2 focus-visible:outline-ring',
                  fileId ? 'pr-1 pl-2' : 'px-2.5',
                )}
              >
                <span aria-hidden className="shrink-0 opacity-80">
                  {tab.icon}
                </span>
                <span className="truncate">{tab.label}</span>
                {tab.badge && !active ? (
                  <span className="font-mono text-label-sm text-port tabular-nums">
                    {tab.badge}
                  </span>
                ) : null}
              </button>
              {fileId ? (
                <button
                  type="button"
                  onClick={() => onClose(fileId)}
                  aria-label={`${ui.letters.card.closeTab}: ${tab.label}`}
                  title={ui.letters.card.closeTab}
                  className="mr-1 rounded p-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <X className="size-3" strokeWidth={1.75} />
                </button>
              ) : null}
            </div>
          );
        })}
        {/* Тоггл панели вложений беседы — как в мессенджере (#55): в чате
            письма его не было, хотя беседа та же. Панель — вталкивающая
            колонка справа (хост карточки), кнопка стоит на правом краю
            полосы вкладок и видна только на вкладке «Чат». */}
        {tabs.active === 'chat' && conversation ? (
          <div className="ml-auto flex h-10 shrink-0 items-center pr-1">
            <ChatPanelToggle open={panelOpen} onToggle={onPanelToggle} />
          </div>
        ) : null}
      </div>
      <div className="relative min-h-0 flex-1">
        {strip
          .filter((tab) => tabs.visited.includes(tab.id))
          .map((tab) => {
            const active = tab.id === tabs.active;
            return (
              <div
                key={tab.id}
                role="tabpanel"
                id={`${domId(tab.id)}-panel`}
                aria-labelledby={`${domId(tab.id)}-tab`}
                inert={!active}
                className={cn('absolute inset-0', !active && 'invisible')}
              >
                {panel(tab.id)}
              </div>
            );
          })}
      </div>
    </div>
  );
}
