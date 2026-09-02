# features/tasks

Задачи: канбан «Мой план» (колонки = стадии статус-схемы из данных, I15), список,
двухпанельная карточка-слайдер с обсуждением, стек-слайдер до проекта.

- Контракты: `TaskListItem`, `TaskDetail`, `TaskStage`, `ChatMessage` (`@nodus/contracts`).
- Эндпоинты (моки): `GET /tasks`, `GET /tasks/:id`, `GET|POST /tasks/:id/messages`.
- Оптимистичность: `useSendTaskMessage` — канон patterns.md; детерминированный тест —
  `api/tasks-api.test.tsx`.
- Виды переключаются search-параметром `view` (секции в топбаре).
