import { useNavigate, useParams, useSearch } from '@tanstack/react-router';

import { MessengerBody, type ChatTab } from '../components/messenger-body.js';

/**
 * Мессенджер — маршрутная обёртка над ЕДИНЫМ телом `MessengerBody` (то же
 * тело рендерит полноэкранная карточка `messenger:<id>` стека — план
 * `docs/mvp/archive/messenger-fullscreen-plan.md`, ноль дублей). Страница владеет
 * состоянием через маршрут: беседа — параметр `/chat/$conversationId`,
 * вкладки «Чаты» / «Чаты задач» / «Настройка» — в топбаре шелла по канону
 * каркаса (search `?tab=`), тред — search `?thread=` (deep-link).
 */
export function ChatPage() {
  const { conversationId } = useParams({ strict: false }) as { conversationId?: string };
  const search = useSearch({ strict: false }) as { thread?: string; tab?: string };
  const tab: ChatTab =
    search.tab === 'tasks' ? 'tasks' : search.tab === 'settings' ? 'settings' : 'chats';
  const navigate = useNavigate();

  return (
    <MessengerBody
      tab={tab}
      conversationId={conversationId}
      onSelectConversation={(id) =>
        void navigate({
          to: '/chat/$conversationId',
          params: { conversationId: id },
          search: tab === 'chats' ? {} : { tab },
        })
      }
      // Внутренняя навигация мессенджера (вердикт 25.09): переход к беседе
      // источника пересылки с тредом — ОДИН navigate (последовательность
      // onSelect+openThread писала в params устаревший conversationId).
      onOpenConversation={(id, threadRootId) =>
        void navigate({
          to: '/chat/$conversationId',
          params: { conversationId: id },
          search: (prev) => ({ ...prev, thread: threadRootId ?? undefined }),
        })
      }
      threadRootId={search.thread ?? null}
      onOpenThread={(rootId) =>
        void navigate({
          to: '/chat/$conversationId',
          params: { conversationId: conversationId ?? '' },
          // Функциональная форма: посторонние search-параметры
          // (стек карточек ?cards=) СОХРАНЯЮТСЯ — закрытие треда
          // не размонтирует карточку поверх (вердикт валидатора
          // #42: navigate c объектом затирает search целиком).
          search: (prev) => ({ ...prev, thread: rootId }),
        })
      }
      onCloseThread={() =>
        void navigate({
          to: '/chat/$conversationId',
          params: { conversationId: conversationId ?? '' },
          search: (prev) => ({ ...prev, thread: undefined }),
        })
      }
    />
  );
}
