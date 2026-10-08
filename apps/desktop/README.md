# apps/desktop — десктоп-оболочка Nodus

Тонкий клиент портала (M17, issue #254, **ADR-0019**): главное окно грузит
удалённый адрес портала (бандл веб-приложения НЕ встраивается), поверх — трей,
кастомные попапы уведомлений с быстрым ответом, бейдж непрочитанных,
автообновление самой оболочки с сервера портала. Windows 10/11 (WebView2).

## Структура

```
apps/desktop/
├── src/                    # мини-UI оболочки (React+Vite, токены @nodus/ui)
│   ├── setup/              #   экран «Адрес портала» (+офлайн/обновление)
│   ├── popup/              #   попап уведомления (карточка + быстрый ответ)
│   └── shell/              #   типизированные IPC-обёртки мини-UI
└── src-tauri/
    ├── capabilities/       # статические capability локального UI (shell-ui)
    ├── permissions/        # права команд моста (раздаются runtime-capability)
    └── src/
        ├── lib.rs          # композиция: окна, события, гвард навигации
        ├── portal.rs       # адрес портала, конфиг-эндпоинт, подключение
        ├── bridge.rs       # init-script моста + команды «веб→оболочка»
        ├── popups.rs       # стек попапов (право-низ, DPI, автоскрытие)
        ├── badge.rs        # пиксельный рендер счётчика (трей + таскбар)
        ├── tray_menu.rs    # трей: открыть/автозапуск/обновления/смена сервера
        ├── deep_link.rs    # схема nodus:// (холодный старт)
        └── updates.rs      # updater с сервера портала (minisign)
```

## Контракты

- `GET /api/v1/desktop/config` → `desktopConfigSchema` (contracts) — публичный.
- Протокол моста — `packages/contracts/src/desktop/desktop-bridge.schema.ts`:
  команды «веб→оболочка» (`window.nodusDesktop.*`), события «оболочка→веб»
  (`__nodusDesktopInvoke`). Rust-зеркала: `bridge.rs`/`popups.rs` —
  **рассинхрон = баг** (тесты протокола: `apps/web/src/shared/desktop/`).
- Обновления: `GET <портал>/desktop/latest.json` + установщики (`/desktop/`
  стatica nginx, env `NODUS_DESKTOP_DIR`); pubkey зашит в `tauri.conf.json`.

## Безопасность (границы, ADR-0019)

- Токены/креды не покидают веб-приложение: мост переносит только команды
  дисплея; ACL моста выдаётся runtime-capability РОВНО origin'у портала
  (`dynamic-acl`, минимальный набор прав в `permissions/shell-bridge.toml`).
- Гвард навигации: локальный мини-UI и origin портала; всё прочее — системный
  браузер. `open_external` принимает только http/https.
- Адрес портала валидируется (схема/хост, без пути и user-info).

## Команды (из каталога apps/desktop)

```bash
pnpm build                                   # мини-UI → dist/
pnpm exec tauri dev                          # окно-оболочка (dist без dev-сервера)
pnpm exec tauri build                        # NSIS + MSI (+ .sig при ключе)
pnpm exec tauri signer generate -w <путь>    # пара minisign (приватный — вне репо!)
```

Dev-режим: адрес портала вводится на экране подключения (песочница live-stack
`http://127.0.0.1:4173`); живые проверки — только по канону `nodus-dev-testing`.
Порядок сборки после правок контрактов: `contracts build` → `desktop build` →
`cargo build` (ассеты вшиваются компилятором).

## Лимиты и ограничения

- Попапы: стек ≤ 4, автоскрытие 6 с (важные — до реакции), авто-ответ — только
  текст (без вложений/цитат).
- Обновления контента (весь портал) — деплой сервера; оболочка обновляется
  только при смене самой себя (тихо, подписано).
- Вкладки/несколько окон портала — вне MVP (инкубатор 02.10).
- Фон log: `%APPDATA%\by.nodus.desktop\logs/`; адрес: `…/portal.json`.
