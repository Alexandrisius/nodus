# apps/gateway — @nodus/gateway

WebSocket-gateway портала (I1: отдельный процесс): Socket.IO — auth, presence, fanout событий в реальном времени.

## Запуск

- `pnpm dev` — `node --watch src/main.ts` (Node 24 исполняет TS напрямую, type stripping; поэтому относительные импорты — с `.ts`-расширением, tsc переписывает их на `.js` при сборке через `rewriteRelativeImportExtensions`).
- `pnpm build && pnpm start` — прод-режим из `dist/`.
- Порт: `GATEWAY_PORT` (по умолчанию 3002); проверка живости — `GET /health`.

## Лимиты

- Stateless: горизонтальное масштабирование — через Redis-адаптер Socket.IO (к пилоту).
- Доступ из браузера — один origin с web (nginx/vite проксируют `/socket.io`), свой CORS не настраивается.
- Auth хендшейка и структурное логирование — вместе с core-механизмами (issue #2/#3).
