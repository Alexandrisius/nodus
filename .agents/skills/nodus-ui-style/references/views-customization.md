# Таблицы и кастомизация представлений (`shared/views`)

Инфраструктура всех модулей: `apps/web/src/shared/views/` (`view-store.ts`, `use-view-fields.ts`, `view-settings.tsx`, `column-resizer.tsx`). Эталон применения — `features/tasks` (реестр `lib/task-fields.tsx`, список, канбан).

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

DropdownMenu с чекбоксами (`onSelect={e => e.preventDefault()}` — иначе меню закрывается после первого пункта!) + «Сбросить настройки». Поле `locked` — disabled. В шапке страницы по активному виду: `viewKey={view === 'list' ? 'tasks.list' : 'tasks.kanban'}`.

### Карточки канбана

Реестр блоков (`taskCardFields`), видимость через `isVisible(id)` из `useViewFields('tasks.kanban', …)` в родителе канбана, прокинуть предикат в карточку; группа-футер скрывается, если все её поля выключены.

## Канбан: drag-and-drop (ADR-0007, @dnd-kit/core+sortable)

- Колонка = `SortableContext` (verticalListSortingStrategy) + `useDroppable` (id = stage.id; пустая колонка видима, принимает перенос, моно-подсказка).
- Карточка = `useSortable`; трансформ sortable применяется ВСЕГДА (и у активного): он двигает полупрозрачный слот к проекционной позиции; призрак — `DragOverlay` (карточка в стиле активного узла: border-input + свечение).
- Живой переезд между колонками — в `onDragOver` (индекс от карточки под указателем, ниже/выше центра); финиш — персист стадии+индекса (`PATCH`, оптимистично I4, откат+тост); Esc — откат к снапшоту dragStart; борд — локальное состояние, синхронизированное с query вне переноса.
- Collision — официальная multi-container стратегия (`lib/kanban-collision.ts`: pointerWithin → closestCenter внутри колонки, кэш lastOverId).
- **Предохранители цикла update depth (обязательны):** анти-осциллятор (кадр после межколоночного переноса игнорируем, сброс rAF-ом) и гейт `isSameOrder` (идентичный порядок не создаёт setState) — механизмы в `docs/gotchas.md`.
- Сенсоры: PointerSensor `distance: 6` (клик без движения = слайдер), TouchSensor delay 200, KeyboardSensor `sortableKeyboardCoordinates`.
- Перестановки борда — чистые функции с тестами: `lib/kanban-board.ts`.

## Дерево-граф вложенности (список задач)

`lib/task-tree.ts` → `components/task-list-graph.tsx` (SVG per row):

- `buildTaskRows(items)` — DFS: корни в исходном порядке, дети за родителем; строка = `{ task, depth, passThrough[], elbowFrom, isLast, hasChildren, childCount }`.
- **Сквозная вертикаль уровня d живёт, пока предок d+1 НЕ последний** (`ancestorIsLast[d+1] === false`) — ошибка здесь рисует «хвост» у последнего потомка.
- Локоть — `orthPath(points, 6)`; порт уровня d на `x = 14 + d·16`; каскадная отрисовка локтей (`node-edge-draw`, delay `index*30ms`); ховер строки подсвечивает сегмент (`currentColor` + `group-hover/row`).
- **Сворачивание** («как папки в проводнике»): порт родителя — кнопка «−»/«+» (r=7), `filterVisibleRows(rows, collapsed)`, у свёрнутой — счётчик `+N` (childCount — все потомки).
