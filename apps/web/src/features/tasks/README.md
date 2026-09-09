# features/tasks

Задачи в теме «Инструмент»: канбан «Мой план» (колонки = стадии статус-схемы из
данных, I15), список с **графом вложенности** слева (уровни подзадач — сквозные
вертикали, локти, порты; ветки сворачиваются «−»/«+», как папки в проводнике),
карточка-слайдер с доменной цепочкой (Письмо → Резолюция → Поручение → Задача)
и обсуждением, стек-слайдер до проекта.

- Контракты: `TaskListItem` (+`parentId`), `TaskDetail` (+`chain`), `TaskStage`,
  `TaskChainNode`, `ChatMessage` (`@nodus/contracts`).
- Эндпоинты (моки): `GET /tasks`, `GET /tasks/:id`, `GET|POST /tasks/:id/messages`.
- **Кастомизация представлений** (инфраструктура `shared/views`, все модули):
  реестры полей — `lib/task-fields.tsx` (`taskListFields`, `taskCardFields`);
  видимость полей — шестерёнка в шапке страницы; ширина колонок списка —
  ручкой на грани хедера (`ColumnResizer`); пресеты персистятся в
  localStorage (`nodus-views-v1`, схема — contracts `viewPresetSchema`,
  на проде — API персонализации).
- Граф списка: `lib/task-tree.ts` (дерево → строки с геометрией связей),
  `components/task-list-graph.tsx` (SVG per row, каскадная отрисовка локтей).
- Док-ребро слайдера: точка стыковки пробрасывается через `useShellStore.lastDock`
  (клик по строке/карточке → координаты порта → `SliderPanel dockFrom`).
- Доменная цепочка: `shared/ui/domain-chain.tsx` (узлы из `taskDetail.chain`;
  в моках задача №105 честно связана с письмом Вх-2026/118).
- Оптимистичность: `useSendTaskMessage`, `useUpdateTaskStage` — канон patterns.md;
  детерминированные тесты — `api/tasks-api.test.tsx`.
- **DnD канбана (ADR-0007, @dnd-kit/core+sortable):** живая сортировка — карточки
  уступают место и переезжают между колонками ВО ВРЕМЯ переноса (`onDragOver`,
  sortable-трансформы), финализация — персист стадии+индекса
  (`PATCH /tasks/:id`, контракт `taskUpdateBodySchema`, оптимистично I4 с
  откатом и тостом); Esc — откат к снапшоту dragStart; призрак DragOverlay
  садится на живой слот (обратного перелёта нет). Колонка = SortableContext +
  useDroppable (пустая принимает перенос), collision — официальная
  multi-container стратегия (`lib/kanban-collision.ts`), перестановки борда —
  чистые функции с тестами (`lib/kanban-board.ts`). Борд — локальное состояние,
  синхронизированное с query вне переноса (паттерн dnd-kit + React Query).
  PointerSensor distance 6 (клик без движения открывает слайдер),
  Keyboard/Touch-сенсоры. Каталог стадий — `GET /tasks/stages` (`useTaskStages`).
- Виды переключаются search-параметром `view` (секции в топбаре).
