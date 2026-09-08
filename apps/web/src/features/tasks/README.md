# features/tasks

Задачи в теме «Инструмент»: канбан «Мой план» (колонки = стадии статус-схемы из
данных, I15), список с **графом вложенности** слева (уровни подзадач — сквозные
вертикали, локти, порты; геометрия из `parentId`), карточка-слайдер с доменной
цепочкой (Письмо → Резолюция → Поручение → Задача) и обсуждением, стек-слайдер
до проекта.

- Контракты: `TaskListItem` (+`parentId`), `TaskDetail` (+`chain`), `TaskStage`,
  `TaskChainNode`, `ChatMessage` (`@nodus/contracts`).
- Эндпоинты (моки): `GET /tasks`, `GET /tasks/:id`, `GET|POST /tasks/:id/messages`.
- Граф списка: `lib/task-tree.ts` (дерево → строки с геометрией связей),
  `components/task-list-graph.tsx` (SVG per row, каскадная отрисовка локтей).
- Док-ребро слайдера: точка стыковки пробрасывается через `useShellStore.lastDock`
  (клик по строке/карточке → координаты порта → `SliderPanel dockFrom`).
- Доменная цепочка: `shared/ui/domain-chain.tsx` (узлы из `taskDetail.chain`;
  в моках задача №105 честно связана с письмом Вх-2026/118).
- Оптимистичность: `useSendTaskMessage` — канон patterns.md; детерминированный
  тест — `api/tasks-api.test.tsx`.
- Виды переключаются search-параметром `view` (секции в топбаре).
