# @nodus/ui — дизайн-система Nodus

Единственный источник UI-примитивов и тем для `apps/web` (I6: общее — только
`@nodus/contracts` и `@nodus/ui`).

## Состав

- `src/components/` — компоненты shadcn/ui (base: radix, style: nova), добавляются
  CLI: `pnpm dlx shadcn@latest add <name> --cwd packages/ui`.
- `src/lib/utils.ts` — `cn()`.
- `src/styles/globals.css` — Tailwind 4 + дизайн-токены (тема как данные, §10.3
  ux-principles). Импортируется приложением: `@nodus/ui/globals.css`.

## Темы

Всё визуальное — только семантическими токенами (`bg-primary`, `text-muted-foreground`,
`bg-success-soft`...); зашивать значения в компоненты запрещено (контролируется ревью
и линт-правилами shadcn-навыка). Вариант оформления = набор CSS-переменных:

- `:root` — «корпоративная» (базовая: тёплый светлый фон, белые карточки, navy-акцент);
- `[data-theme='airy']` — «воздушный минимализм» (тест подмены токенов);
- `.dark` — заготовлена, включается с персонализацией (§10.5).

Переключение — атрибутом `data-theme` на `<html>` (хук `useTheme` появится с
персонализацией; для проверки концепта — переключатель в топбаре).

## Правила

- Новые примитивы — только через shadcn CLI (не рукописные копии).
- Компоненты фич живут в `apps/web/src/features/*/components`, здесь — только
  общие примитивы без доменной логики.
- Иконки — lucide-react; шрифт — Onest (self-hosted, `@fontsource-variable/onest`, I11).
