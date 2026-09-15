import type { ConversationListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { ChatSidePanel, useChatSidePanel } from '../../../shared/chat/chat-side-panel.js';
import { ChannelView } from '../../../shared/chat/channel-view.js';
import { ConversationPane } from '../../../shared/chat/conversation-pane.js';
import { ConversationBar } from './conversation-bar.js';

/**
 * Рабочая область беседы — ОДИН код для всех хозяев (`MessengerBody`:
 * страница `/chat` и полноэкранная карточка мессенджера; карточки проекта и
 * сотрудника рендерят колонку обсуждения тем же механизмом shared/chat):
 * бар беседы (в колонке ленты), тело (канал с тредами или личная/групповая
 * лента) и правая панель файлов/ссылок беседы.
 *
 * Хранилище открытого треда выбирает хост: страница — search `?thread=`
 * (deep-link), карточка — локальное состояние (чужой маршруту параметр
 * не пишем).
 */
export function ChatWorkspace({
  conversation,
  threadRootId,
  onOpenThread,
  onCloseThread,
}: {
  conversation: ConversationListItem;
  threadRootId: string | null;
  onOpenThread: (rootId: string) => void;
  onCloseThread: () => void;
}) {
  // Панель беседы (закон: у каждого чата) — хостится рабочей областью;
  // тоггл — кнопка СПРАВА ВВЕРХУ бара беседы (канон кнопки «О задаче»).
  const panel = useChatSidePanel();
  const bar = (
    <ConversationBar
      conversation={conversation}
      panelOpen={panel.open}
      onPanelToggle={panel.toggle}
    />
  );

  return (
    // Панель беседы — ПОЛНОВЫСОТНЫЙ сиблинг всей рабочей области (вердикт
    // владельца 15.09.2026, рефы Битрикс24): занимает ВЕРХНИЙ БАР тоже, её
    // шапка (название + крестик у края) продолжает бар, тоггл уезжает влево.
    <div className="flex h-full min-w-0 flex-1">
      {conversation.type === 'project_channel' ? (
        // Канал: бар беседы — ВНУТРИ колонки ленты (сжимается вместе с ней
        // при открытии полновысотного окна треда — вердикт 15.09.2026).
        <ChannelView
          conversationId={conversation.id}
          threadRootId={threadRootId}
          onOpenThread={onOpenThread}
          onCloseThread={onCloseThread}
          header={bar}
          threadBarClass="h-14"
        />
      ) : (
        <div className="flex h-full min-w-0 flex-1 flex-col">
          {bar}
          <div className="flex min-h-0 flex-1">
            <ConversationPane
              conversationId={conversation.id}
              showAuthor={conversation.type !== 'direct'}
            />
          </div>
        </div>
      )}
      <ChatSidePanel
        conversationId={conversation.id}
        open={panel.open}
        onClose={panel.close}
        title={conversation.type === 'project_channel' ? ui.chat.aboutChannel : ui.chat.aboutChat}
        threadRootId={threadRootId}
      />
    </div>
  );
}
