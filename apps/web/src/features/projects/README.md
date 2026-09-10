# features/projects

Проекты в теме «Инструмент»: журнал — каноническая таблица (shared/views
`DataTable`, ключ вида `projects.list`, реестр `lib/project-fields.tsx`),
карточка проекта — в общем стеке карточек (ADR-0009).

Панель проекта (плейбук §3, вердикты владельца 2026-09-10):

- Полоса цепочки: само-узел «ПРОЕКТ · код» + чипы стадии проекта и
  приватности + кнопка «О проекте» (вталкивающая колонка 0↔360px справа —
  пуш-механика карточки задачи; паспорт — поля-реестром `EntityFields`,
  ключ `nodus-project-fields-v1`; стадия проекта — ОТДЕЛЬНАЯ сущность от
  стадий задач, справочник I15).
- Вкладки: **Список / Канбан / Чат** (Ганта НЕТ — отдельный issue #39,
  обрубки запрещены); шестерёнка — по активному виду (`projects.tasks` /
  `projects.kanban`).
- **ОДИН канбан, а не два** (§3.1): задачи проекта — те же сущности
  (`GET /tasks?projectId=&stageId=`), колонки — стадии глобальной схемы
  (ADR-0008, до редактора #38 — дефолтная), DnD — `PATCH /tasks/:id`
  (оптимистично, откат снапшотом + тост); CRUD колонок НЕТ (стадии правятся
  в редакторе схем); quick-add — `POST /tasks {title, stageId, projectId}`.
  Механика борда — общая оболочка `shared/ui/board` + `shared/lib/board`
  (BoardColumn/BoardSortableCard/BoardTaskCard, globalAxis, collision).
- Список задач проекта — `DataTable` (ключ `projects.tasks`, реестр
  `lib/project-task-fields.tsx`, плоский: граф-дерево — в навигаторе ветки
  карточки задачи); открытие карточки задачи — НАСЛОЕНИЕМ поверх карточки
  проекта (стек, ADR-0009).
- Чат — канал проекта в мессенджере (создаётся АВТОМАТИЧЕСКИ, `channelId`):
  лента новостей-тредов + тред-панель из `shared/chat` (тот же механизм, что
  в мессенджере — без отдельной реализации; уведомления треда — только
  участники и наблюдатели, бэкенд M13).

- Контракты: `ProjectListItem` (`channelId`), `ProjectRef`; query `/tasks`
  (+`projectId`), `createTaskBodySchema` (+`stageId`/`projectId`).
- Эндпоинты (моки): `GET /projects`, `GET /projects/:id`; задачи проекта —
  общий ресурс `GET /tasks?projectId=`; своего `/projects/:id/tasks` нет.
- Хуки: `useProjectsList`, `useProjectDetail` (keepPreviousData — панель не
  мигает в стеке), `useProjectTaskPages`, `useMoveProjectTask`,
  `useCreateProjectTask`.
