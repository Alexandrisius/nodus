import { memo } from 'react';
import { ui } from '@nodus/contracts';
import { Empty, EmptyTitle } from '@nodus/ui/components/empty';

import { useTaskConversation } from '../../../shared/chat/api.js';
import { ConversationPane } from '../../../shared/chat/conversation-pane.js';

/**
 * Обсуждение задачи — ОБЫЧНАЯ беседа мессенджера `type='task'` (канон
 * владельца #252: один движок чата, без параллельного конвейера): та же
 * лента, композер с вложениями/упоминаниями/цитатами, меню сообщения,
 * треды, черновики и realtime, что в мессенджере. Беседа находится или
 * создаётся сервером по задаче; её состав — участники задачи. Руководитель,
 * видящий задачу по оргструктуре, но не участник — получает 404, и вместо
 * ленты видит подсказку (обсуждение — для участников).
 */
export const TaskDiscussion = memo(function TaskDiscussion({ taskId }: { taskId: string }) {
  const { data, isError } = useTaskConversation(taskId);

  if (data) {
    return (
      <ConversationPane
        conversationId={data.id}
        conversation={data}
        composerPlaceholder={ui.tasks.addComment}
        emptyLabel={ui.tasks.discussionEmpty}
      />
    );
  }
  return (
    <div className="flex h-full min-w-0 flex-1 items-center justify-center bg-chat-zone">
      {isError ? (
        <Empty>
          <EmptyTitle>{ui.tasks.discussionMembersOnly}</EmptyTitle>
        </Empty>
      ) : null}
    </div>
  );
});
