import { useEffect, useState } from 'react';
import type { ConversationListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { AddMembersDialog } from '../../../shared/chat/conversation-members.js';
import { ChatSidePanel, useChatSidePanel } from '../../../shared/chat/chat-side-panel.js';
import { ChannelView } from '../../../shared/chat/channel-view.js';
import { ConversationPane } from '../../../shared/chat/conversation-pane.js';
import { useConvRoom } from '../../../shared/socket/use-conv-room.js';
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
 *
 * #186: колонка панели хостит и вид «Участники» (ровно поверх тоггл-панели,
 * та же геометрия 1:1): стрелка «назад» при открытой панели «О чате», иначе
 * крестик; окно добавления участников — одно на беседу (кнопки в баре и в
 * панели участников).
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
  const [membersView, setMembersView] = useState(false);
  const [addMembersOpen, setAddMembersOpen] = useState(false);
  // Смена беседы без ремаунта (карточка мессенджера подменяет верхнюю):
  // виды панели персональны беседе — сбрасываем.
  useEffect(() => {
    setMembersView(false);
    setAddMembersOpen(false);
  }, [conversation.id]);
  // Подписка на комнату беседы (#104): мгновенные события и typing.
  useConvRoom(conversation.id);

  function closeMembers() {
    // Стрелка «назад»: под видом участников была открыта панель «О чате» —
    // возвращаемся к файлам; иначе крестик сворачивает колонку целиком.
    if (panel.open) {
      setMembersView(false);
    } else {
      setMembersView(false);
      panel.close();
    }
  }

  const bar = (
    <ConversationBar
      conversation={conversation}
      panelOpen={panel.open}
      onPanelToggle={panel.toggle}
      onOpenMembers={() => setMembersView(true)}
      onAddMembers={() => setAddMembersOpen(true)}
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
        conversation={conversation}
        open={panel.open}
        onClose={panel.close}
        title={conversation.type === 'project_channel' ? ui.chat.aboutChannel : ui.chat.aboutChat}
        threadRootId={threadRootId}
        view={membersView ? 'members' : 'files'}
        onMembersClose={closeMembers}
        onAddMembers={() => setAddMembersOpen(true)}
      />
      {addMembersOpen ? (
        <AddMembersDialog conversation={conversation} onClose={() => setAddMembersOpen(false)} />
      ) : null}
    </div>
  );
}
