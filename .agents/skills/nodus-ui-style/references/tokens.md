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

Пересборка, **не инверсия**: фон — «калька», порты/связи/свечение — тёмные зеркально; `color-scheme: light`.

| Токен | Значение |
|---|---|
| `--background` / `--card` | `#F2F2F0` / `#FAFAF9` |
| `--foreground` / `--muted-foreground` | `#1C1C1F` / `#68686E` |
| `--primary` / `--primary-foreground` | `#1C1C1F` / `#F4F4F2` |
| `--border` / `--input` | black/10% / black/16% |
| `--success` `#3E7056` · `--warning` `#8A6A1F` · `--danger` `#B03A2E` · `--info` `#46648A` (+`-soft`) |
| `--sidebar` | `#E9E9E6` |
| `--edge` / `--port` / `--glow` | black/26% / `#3F3F44` / black/22% |
| `--scrollbar` | black/12% |

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

`paper-`, `crayon`, `sketch`, `texture-`, `bg-rust`, `text-ochre`, `text-cream`, `bg-sage`, `bg-steel`, `bg-tealink`, `border-pencil`, `bg-cream`, rose-цвета, хардкод-цвета в классах (`bg-[#...]` разрешён только внутри токенов globals.css), тени/градиенты/текстуры, translate-«приподнимание» карточек при ховере (ховер — только цвет: `hover:border-input`, `hover:bg-accent/40`).

## Фон-граф (утверждённая концепция, реализация — отдельной итерацией)

Не «космос», а наша грамматика: слабая статичная схема из ортогональных рёбер и портов (без движения и пульсов), alpha ≈ 5–8%: в тёмной — «созвездия», в светлой — «чертёж на кальке». Плотность узлов = накопленные данные.
