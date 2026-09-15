import type { ReactNode } from 'react';
import type { ProjectListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Empty, EmptyDescription, EmptyTitle } from '@nodus/ui/components/empty';

import { ChannelView } from '../../../shared/chat/channel-view.js';

/** Вкладка «Чат» панели проекта: канал проекта в мессенджере (создаётся
 *  автоматически, вердикт владельца 2026-09-10) — лента новостей-тредов с
 *  ПОЛНОВЫСОТНЫМ окном треда рядом (тот же shared-компонент, что в
 *  мессенджере, #42 + вердикт 15.09.2026: окно треда поднимается до верха
 *  карточки, его бар — на линии таб-бара). Бар ленты (`header`) приходит
 *  от карточки (тоггл панели беседы на правом краю ленты). Состояние
 *  открытого треда — у карточки: область панели беседы («Этот тред») живёт
 *  там же. */
export function ProjectChat({
  project,
  threadId,
  onOpenThread,
  onCloseThread,
  header,
}: {
  project: ProjectListItem;
  threadId: string | null;
  onOpenThread: (rootId: string) => void;
  onCloseThread: () => void;
  /** Бар ленты канала — рендерится в колонке ленты (сжимается вместе с
   *  ней при открытии треда). */
  header?: ReactNode;
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
    // Бар треда — h-10 bg-card в плотность и тон баров карточки (бары на
    // одной линии — ОДИН тон; канон `headerClass` панели беседы): линии
    // border-b всех колонок продолжаются друг в друга.
    <ChannelView
      conversationId={project.channelId}
      threadRootId={threadId}
      onOpenThread={onOpenThread}
      onCloseThread={onCloseThread}
      header={header}
      threadBarClass="h-10 bg-card"
    />
  );
}
