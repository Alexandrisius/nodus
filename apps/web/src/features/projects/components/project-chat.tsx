import type { ProjectListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Empty, EmptyDescription, EmptyTitle } from '@nodus/ui/components/empty';

import { ChannelView } from '../../../shared/chat/channel-view.js';

/** Вкладка «Чат» панели проекта: канал проекта в мессенджере (создаётся
 *  автоматически, вердикт владельца 2026-09-10) — лента новостей-тредов с
 *  окном треда рядом (тот же shared-компонент, что в мессенджере, #42:
 *  широкая колонка — две зоны, узкая — drill-down с «К ленте»). Состояние
 *  открытого треда — у карточки: область панели беседы («Этот тред») живёт
 *  там же. */
export function ProjectChat({
  project,
  threadId,
  onOpenThread,
  onCloseThread,
}: {
  project: ProjectListItem;
  threadId: string | null;
  onOpenThread: (rootId: string) => void;
  onCloseThread: () => void;
}) {
  if (!project.channelId) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty>
          <EmptyTitle>{ui.projects.noChannel}</EmptyTitle>
          <EmptyDescription>{ui.chat.channelOfProject}</EmptyDescription>
        </Empty>
      </div>
    );
  }

  return (
    <ChannelView
      conversationId={project.channelId}
      threadRootId={threadId}
      onOpenThread={onOpenThread}
      onCloseThread={onCloseThread}
    />
  );
}
