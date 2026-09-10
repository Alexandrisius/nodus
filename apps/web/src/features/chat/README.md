# features/chat

Мессенджер в теме «Инструмент»: список бесед слева (секции **Каналы /
Групповые чаты / Личные** — моно-метки, непрочитанные — чип danger, активная
строка — плоская заливка на рейке-сайдбаре) + активная беседа справа
(механика Телеграма).

**Каналы — лента новостей-тредов** (вердикт владельца 2026-09-10): каждое
сообщение канала — корневой пост (новость), ответы ссылаются на корень
(`threadRootId`, ровно один уровень); «провалиться внутрь» = обычный чат
(корневой пост + ответы + композер с `threadRootId`). Тред — search-параметр
`?thread=<rootId>` (deep-link). Уведомления канала — ТОЛЬКО участники треда
и наблюдатели проекта (анти-спам; бэкенд-механика — M13, в концепте не
реализуется). Канал проекта создаётся автоматически при создании проекта
(`project.channelId`, см. features/projects — вкладка «Чат» рендерит тот же
механизм из `shared/chat`).

Групповые/личные — обычная лента сообщений (MessageScroller + Bubble-примитивы
как в обсуждении задачи); «В задачу» из сообщения — поток Б (оптимистично).

- **Механика чата — в `shared/chat/`** (два потребителя: мессенджер и панель
  проекта; I6 — фичи друг друга не импортируют): `api.ts` (ключи, сообщения
  беседы/треда, оптимистичная отправка с `threadRootId` и счётчиком корня,
  «В задачу», find-or-create личного диалога), `conversation-pane.tsx`,
  `thread-feed.tsx`, `thread-pane.tsx`, `chat-message.tsx`, `chat-composer.tsx`
  (бар h-16 — канон нижних баров, SendHexButton).
- Контракты: `ConversationListItem`, `ChatMessage` (`threadRootId`,
  `threadRepliesCount`), `sendMessageBodySchema`, `listMessagesQuerySchema`
  (+`threadRootId`), `startDirectBodySchema`.
- Эндпоинты (моки): `GET /chat/conversations`, `POST /chat/conversations`
  (find-or-create диалога — «Написать сообщение» из карточки сотрудника),
  `GET|POST /chat/conversations/:id/messages` (+`?threadRootId=` — корень
  первым, POST в тред инкрементирует счётчик корня),
  `POST /chat/conversations/:id/messages/:messageId/to-task`.
- В фиче остаются: список бесед (`components/conversation-list.tsx`),
  заголовки/секции (`lib/conversations.ts`), `useConversations`.
