# Модель данных (верхнеуровневая)

Фиксирует состав и связи сущностей; детальная схема — в Prisma (`prisma/`). Новые **доменные** сущности — через ADR; вспомогательные таблицы (join, настройки) добавляются по мере реализации без ADR.

Читать: перед проектированием миграций и новых сущностей.

## Сущности

- **User** (id, email, ФИО, должность, отдел→Department, роль, настройки уведомлений, аватар, presence-статус)
- **Department** (дерево: parent_id)
- **Project** (код, название, стадия, руководитель, даты, chat_channel_id, статус) — **ProjectMember** (project_id, user_id, роль в проекте)
- **ProjectGroup** (название, parent_id?) — портфели/программы: дерево группировки проектов (по заказчикам, типам объектов, годам)
- **WorkPackage** (project_id, название, порядок, ответственный-ГИП) — этап/пакет работ для группировки задач; НЕ задача: без чата, исполнителя и трудозатрат
- **Task** (номер, проект?, родитель?, пакет→WorkPackage?, название, описание, **системное состояние: backlog|active|paused|done|closed** (скрытое, системное, I15-граница), **stage_id→WorkflowStage**, приоритет, дедлайн, постановщик, ответственный, соисполнители[], наблюдатели[], source: manual|chat_message|letter, связь→Message/Letter?, теги)
- **WorkflowScheme** (код, название, правило применения: фильтр по типу задачи/полям/проекту, приоритет правила) — набор стадий, привязанный к **типу задачи**, а не к проекту — **WorkflowStage** (scheme_id, название, порядок, → системное состояние, права переходов, автоматические действия при входе/выходе — V2); стадия = колонка канбана; переходы пишут событие `task.stage_changed`
- **ChecklistItem**, **TimeEntry** (task_id, user_id, минуты, дата, способ: timer|manual, комментарий)
- **TaskResult** (task_id, текст результата, закреплённые сообщения: message_id[], автор, created_at) — результат задачи; в V3 дополняется ИИ-выжимкой обсуждения
- **Conversation** (тип: direct|group|project_channel; project_id?; title) — **ConversationMember** (роль, last_read_message_id, mute)
- **Message** (conversation_id, автор, текст, reply_to?, **thread_root_id?** (тред — ровно один уровень вложенности), topic_id?, клиентский ID для идемпотентности, edited_at, deleted_at) — **MessageReaction**, **MessageAttachment**, **PinnedMessage**, **ThreadParticipant** (thread_root_id, user_id, источник подписки: автор|ответил|наблюдатель, mute) — уведомления о треде только участникам
- **Letter** (тип: incoming|outgoing; рег. номер, дата рег., от/кому, тема, тело, message_id оригинала письма, статус, проект?, срок исполнения?) — **LetterAttachment**, **Resolution** (letter_id, текст резолюции, автор, → task_id созданного поручения)
- **WorkflowDefinition** (код, название, JSON-схема шагов) — **WorkflowInstance** (объект-связка, текущий шаг, история действий, статус, дедлайны шагов)
- **FileObject** (бакет-ключ, имя, mime, размер, владелец, контекст: task|letter|project|message + id) — **FileVersion** (версия, ключ, автор, preview_key?)
- **Notification** (получатель, тип, payload-ссылка на сущность, каналы, прочитано) — **NotificationPreference**
- **EventLog** (id, тип события, actor, aggregate_type/id, payload JSONB, created_at) — append-only, инвариант I9
- **AuditLog** (actor, действие, сущность, детали, ip/user-agent) — append-only
- **Revision** (entity_type, entity_id, поле, old_value, new_value, author, created_at) — версии diff-аемого контента: описание задачи, тело письма, текст сообщения. Поле-уровневая история остальных изменений покрыта EventLog (I9)
- **FeatureFlag** (ключ, включён, scope)
- **Session** (user_id, refresh-token hash, устройство/user-agent, ip, expires_at, revoked_at) — ротация и отзыв сессий
- **PushSubscription** (user_id, endpoint, ключи p256dh/auth, user-agent)
- **FieldDefinition** (код, название, тип: text|number|date|money|bool|enum|multienum|user_ref|entity_ref|file, `dictionary_id` для enum/multienum, конфиг валидации, обязательность, сущность-область: task|project|letter|user|workflow, группа/порядок, права чтение/запись, активен) — реестр кастомных полей; значения в JSONB-колонке `custom_fields` каждой сущности (GIN-индекс); **элементы списков хранятся по ID элемента справочника** (I15); поля «индексировать для отчётов» материализуются в типизированные генерируемые колонки
- **Dictionary** (код, название, иерархический?, права редактирования) — **DictionaryItem** (dictionary_id, parent_id?, название, код?, порядок, активен/архивен) — архивация вместо удаления (I15)
- **EntityLink** (from: тип+id, to: тип+id, тип связи: related|derived_from|blocks|belongs_to, автор, created_at) — универсальные связи поверх явных FK; основа графа знаний портала

## Правила схемы

- Суррогатные UUID PK; `created_at/updated_at` везде; FK с onDelete явно.
- Мягкое удаление только там, где есть бизнес-смысл (сообщения, файлы).
- Индексы под запросы списков и FTS — с первой миграции.
- Классификаторы сущностей (тип объекта, тип проекта, вид работ) — обязательные кастомные поля (I14); перечень утверждается владельцем.
- Таблица `messages` партиционируется по месяцам сразу (дешевле сейчас, чем мигрировать 100 млн строк потом).
- Миграции задним числом не изменяются — только новые миграции.
