import { useState } from 'react';
import type { ProjectListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Empty, EmptyDescription, EmptyTitle } from '@nodus/ui/components/empty';

import { ThreadFeed } from '../../../shared/chat/thread-feed.js';
import { ThreadPane } from '../../../shared/chat/thread-pane.js';

/** Вкладка «Чат» панели проекта: канал проекта в мессенджере (создаётся
 *  автоматически, вердикт владельца 2026-09-10) — лента новостей-тредов;
 *  «провалиться внутрь» = обычный чат (ThreadPane, тот же механизм shared/chat,
 *  что и в мессенджере — без отдельной реализации, плейбук §3.6). */
export function ProjectChat({ project }: { project: ProjectListItem }) {
  const [threadId, setThreadId] = useState<string | null>(null);

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

  return threadId ? (
    <ThreadPane
      conversationId={project.channelId}
      threadRootId={threadId}
      onBack={() => setThreadId(null)}
    />
  ) : (
    <ThreadFeed conversationId={project.channelId} onOpenThread={setThreadId} />
  );
}
