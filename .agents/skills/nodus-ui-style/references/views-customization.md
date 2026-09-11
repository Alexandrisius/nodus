# Таблицы и кастомизация представлений (`shared/views`)

Инфраструктура всех модулей: `apps/web/src/shared/views/` (`view-store.ts`, `use-view-fields.ts`, `view-settings.tsx`, `column-resizer.tsx`, `data-table.tsx`). Эталон применения — `features/tasks` (дерево-реестр `lib/task-fields.tsx`, список, канбан).

**Единые доменные реестры (стандарт владельца, раунд 3 — «модули не отличаются»):** плоские таблицы задач/проектов и блоки карточки канбана объявлены ОДИН раз в shared — `task-table-fields.tsx` (`makeTaskTableFields({ projectVisible })`), `task-card-fields.ts` (`makeTaskCardFields({ projectVisible })`), `project-table-fields.tsx` (`projectListFields`). Потребители берут фабрику/реестр и СВОЙ viewKey (память раздельная: `tasks.list`, `projects.tasks`, `directory.tasks`…). Реестры — module-константы (стабильная идентичность для `useViewFields`). Новое поле сущности = +1 запись в shared-реестре (+ дерево-реестр задач при необходимости).

## Модель таблицы (AG Grid / Excel / Битрикс — утверждено research)

1. **Все колонки — фиксированные px-треки** (включая «Название»!). **fr запрещён**: резиновая колонка компенсирует дельту ресайза — ручка отрывается от курсора, колонка «растёт не туда» (gotchas).
2. Контейнер: `h-full overflow-auto`; хедер и строки — **единый grid** `w-max min-w-full` с одинаковым `gridTemplateColumns` (колонка графа 54px + поля). Пустое место — справа; переполнение — горизонтальный скролл.
3. **Ресайз** (`ColumnResizer` на грани хедера, у всех колонок КРОМЕ последней видимой): drag меняет только свою колонку (соседние сдвигаются, ширины не меняют — это стандарт), clamp `minWidth..maxWidth`; ручка следует за курсором 1:1.
   - `minWidth` — под осмысленный контент поля (контент нельзя «спрятать»);
   - `maxWidth` — 640 дефолт (нельзя «растянуть навсегда»);
   - **dblclick = автоподбор по контенту** (Excel): сумма `scrollWidth` ДЕТЕЙ ячеек + gaps + 24px (scrollWidth самой ячейки ≥ clientWidth — вернёт ширину трека, не использовать).
4. **Сужение** — контент обрезается аккуратно: ячейки `min-w-0 overflow-hidden`, текст `truncate` (не «исчезает молча»).
5. **Строка** — `role="button" tabIndex={0}` + Enter/Space (вложенных `<button>` в `<button>` быть не должно; граф-ветка — отдельная кнопка со `stopPropagation`).
6. Хедер sticky `top-0 z-10 bg-background`; `NodeLabel` заголовки; шестерёнка — в шапке страницы модуля (контент — по активному виду).

## Кастомизация представлений

### Реестр полей модуля (новое поле = +1 строка)

```tsx
// features/<module>/lib/<module>-fields.tsx
export const taskListFields: ListFieldDef[] = [
  {
    id: 'stage',
    label: ui.tasks.fieldStage,   // i18n из contracts
    defaultVisible: true,
    defaultWidth: 128,
    minWidth: 116,                // под самый длинный чип
    locked: false,                // title — locked: true (нельзя скрыть)
    render: (task, ctx) => <TaskStatusBadge stage={task.stage} />,
  },
  // …
];
export const taskCardFields: FieldDef[] = [ /* поля карточки канбана, без ширин */ ];
```

`FieldDef`: `id, label, defaultVisible, defaultWidth?, minWidth?, maxWidth?, flex? (устар., не использовать), locked?`; `ListFieldDef` добавляет `render(task, ctx)`.

### Хук и пресет

```tsx
const { visibleFields, isVisible, toggleField, setWidth, reset } = useViewFields('tasks.list', taskListFields);
```

- Пресет — zustand persist `nodus-views-v1` (схема — contracts `viewPresetSchema`; на проде то же DTO — API персонализации). Слияние реестр⊕сохранённое: новые поля модуля подхватываются дефолтами, неизвестные ключи отбрасываются (без миграций).
- Ширина таблицы: `visibleFields.map(f => `${f.width ?? 120}px`).join(' ')` — и хедеру, и строкам.

### Шестерёнка (`ViewSettings`)

```tsx
<ViewSettings viewKey="tasks.list" defs={taskListFields} />
```

DropdownMenu с чекбоксами (`onSelect={e => e.preventDefault()}` — иначе меню закрывается после первого пункта!) + «Сбросить настройки». Поле `locked` — disabled. Живёт в правом конце строки инструментов (`ListToolbar`), НЕ в таб-баре карточки и не в шапке страницы.

## Строка инструментов списка (`ListToolbar`, раунды 4–5)

У КАЖДОГО журнала и вкладки-списка — один компонент. Модель Битрикс24: ОДНА поисковая строка (placeholder — короткий «Поиск…»; в фокусе поле РАСШИРЯЕТСЯ w-52→w-80), из которой выезжает панель фильтра — **отдельной кнопки «Фильтр» НЕТ**. Панель (`filter-panel.tsx`): слева колонка пресетов (встроенные реестра + сохранённые; клик применяет, активный подсвечен `sameFilterState`, «скрепка» = pinnedId в `nodus-list-filters-v1:<viewKey>`; свои удаляются), справа поля по атрибутам (мгновенное применение), «Сбросить». Чипы активных фильтров — в строке; слоты `left` (вид) / `right` (счётчики, шестерёнка).

```tsx
const toolbar = useListToolbar('projects.tasks', taskBuiltinPresets); // встроенные пресеты — вторым аргументом
const defs = useTaskFilterDefs({ projectVisible: false }); // реестр полей
const filter = useMemo(() => ({ defs, state: toolbar.filters, query: toolbar.query, searchText: taskSearchText }), [...]);
const rows = useFilteredList(items, filter);               // или проп filter в TaskList/TaskKanban

// Страница: шапка ОДНОЙ строкой h-14 (заголовок + счётчик + тулбар flex-1 + шестерёнка)
<ListToolbar className="min-w-0 flex-1 px-0" toolbar={toolbar} defs={defs} builtinPresets={taskBuiltinPresets} right={<ViewSettings …/>} />
// Карточка (вкладка): тулбар с нижней границей
<ListToolbar className="border-b border-border" toolbar={toolbar} defs={defs} builtinPresets={…} left={<ViewToggle …/>} right={<ViewSettings …/>} />
```

- **Реестр фильтруемых полей** — `shared/views/<entity>-filter-fields.ts`: `FilterFieldDef<T> = { id, label, type, options?, hidden?, match }` — чистый предикат (unit-тесты `list-filters.test.ts`); `hidden: true` — служебные поля (в панель не выводятся; напр. `overdue` задач: его используют пресет «Просрочены» и счётчик-чип в шапке журнала, клик по которому включает фильтр — модель Битрикс24). Справочники опций — shared-хуки (`shared/api/users-list`, `projects-list`, `task-stages` — единые ключи кэша, I6).
- **Фильтрация** — `applyListFilters` (подстрока запроса по `searchText` + AND активных полей); запрос эфемерен (не персистится), фильтры и пресеты — localStorage; закреплённый пресет (встроенный или свой) применяется по умолчанию при открытии списка.
- **Канбан:** фильтр сужает только отображение; шапки «n из m» (проп `total` BoardColumn); DnD при активном фильтре выключен (`disabled` BoardSortableCard — перестановка по урезанному набору дала бы ложные индексы).
- **Два поиска не конкурируют:** глобальный «Умный поиск» — лупа в правой группе топбара (Ctrl+K, палитра прежняя); большого поля в центре топбара НЕТ.
- **Панель из фокуса, не из триггера:** Popover с `PopoverAnchor` (НЕ Trigger — клик по полю не должен тогглить), `open` управляем onFocus (клавиатура) + onClick (мышь; указательный гард), `onOpenAutoFocus` отменён (фокус остаётся в поле — печатать можно сразу), `onInteractOutside` с preventDefault для целей внутри якоря (иначе повторный клик по полю при открытой панели дисмиссит её с инверсией бэтчинга — gotchas).
- **Поля-справочники — комбобоксы** (`filter-combobox.tsx`): ввод фильтрует варианты, person — с аватарами; НЕ сырые `<Select>` (вердикт: «не тупо выпадающий список»).
- **Шапка страницы — без border-b** (полоска под поиском — вердикт), счётчик — голым числом у заголовка.

### Карточки канбана

Реестр блоков (`taskCardFields`), видимость через `isVisible(id)` из `useViewFields('tasks.kanban', …)` в родителе канбана, прокинуть предикат в карточку; группа-футер скрывается, если все её поля выключены.

## Канбан: drag-and-drop (ADR-0007, @dnd-kit/core+sortable)

- Колонка = `SortableContext` (verticalListSortingStrategy) + `useDroppable` (id = stage.id; пустая колонка видима, принимает перенос, моно-подсказка).
- Карточка = `useSortable`; трансформ sortable применяется ВСЕГДА (и у активного): он двигает полупрозрачный слот к проекционной позиции; призрак — `DragOverlay` (карточка в стиле активного узла: border-input + свечение).
- Живой переезд между колонками — в `onDragOver` (индекс от карточки под указателем, ниже/выше центра); финиш — персист стадии+индекса (`PATCH`, оптимистично I4, откат+тост); Esc — откат к снапшоту dragStart; борд — локальное состояние, синхронизированное с query вне переноса.
- Collision — официальная multi-container стратегия (`lib/kanban-collision.ts`: pointerWithin → closestCenter внутри колонки, кэш lastOverId).
- **Плавность (обязательно):** `measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}` — живой переезд меняет раскладку во время drag, дефолтные замеры устаревают → фризы/джиттер на границах; карточка, перемонтированная в чужую колонку во время drag, первый кадр без transition (useMountStatus), иначе скачок с неверных координат; подсветка колонки — `over === stage.id ИЛИ over ∈ cardIds` через `useDndContext()` (collision резолвит over в карточку, а не в колонку — без этого подсветка теряется).
- **Предохранители цикла update depth (обязательны):** анти-осциллятор (кадр после межколоночного переноса игнорируем, сброс rAF-ом) и гейт `isSameOrder` (идентичный порядок не создаёт setState) — механизмы в `docs/gotchas.md`.
- Сенсоры: PointerSensor `distance: 6` (клик без движения = слайдер), TouchSensor delay 200, KeyboardSensor `sortableKeyboardCoordinates`.
- Перестановки борда — чистые функции с тестами: `lib/kanban-board.ts`.
- **Виртуализация колонок (фаза 2, отдельная сессия — дизайн и приёмка в issue #36):** фризы на объёме = reflow от реальной перестановки DOM-узла между колонками (∝ смонтированным карточкам; внутри колонки transform'ы — 0 longtasks); memo/MeasuringStrategy не помогают (замерено). Паттерн: useVirtualizer на скролл-контейнер колонки (measureElement — высоты переменные из-за динамических полей!), SortableContext с ПОЛНЫМ списком id, useDroppable колонки merged-ref, DragOverlay clone-feedback (source-слот может размонтироваться), индекс вставки ниже смонтированного окна — из offset'ов виртуализатора (pointer y → индекс), autoScroll домонтирует офскрин-цели (~1 кадр). Скрытые карточки не «доезжают»: рендер окна читает порядок из состояния — «момента схождения» нет; скролл с зажатой карточкой = тики домонтажа overscan, не reflow колонки.

## Дерево-граф вложенности (список задач)

`lib/task-tree.ts` → `components/task-list-graph.tsx` (SVG per row):

- `buildTaskRows(items)` — DFS: корни в исходном порядке, дети за родителем; строка = `{ task, depth, passThrough[], elbowFrom, isLast, hasChildren, childCount }`.
- **Сквозная вертикаль уровня d живёт, пока предок d+1 НЕ последний** (`ancestorIsLast[d+1] === false`) — ошибка здесь рисует «хвост» у последнего потомка.
- Локоть — `orthPath(points, 6)`; порт уровня d на `x = 14 + d·16`; каскадная отрисовка локтей (`node-edge-draw`, delay `index*30ms`); ховер строки подсвечивает сегмент (`currentColor` + `group-hover/row`).
- **Сворачивание** («как папки в проводнике»): порт родителя — кнопка «−»/«+» (r=7), `filterVisibleRows(rows, collapsed)`, у свёрнутой — счётчик `+N` (childCount — все потомки).
