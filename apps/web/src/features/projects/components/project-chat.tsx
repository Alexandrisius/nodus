import type { ProjectDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Empty, EmptyDescription, EmptyTitle } from '@nodus/ui/components/empty';

import { ChannelView } from '../../../shared/chat/channel-view.js';

/** Участие любого источника: канал проекта открыт только составу (Р8). */
export function isProjectParticipant(project: ProjectDetail): boolean {
  const membership = project.myMembership;
  return (
    membership.manager || membership.assistant || membership.participant || membership.observer
  );
}

/**
 * Канал проекта — колонка справа в карточке (создаётся автоматически по
 * событию `project.created`, Р8). Не участнику открытого проекта канал не
 * открывается: «к каналу присоединиться нельзя — вступи в проект»
 * (вердикт 29.10); пишут в ленту руководитель, помощники и держатели
 * `project.channel.post`, треды — все участники. Тоггл панели «О канале» —
 * на полосе вкладок карточки (вердикт 07.11.2026), своего бара у ленты нет.
 */
export function ProjectChat({
  project,
  conversationId,
  threadId,
  onOpenThread,
  onCloseThread,
}: {
  project: ProjectDetail;
  /** null — канал ещё не открыт/недоступен (не участник). */
  conversationId: string | null;
  threadId: string | null;
  onOpenThread: (rootId: string) => void;
  onCloseThread: () => void;
}) {
  if (!conversationId) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Empty>
          <EmptyTitle>
            {isProjectParticipant(project) ? ui.projects.noChannel : ui.projects.channelMembersOnly}
          </EmptyTitle>
          {isProjectParticipant(project) ? null : (
            <EmptyDescription>{ui.projects.channelJoinHint}</EmptyDescription>
          )}
        </Empty>
      </div>
    );
  }

  return (
    <ChannelView
      conversationId={conversationId}
      threadRootId={threadId}
      onOpenThread={onOpenThread}
      onCloseThread={onCloseThread}
      threadBarClass="h-10 bg-card"
      canPost={project.access.canPostToChannel}
    />
  );
}
