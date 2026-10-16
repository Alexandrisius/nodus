# Модуль tasks (API)

Самостоятельные задачи уровня Битрикс24 — ступень 1 модуля «Задачи» (#37, эпик M4 #49; цель — `docs/mvp/tasks-projects-december-vision.md`). **Проект необязателен**: `Task.projectId` nullable, без FK (I3); задача без проекта и без колонки встаёт в начальную стадию маршрута своего типа.

## Модель (ADR-0008, ADR-0020)

- `TaskType` — глобальный справочник типов (ступень 1 — один системный `task` «Задача»; `structural` — задел узлов дерева проекта).
- `Workflow` (`kind: task | personal`) → `WorkflowStage` (стадия = колонка, `systemState`, архивация вместо удаления) + `WorkflowTransition` (`fromStageId` null = из любой; `rules` — `conditions` / `validators` / `postFunctions` закрытого реестра `@nodus/contracts`).
- `WorkflowScheme` + `WorkflowSchemeEntry` — «тип → маршрут»; системная схема по умолчанию для задач без проекта.
- `Task` хранит `typeId + workflowId + stageId` и денормализует `systemState`, `spentMinutes`, `checklistDone/Total`, `commentsCount` в той же транзакции.
- `TaskParticipant` (coexecutor | observer), `TaskPersonalPlacement` («Мой план»), `TaskChecklistItem`, `TaskRelation`, `TimeEntry`, `TaskResult`.
- Ключи порядка (`stage_order`, `sort_order`) — fractional-index base62 (`lib/fractional-index.ts`), колонки `COLLATE "C"`; keyset `(order, id)`.

**Системный каталог** (`catalog/system-catalog.ts`) создаёт `CatalogBootstrap` при старте api: недостающее по `code` создаётся, существующее не перезаписывается. Новый тип/маршрут ступени 2 — запись в каталоге (или данные), не миграция.

Маршрут «Задача»: Новая (backlog) → В работе (active) → Ждёт контроля (done) → Завершена (closed); Отложена (paused); Отменена (closed). «Завершить» — гейт `no_open_subtasks` + `route_if_accept_required` (флаг задачи «принять после завершения» уводит в «Ждёт контроля»).

## Права и видимость

- **Видимость** — единственная функция `access/task-visibility.ts` на все чтения: участники (постановщик, ответственный, соисполнители, наблюдатели), их руководители по оргструктуре (read-порт `ORG_STRUCTURE_READER`, ADR-0012), `task.view_all` (все задачи; флаг `confidential` — крючок без влияния на видимость до появления потребителя). Чужая задача = 404. `scope=mine` — только своё участие.
- **Действия** — `access/task-access.ts`: правка и участники — постановщик/ответственный; время — ответственный/соисполнители; чек-лист отмечают и соисполнители; удаление — постановщик; `task.manage_any` — всё. Наблюдатель только читает.
- **Переходы** — условия «кто» из правил перехода (`task.manage_any` проходит всегда); гейты DoR/DoD → `409 TASK_TRANSITION_BLOCKED` с `details.reasons`; обход — `override` + `reason` и право `task.override_gate` (причина — в событии `task.stage_changed`, история).
- Подзадача и смена родителя — нужен `canEdit` на родителе (иначе наблюдатель заблокировал бы чужую задачу гейтом подзадач). Новая задача стартует только в стадии состояния `backlog` (колонка «Моего плана» — лишь размещение): создание не обходит маршрут.
- «В задачу» и закреп сообщения в результате — только видимые актору сообщения (read-порт `CHAT_MESSAGE_ACCESS` модуля chat через `ChatPortsModule`); дедуп — одна живая задача на сообщение у постановщика.
- Создание — `task.create`. Назначение другому сотруднику отдельного права не требует (канон Битрикса; `task.assign` в каталоге прав пока без потребителя).

## API (`/api/v1/tasks`, флаг `tasks`)

| Метод и путь                                                                                                                                          | Что                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /tasks`                                                                                                                                          | Фиды: `stageId` (глобальная колонка), `personalStageId` («Мой план»), иначе по номеру; фильтры `scope`, `role`, `overdue`, `parentId`, `projectId`, `assigneeId`, `typeId`, `search` (название / «ПП-N») |
| `GET /tasks/stages?scope=` · `GET /tasks/types`                                                                                                       | Стадии маршрута по умолчанию со счётчиками `count/overdueCount`; типы                                                                                                                                    |
| `POST /tasks` · `POST /tasks/:id/subtasks`                                                                                                            | Создание (колонка, проект, тип — необязательны; `sourceMessageId` — «В задачу», дедуп)                                                                                                                   |
| `GET/PATCH/DELETE /tasks/:id`                                                                                                                         | Карточка (`access`, `result`, `chain`); правка полей и перенос (перенос = переход маршрута); мягкое удаление                                                                                             |
| `GET /tasks/:id/branch`                                                                                                                               | Ветка от корня, невидимые узлы маскируются                                                                                                                                                               |
| `GET /tasks/:id/transitions` · `POST /tasks/:id/transitions/:transitionId`                                                                            | Кнопки маршрута с причинами блокировки; выполнение                                                                                                                                                       |
| `GET/POST/PATCH/DELETE /tasks/personal-stages`                                                                                                        | Колонки «Моего плана» (последнюю колонку состояния удалить нельзя — `TASK_LAST_STAGE`)                                                                                                                   |
| `POST/DELETE /tasks/:id/participants`                                                                                                                 | Соисполнители и наблюдатели                                                                                                                                                                              |
| `POST/PATCH/DELETE /tasks/:id/checklist`                                                                                                              | Чек-лист (отметка, текст, перестановка `index`)                                                                                                                                                          |
| `GET/POST /tasks/:id/time-entries` · `DELETE /tasks/time-entries/:id` · `POST /tasks/:id/timer/start` · `POST /tasks/timer/stop` · `GET /tasks/timer` | Время и таймер (один идущий на сотрудника)                                                                                                                                                               |
| `GET/POST /tasks/:id/results` · `GET/POST/DELETE /tasks/:id/relations` · `GET /tasks/:id/history`                                                     | Результат (ревизии), связи, история (event log)                                                                                                                                                          |
| `POST /tasks/bulk`                                                                                                                                    | Массовые операции до 100 задач, результат по каждой                                                                                                                                                      |

Все мутации — `Idempotency-Key` (ADR-0005) + аудит; списки — курсор.

## События (`TASK_EVENTS`, каталог api-conventions.md)

`task.created / updated / stage_changed / status_changed / personal_stage_changed / assigned / participants_changed / checklist_changed / completed / overdue / time_logged / timer_started / timer_stopped / result_set / relation_changed / deleted`, `task.personal_stage_created / updated / archived`. Payload несёт `audience` — gateway рассылает событие в user-комнаты (`fanout.ts`). Подписчики: notifications (`events/task-events.handler.ts`: назначение, выполнение, возврат, просрочка); chat (#252: беседа задачи).

Автоперемещение «Моего плана» — синхронно в транзакции смены состояния (`personal/placements.ts`). Просрочка — `events/overdue.scanner.ts` (BullMQ, каждые 5 минут, однократно; смена срока сбрасывает метку).

## Лимиты и границы

- **Файлы задачи — вложения её чата** (#252): отдельного файлового хранилища у задачи нет (одна механика вложений, без дублирования; доступ к файлу = участие в беседе задачи = участие в задаче). Ссылка на файл-результат на сервере — ступень 2.
- Колонок «Моего плана» — не больше 30 на сотрудника; самоснятие с задачи — только наблюдателю.
- Чат задачи здесь не живёт: `/tasks/:id/messages` на бэкенде нет (канон #252 — одна беседа мессенджера `type='task'`).
- `project` в DTO — `null` до бэкенда проектов (ступень 3); `projectId` хранится.
- Таймер пишет не больше 1440 минут одной записью; дата записи таймера — UTC-день старта.
- Подзадачи: глубина не ограничена, циклы — `TASK_PARENT_CYCLE`; удаление родителя поднимает детей к деду.
- Каскад дат автоматикой не делается: веб предлагает «подвинуть подзадачи» сам (#311).
