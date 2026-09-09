# Примитивы «Инструмента»

Живут в `packages/ui/src/components/node-*.tsx` (движок) и `apps/web/src/shared/ui/` (составные). Сигнатуры — из реального кода; при смене сигнатуры — править этот файл в том же коммите (правило зеркала).

## Движок (`@nodus/ui/components/*`)

### NodeEdge — ортогональное ребро

```tsx
import { NodeEdge, orthPath, pathLength } from '@nodus/ui/components/node-edge';

<NodeEdge
  points={[{ x: 0, y: 0 }, { x: 0, y: 40 }, { x: 60, y: 40 }]}
  pulse="once"        // false | true | 'once'
  active              // foreground + drop-shadow(var(--glow))
  drawOn              // отрисовка от начала к концу при монтировании
  ports="end"         // 'both' | 'end' | 'none' — точки-порты на концах
  elbow={8}           // радиус локтей
/>
```

- SVG `absolute inset-0` в позиционируемом контейнере, координаты — px контейнера, `overflow-visible`.
- `snapPx(v)` — привязка координаты прямой линии к полупикселю устройства (равномерная яркость hairline на любом зуме/DPR); применять к координатам прямых сегментов своих SVG-рёбер (контур, док-ребро).
- Скорости: пульс 400 px/s, рисовка 1200 px/s (длительность = длина/скорость — темп един на любых маршрутах).
- SMIL-пульс: `fill="freeze"` + opacity-гейт (иначе «светящийся пиксель» в (0,0) — см. circuit.md).
- `prefers-reduced-motion` — анимации выключены.
- Перемонтирование через `key` перезапускает одноразовые анимации.

### NodeLabel — моно-метка раздела

```tsx
<NodeLabel label="Стадия" count={4} chevron="down" className="truncate" />
```

UPPERCASE 11px, tracking 0.16em, muted; счётчик — `text-foreground tabular-nums`.

### NodeChip — моно-чип (ключ, статус, счётчик)

```tsx
<NodeChip tone="info">В работе</NodeChip>
// tones: muted | active | success | warning | danger | info
```

`active` — со свечением. Иконка внутри — `size-3`.

### NodeCard — панель с моно-шапкой

```tsx
<NodeCard label="Новости" count={3} actions={<Button />}>…</NodeCard>
```

### `node-panel` (CSS-утилита)

Плоская панель: `bg-card`, `border: 1px var(--border)`, `radius-lg`. Класс — `className="node-panel"`.

### Анимационные утилиты (globals.css)

- `node-edge-draw` — рисовка пути (нужен `pathLength={1}` на path).
- `dock-edge-fade` — растворение вспышек контура за 1 с (circuit-frame); док-ребро слайдера больше не использует.

## Составные (`apps/web/src/shared/ui/*`)

### PersonAvatar — графитовый аватар

```tsx
<PersonAvatar name={user.displayName} avatarUrl={user.avatarUrl} className="size-6" />
```

Детерминированный тон из графитовой палитры по имени (одинаковый в обеих темах); инициалы — 2 первые буквы слов.

### DeadlineChip — чип срока

```tsx
<DeadlineChip deadline={task.deadline} />
```

Просрочен → `bg-danger-soft text-danger` (+ `· Просрочена`); сегодня → warning; далее — нейтральный; `null` → «Без срока».

### SendHexButton — фирменная отправка (гексагон)

```tsx
<SendHexButton disabled={!text.trim()} label={ui.tasks.send} />
```

Единая кнопка отправки для чата и обсуждений сущностей (замена самолётику). Использовать всегда в формах сообщений.

### DomainChain — доменная цепочка сущности

```tsx
import { DomainChain, type ChainNode } from '../../../shared/ui/domain-chain.js';

const nodes: ChainNode[] = task.chain.map((node, i) => ({
  caption: 'Письмо',          // моно-метка типа (i18n)
  ref: 'Вх-2026/118',         // ключ узла
  label: 'Замечания по КЖ',   // содержание (truncate max-w-56)
  state: 'Согласовано',       // опц., text-success
  active: i === task.chain.length - 1,  // текущая сущность — светится
  onClick: node.entityId ? () => navigate(...) : undefined,  // кликабельные узлы
}));
<DomainChain nodes={nodes} />
```

Шапка карточки сущности: Письмо → Резолюция → Поручение → Задача (реф `03-domain-chain.png`); узлы-плашки, рёбра с портами по концам (CSS, центровка трансформами).

## shadcn-компоненты в новом UI

Button (ghost для иконок хрома), Input, Textarea, Checkbox, DropdownMenu (+CheckboxItem для шестерёнки), Separator, Skeleton, Tooltip, Message/Bubble/Attachment (обсуждения), sonner. Все — на токенах темы; кастомные цвета не переопределять (навык `shadcn`).

## Антипримеры (запрещено)

- `<Badge variant="secondary" className="bg-info-soft text-info">` для статусов — вместо этого `NodeChip tone="info"`.
- Иконка-«самолётик» отправки — вместо этого `SendHexButton`.
- Точки-порты «на глаз» абсолютными координатами — только из геометрии/трансформов.
- Свечение на неактивных элементах; пульсы по таймеру (только события фокуса/открытия).
