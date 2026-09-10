# features/projects

Проекты в теме «Инструмент»: журнал — каноническая таблица (shared/views
`DataTable`, ключ вида `projects.list`, реестр `lib/project-fields.tsx`),
карточка проекта — в общем стеке карточек (ADR-0009).

Карточка проекта (`components/project-card.tsx`, вердикт владельца 2026-09-10,
раунд 2) — полноценная карточка по анатомии карточки задачи:

- Полоса цепочки: само-узел «ПРОЕКТ · код» + чипы стадии проекта и
  приватности (название — в хроме слайдера, в теле не дублируется).
- **Левая зона** (`@container`): паспорт «О проекте» — поля-реестром
  `EntityFields` (defs — `lib/project-passport.tsx`, ключ
  `nodus-project-fields-v1`; стадия проекта — ОТДЕЛЬНАЯ сущность от стадий
  задач, справочник I15; руководитель — переход в карточку сотрудника
  стеком). Выдвижной панели «О проекте» БОЛЬШЕ НЕТ (вердикт). Ниже — секция
  «Задачи» с переключателем **Список/Канбан** и шестерёнкой активного вида
  (`projects.tasks` / `projects.kanban`).
- **Правая колонка — канал проекта** (создаётся АВТОМАТИЧЕСКИ, `channelId`):
  лента новостей-тредов + тред-панель из `shared/chat`, видна ВСЕГДА рядом с
  полями — отдельной вкладки «Чат» нет; тёмная зона — структурный фон с
  первого кадра раскрытия (у записи стека `fadeContent=false`). Уведомления
  треда — только участники и наблюдатели, бэкенд M13.
- **ОДИН канбан, а не два** (плейбук §3.1): задачи проекта — те же сущности
  (`GET /tasks?projectId=&stageId=`), колонки — стадии глобальной схемы
  (ADR-0008, до редактора #38 — дефолтная), DnD — `PATCH /tasks/:id`
  (оптимистично, откат снапшотом + тост); CRUD колонок НЕТ (стадии правятся
  в редакторе схем); quick-add — `POST /tasks {title, stageId, projectId}`.
  Механика борда — общая оболочка `shared/ui/board` + `shared/lib/board`
  (BoardColumn/BoardSortableCard/BoardTaskCard, globalAxis, collision).
  Ганта НЕТ — отдельный issue #39 (обрубки запрещены).
- Список задач проекта — `DataTable` (ключ `projects.tasks`, реестр
  `lib/project-task-fields.tsx`, плоский: граф-дерево — в навигаторе ветки
  карточки задачи); открытие карточки задачи — НАСЛОЕНИЕМ поверх карточки
  проекта (стек, ADR-0009).

- Контракты: `ProjectListItem` (`channelId`), `ProjectRef`; query `/tasks`
  (+`projectId`), `createTaskBodySchema` (+`stageId`/`projectId`).
- Эндпоинты (моки): `GET /projects`, `GET /projects/:id`; задачи проекта —
  общий ресурс `GET /tasks?projectId=`; своего `/projects/:id/tasks` нет.
- Хуки: `useProjectsList`, `useProjectDetail` (keepPreviousData — карточка
  не мигает в стеке), `useProjectTaskPages`, `useMoveProjectTask`,
  `useCreateProjectTask`.
