# features/counterparties

Справочник контрагентов (модель v2 корреспонденции, вердикт владельца
22.09.2026, issue #69): внешние организации — заказчики, подрядчики,
поставщики, госорганы. **НЕ CRM**: лиды/сделки/воронки не моделируются.
Корреспондент письма — ссылка на контрагента (counterpartyRef), не строка
(I15); у проекта — поле «Заказчик» (контрагент).

## Состав

- `pages/counterparties-page.tsx` — раздел `/counterparties` (nav-registry):
  реестр канонической таблицей shared/views (ключ `counterparties.list`,
  колонки `lib/counterparty-fields.tsx`: название, полное название, УНП,
  счётчики писем/проектов/контактов), поиск по названию/УНП, «Создать
  контрагента» (`components/counterparty-create-dialog.tsx` — полная форма:
  полное/краткое название, УНП, адрес).
- `components/counterparty-card.tsx` — карточка в стеке (CardKind
  'counterparty', ADR-0009): реквизиты, контактные лица (добавление
  инлайн-формой), связанные письма (shared useLettersList по counterpartyId)
  и проекты (поле «Заказчик»); клик по связи — карточка стеком.

## Общие части (shared, I6)

API-хуки и автокомплит живут в `shared/counterparties/` — потребители и эта
фича, и корреспонденция (карточка регистрации, композер исходящего):
`api.ts` (counterpartiesKeys, useCounterpartiesList/useCounterpartyCard,
оптимистичные useCreateCounterparty/useAddContactPerson, I4) и
`counterparty-combobox.tsx` (textbox с подсказками — модель Битрикс24, тот
же гард Radix, что у FilterCombobox; создание «на лету» одной строкой:
имя = введённый текст, реквизиты дополняются в карточке).

## Контракты и моки

`packages/contracts/src/counterparties/counterparty.schemas.ts`:
counterpartyRefSchema {id, name}, contactPersonSchema, listItem (полное/
краткое название, УНП, денормализованные счётчики связей — I14), card
(+адрес, контактные лица), list/create/add-contact схемы.
Эндпоинты (моки `api/mocks/counterparties-handlers.ts`):
`GET /counterparties?search=`, `GET /counterparties/:id`,
`POST /counterparties`, `POST /counterparties/:id/contacts`.
Демо-данные: `shared/mocks/data/counterparties.ts` (5 организаций живой
истории: Галургия-заказчик 0359, СтройЗаказчик, Минстройархитектуры (СМДО),
ТехСнаб, ПромСтройМонтаж) + общий ящик и словарь видов документа.

## Границы

Удаление контрагента не моделируется (в бою — архивация, I15). Письма и
проекты фича только ЧИТАЕТ через shared-хуки (cross-feature импорт запрещён).
Бэкенда нет — концепт на MSW (ADR-0001).
