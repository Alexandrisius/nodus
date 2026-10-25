# modules/crm — контрагенты и контактные лица

Master-данные внешних организаций (ADR-0033, #460): заказчики, подрядчики,
поставщики, госорганы + их контактные лица. На контрагента ссылаются
корреспонденция (корреспондент и подписант письма, #55) и проекты (заказчик,
#52) — **plain UUID без FK** (I3). Лиды/сделки/воронки не моделируются.

Модуль за фичефлагом `crm` (I10): выключенный отвечает 404 как
несуществующий. Флаг и права `crm.create`/`crm.manage` доезжают до любой
установки миграцией (`20261027120000_crm_counterparties`), сид повторяет для
свежей установки.

## API (`/api/v1`, `@RequireFeature('crm')`)

| Метод и путь                                                        | Право        | Что                                                                                   |
| ------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------- |
| `GET /counterparties?search=&includeArchived=&cursor=&limit=`       | —            | реестр: keyset по `(short_name, id)`, поиск по названию/УНП, архив скрыт по умолчанию |
| `GET /counterparties/similar?name=&unp=`                            | —            | подсказка похожих (≤ 5): точный УНП + нечёткое сходство названия                      |
| `GET /counterparties/:id`                                           | —            | карточка (в том числе архивная): реквизиты, контакты, счётчики                        |
| `POST /counterparties`                                              | `crm.create` | создание (в т.ч. «на лету»); 409 `CRM_UNP_TAKEN`                                      |
| `PATCH /counterparties/:id`                                         | `crm.manage` | правка реквизитов (частичная); архивная запись — 409 `CRM_COUNTERPARTY_ARCHIVED`      |
| `POST /counterparties/:id/archive`, `…/restore`                     | `crm.manage` | архив / возврат (идемпотентно)                                                        |
| `POST /counterparties/:id/contacts`                                 | `crm.create` | добавить контактное лицо                                                              |
| `PATCH /counterparties/:id/contacts/:contactId`                     | `crm.manage` | правка контакта (контакт обязан принадлежать контрагенту, иначе 404)                  |
| `POST /counterparties/:id/contacts/:contactId/archive`, `…/restore` | `crm.manage` | архив / возврат контакта (идемпотентно)                                               |

Чтение открыто всем сотрудникам: справочник общий, без персональных данных
(north-star §6, «читают все, меняет администратор»). **Удаление** (вердикт
владельца 25.10.2026) разрешено только записям без связей: если на
контрагента ссылаются письма или проекты (`counterparty_usages`), ответ
409 `CRM_COUNTERPARTY_IN_USE` — история неприкосновенна, путь — архив.
Контактное лицо удаляется физически (внутренняя запись карточки). Архивный
контрагент не выбирается в подсказках и ссылках, но виден в истории
писем/проектов.

## Данные

- `counterparties` — краткое/полное название, УНП (`UNIQUE`, нормализуется
  контрактом `unpInputSchema`: «УНП 100 123 456» → `100123456`; NULL-ы
  различны → «уникален, если указан»), адрес, e-mail, телефон, `custom_fields`
  JSONB (запись — с #431), `archived_at`.
- `contact_persons` — контрагент (FK Restrict), ФИО, должность, e-mail,
  телефон, `archived_at`.
- `counterparty_usages` — проекция «кто ссылается»: PK
  `(source_kind, source_id)` (`letter` | `project`), `counterparty_id`.
  Источник счётчиков `lettersCount`/`projectsCount`; пишут обработчики #55/#52,
  в #460 таблица пуста — нули честные, а не заглушка в мэппере.

## Подсказка похожих

`GET /counterparties/similar` — `word_similarity` из `pg_trgm` (расширение
ставит миграция): ловит опечатки, кавычки и порядок слов. Название
нормализуется (`counterparty-match.ts`): нижний регистр, `ё→е`, несловесное →
пробел, организационно-правовые формы отбрасываются (техническая нормализация
сравнения, не бизнес-список I15). Порог — константа `SIMILAR_NAME_THRESHOLD`
(0,45). Порядок: точный УНП → сходство → алфавит. Архивные — с пометкой
`archivedAt`, клиент их не выбирает.

**Лимиты.** На масштабе компании (сотни–тысячи записей) запрос — последовательный
проход, миллисекунды. При росте (импорт Е-дела #451) перейти на оператор `%>` с
`SET LOCAL pg_trgm.word_similarity_threshold` — тогда работает GIN-индекс.

## События (`crm.*`, api-conventions.md)

`crm.counterparty_created {counterpartyId, shortName, unp}` ·
`crm.counterparty_updated {counterpartyId, fields}` ·
`crm.counterparty_archived {counterpartyId}` ·
`crm.counterparty_restored {counterpartyId}` ·
`crm.counterparty_deleted {counterpartyId, shortName}` ·
`crm.contact_changed {counterpartyId, contactId, change: added|updated|archived|restored|deleted, fields?}`.
Без `audience` (realtime-рассылка CRM не нужна: свежесть — staleTime и
инвалидации мутаций). Персональных данных контактов в payload нет.
Подписчиков в #460 нет; первый — счётчики писем в #55.

## Read-порт (ADR-0012)

`COUNTERPARTY_READER` (`ports/counterparty-reader.port.ts`, экспорт —
`CrmPortsModule`): `refs(ids)` — ссылки пачкой, включая архивных (история
рендерится); `activeRef(id)` — действующий контрагент для записи ссылки
(`null` — нет или в архиве). Порт работает и при выключенном флаге: флаг
закрывает HTTP, письма продолжают показывать корреспондентов (I10). Методы
контактов (`contactRefs`, `activeContact`) добавит #55, адреса — #464.

## Файлы

```
counterparties/  контроллер, сервис мутаций, сервис чтений (список/карточка/похожие),
                 репозиторий (единственная точка Prisma к counterparties/usages),
                 нормализация названия, мэппер DTO
contacts/        контроллер (база counterparties/:counterpartyId/contacts), сервис, репозиторий
ports/           read-порт и провайдер
```

`crm-ports.module.ts` — тонкий модуль экспорта порта; `crm.module.ts` — HTTP-слой.
