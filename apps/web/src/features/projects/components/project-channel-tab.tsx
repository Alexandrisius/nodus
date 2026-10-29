import { useState } from 'react';
import type { ProjectDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { ChatSidePanel } from '../../../shared/chat/chat-side-panel.js';
import type { useChatSidePanel } from '../../../shared/chat/chat-side-panel.js';
import { ProjectChat } from './project-chat.js';

/**
 * Вкладка «Канал» (вердикт владельца 07.11.2026): канал проекта больше не
 * постоянная колонка справа — он живёт вкладкой рабочей зоны. Тоггл панели
 * «О канале» стоит НА ПОЛОСЕ ВКЛАДОК (как в письмах — второго бара под
 * вкладками нет), панель — вталкивающая колонка внутри вкладки (канон
 * «чат — буфер сужений»), тред — полно высотное окно рядом с лентой
 * (общий `ChannelView`).
 */
export function ProjectChannelTab({
  project,
  conversationId,
  panel,
}: {
  project: ProjectDetail;
  /** null — канал ещё не открыт/недоступен (не участник). */
  conversationId: string | null;
  panel: ReturnType<typeof useChatSidePanel>;
}) {
  const [threadId, setThreadId] = useState<string | null>(null);

  return (
    <div className="flex h-full min-h-0">
      <div className="min-h-0 min-w-0 flex-1">
        <ProjectChat
          project={project}
          conversationId={conversationId}
          threadId={threadId}
          onOpenThread={setThreadId}
          onCloseThread={() => setThreadId(null)}
        />
      </div>
      {conversationId ? (
        <ChatSidePanel
          conversationId={conversationId}
          open={panel.open}
          onClose={panel.close}
          title={ui.chat.aboutProject}
          headerClass="h-10"
        />
      ) : null}
    </div>
  );
}
