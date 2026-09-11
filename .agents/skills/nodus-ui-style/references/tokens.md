# Токены «Инструмента» (обе темы)

Источник истины — `packages/ui/src/styles/globals.css`. Компоненты используют только семантические Tailwind-классы на токенах (`bg-background`, `text-muted-foreground`, `border-border`, `bg-edge`…); хардкод hex/rgb запрещён.

## Тёмная (дефолт, `:root`)

| Токен | Значение | Назначение |
|---|---|---|
| `--background` | `#0A0A0B` | фон приложения (near-black, не чёрный) |
| `--card` | `#121214` | панели/карточки (`node-panel`) |
| `--foreground` | `#E8E8E6` | основной текст |
| `--muted-foreground` | `#8A8A8E` | вторичный текст |
| `--primary` / `--primary-foreground` | `#E8E8E6` / `#0A0A0B` | действие — белая кнопка |
| `--border` / `--input` | white/9% / white/14% | бордюры hairline |
| `--success` `#6FA287` · `--warning` `#C9A45B` · `--danger` `#C8584A` · `--info` `#7A93B2` | семантика приглушённая холодная (+`-soft` пары) |
| `--sidebar` | `#0C0C0E` | рейка/полоса (темнее фона) |
| `--edge` | white/28% | линия связи |
| `--port` | `#D9D9D6` | точка-порт |
| `--glow` | white/65% | свечение активного (drop-shadow) |
| `--scrollbar` | white/10% | едва заметный скроллбар 3px |

## Светлая (`[data-theme='light']`)

Отдельный дизайн, НЕ инверсия (вердикт команды владельца 2026-09-11, реф `docs/mvp/ref/node-based UI/реф_белая тема_*.png`): три ступени поверхностей (светло-серый шелл → тёплый светлый холст → БЕЛЫЕ карточки), hairline-бордюры, элевация ступенью без теней; фирменный navy `#16233A` — хирургический акцент (primary, фокус, чекбоксы, активный модуль); контур/порты — «чертёжный синий» (navy с alpha).

| Токен | Значение |
|---|---|
| `--background` / `--card` | `#FBFAF8` / `#FFFFFF` |
| `--sidebar` / `--secondary`,`--muted` / `--accent` | `#EFEEEA` / `#EDECE8` / `#E7E5DF` |
| `--foreground` / `--muted-foreground` | `#1B1C1E` / `#6B6D72` |
| `--primary` / `--primary-foreground` | `#16233A` (navy) / `#FFFFFF` |
| `--border` / `--input` | black/8% / black/13% |
| `--success` `#2E7D57` · `--warning` `#8F6A10` · `--danger` `#C0392B` · `--info` `#3D6BA6` (+`-soft` пастель) |
| `--edge` / `--port` / `--glow` | navy/30% / `#16233A` / navy/26% |
| `--scrollbar` | black/14% |

## Categorical-палитра данных (`--chart-1..6`)

Цвет = смысл: графики и маркеры идентичности (плитки проектов), в хром UI не протекает. База — Okabe-Ito (colorblind-safe): светлая — оригиналы (`#0072B2`, `#009E73`, `#E69F00`, `#CC79A7`, `#56B4E9`, `#D55E00`); тёмная — осветлённые производные (`#64A4E0`, `#5FBF8F`, `#E0B054`, `#D795BC`, `#8CC8EA`, `#E08A66`). Потребители: `identityTone`/`chartRowTone` (`shared/ui/identity-tone.ts`), SVG-бары через `var(--chart-N)`.

## Типографика

- **Onest Variable** — контент (`font-sans`), базовый размер 14px.
- **JetBrains Mono Variable** — метки/ключи/даты/счётчики (`font-mono`): UPPERCASE 10–12px, tracking 0.14–0.16em. Примитив — `NodeLabel`; цифры — `tabular-nums`.
- Заголовки экранов: `text-xl font-semibold`; сущности: `text-lg font-semibold`.

## Радиусы и ритм

- `--radius: 0.625rem` (10px — панель); локти рёбер 6–8px; порты r=3 (узел сворачивания ветки r=7).
- Сетка — 8px-ритм (`p-2/3/4/5/6`, `gap-2/3/4/5`).

## Механика тем

- `shell-store` (`ThemeId = 'dark' | 'light'`, `toggleTheme`), persist `nodus-shell-v1` (partialize — только theme).
- `app-shell` ставит `document.documentElement.dataset.theme = 'light'` для светлой (для dark — удаляет атрибут); `<Toaster theme={theme}>`.
- Скроллбар — через `var(--scrollbar)` (не хардкод!).

## Запреты стиля (grep-контроль DoD)

`paper-`, `crayon`, `sketch`, `texture-`, `bg-rust`, `text-ochre`, `text-cream`, `bg-sage`, `bg-steel`, `bg-tealink`, `border-pencil`, `bg-cream`, rose-цвета, хардкод-цвета в классах (`bg-[#...]` разрешён только внутри токенов globals.css), тени/градиенты/текстуры, translate-«приподнимание» карточек при ховере (ховер — только цвет: `hover:border-input`, `hover:bg-accent/40`; ховер ЦЕЛОЙ карточки на холсте — `/60`, иначе сливается с холстом), толстые фокус-ринги (фокус = `border-ring` + `ring-1 ring-ring/30`, вердикт владельца 11.09.2026).

## Фон-граф (утверждённая концепция, реализация — отдельной итерацией)

Не «космос», а наша грамматика: слабая статичная схема из ортогональных рёбер и портов (без движения и пульсов), alpha ≈ 5–8%: в тёмной — «созвездия», в светлой — «чертёж на кальке». Плотность узлов = накопленные данные.
