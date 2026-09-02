# features/chat

Мессенджер: список диалогов (каналы/группы/лички), тред на примитивах shadcn
(MessageScroller/Message/Bubble), оптимистичная отправка, «В задачу» из сообщения (поток Б).

- Контракты: `ConversationListItem`, `ChatMessage` (`@nodus/contracts`).
- Эндпоинты (моки): `GET /chat/conversations`, `GET|POST /chat/conversations/:id/messages`,
  `POST /chat/conversations/:id/messages/:messageId/to-task`.
- Оптимистичность: `useSendMessage` — канон patterns.md (тот же паттерн, что в tasks).
