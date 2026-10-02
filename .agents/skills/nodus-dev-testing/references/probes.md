# Живые пробы: каркас, паттерны, ловушки

Проба — одноразовый mjs-скрипт в `.live-stack/` (gitignored), гоняется против
`:4173` песочницы headless-Chromium. Запуск: `node .live-stack/<name>.mjs`.

## Каркас (копировать целиком)

```js
import { createRequire } from 'node:module';
const require = createRequire(new URL('../tests/e2e/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const BASE = 'http://127.0.0.1:4173';
const results = [];
const rep = (name, ok, extra = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
try {
  // ... сценарий: логины, действия, замеры, rep() на каждое утверждение
  const failed = results.filter((ok) => !ok).length;
  console.log(`ИТОГ: ${results.length - failed}/${results.length} PASS`);
} finally {
  await browser.close();
}
```

## Логин

**UI (нужна страница):** `getByLabel('Рабочая почта')` / `getByLabel('Пароль')` → кнопка «Войти» → `waitForURL(/home/)`. Креды — `night-a@nodus.local` / `night-b@nodus.local`, пароль `Night-Probe-100!`.

**REST (нужны только API-вызовы):** `POST /api/v1/auth/login {email,password}` → `body.accessToken`. Токен SPA живёт ТОЛЬКО в памяти стора (не localStorage!) — из скрипта в страницу его не подсунуть, ходи с `authorization: Bearer <token>` из node-fetch.

## Навигация

- SPA-роуты — `history.pushState` + `popstate` в evaluate (роутер TanStack): `/chat`, `/chat/$conversationId`, `/home`.
- Reload на :5173 убивает сессию — там пробы живого НЕ гоняем вообще; на :4173 сессия cookie — живёт.
- Ожидания — по состоянию (`locator.waitFor`, `waitForURL`, наличие `[data-slot=…]`), сон `sleep()` — только на WS-догонку (1.5–2.5с), не вместо ожиданий.

## API-вызовы из пробы (node-fetch + Bearer)

- **Idempotency-Key обязателен на POST** (иначе 400): генерируй `probe-<номер>` на вызов.
- **Ключ уникален за ПРОГОН** (суффикс `Date.now()` всего запуска): интерсептор идемпотентности кэширует ответы в Redis — повторный ключ между прогонами отдаст ФАНТОМНЫЙ ответ первого прогона (репро #186 02.10: «создание группы — 404» при живом коде и свежем стеке).
- **НЕ слать null-поля**: zod-схемы ожидают string/array или отсутствие — `{stickerId: null}` падает VALIDATION_FAILED. Строй тело из заданного.
- Полезные маршруты: `GET /chat/conversations?limit=100` (поле типа — `type`, НЕ kind; канал = `project_channel`); `POST /chat/conversations` `{type:'project_channel', title, memberIds}` (создатель = owner, post = member); `POST /chat/conversations/:id/messages` `{text, attachmentIds:[]}` (+`stickerId`); `POST …/messages/:id/reactions` `{emoji}` (toggle); `GET /chat/stickers/packs`.
- 4xx не молчать: логируй статус+тело (`[api ${status}] …`) — «тихий» фейл превращает пробу в ложные PASS (критерий `gap<=32` и так «зелёный» на пустой ленте: сначала ДОБЕЙСЯ переполнения контента, потом меряй «у низа»).

## Двухпользовательские сценарии

Два контекста ОДНОГО браузера: `ctxA/ctxB = browser.newContext()` → по странице на пользователя. Классика: A у низа ленты, B шлёт → у A догон; B реагирует → у A низ стоит. Замеры скролла — по `[data-slot="message-scroller-viewport"]`: `gap = scrollHeight - scrollTop - clientHeight`.

## Селекторы и замеры

- Стабильные: `data-slot` (наши слоты), `data-message-id`, `getByLabel`/`getByRole` с РУССКИМИ лейблами из `packages/contracts` i18n. CSS-классы Tailwind — только для геометрии, не для поиска.
- Дизайн-px = фактические ÷ 1.25 (ui-scale): `gap-y-1.5` (6dp) → 7.5 фактических; `pt-[6px]` → 6+1 бордер. Пороги сравнения ±1.5–2.5px.
- Пиксельные сканы (геометрия текста/иконок): element screenshot dpr=3, белый-строк-скан с ИНСЕТОМ 6px от края (по периметру ореол — без инсета врёт «0/0»).
- Скриншоты-артефакты: `.live-stack/shots/<имя>.png` — для отчёта себе; владельцу — живой взгляд на :4173/:5173, не скриншоты вместо приёмки.

## Бюджет и дисциплина

- **1–2 пробы на фикс** (вердикт владельца 01.10): гипотеза → прогон → гейты → владельцу. Не понял с двух прогонов → СТОП-кран: логирование/вопрос, не серия слепых итераций.
- Каждая проба самодостаточна: создаёт свои данные (маркер «Проба …» в названиях) и, если сценарий повторяем, чистит их; после упавшей пробы — удалить полусозданное перед повтором.
- Канва вывода: только PASS/FAIL + числа (gap/st/px) — читается владельцем и в комментарии issue.

## Очистка данных пробы

- Свои сущности: `DELETE FROM … WHERE title LIKE 'Проба <issue>%'` в nodus_night (это песочница — чистота нужна для повторяемости, не для безопасности).
- Карманный полный резет — DROP DATABASE nodus_night + `pnpm live-stack up` (см. references/live-stack.md).
