# @nodus/config

Общие конфиги монорепо (I6): единая точка правды для настроек toolchain, чтобы пакеты не разъезжались по конфигурации.

## Состав

- `tsconfig/base.json` — строгий TypeScript (strict + noUncheckedIndexedAccess + verbatimModuleSyntax). Наследуется всеми пресетами.
- `tsconfig/node.json` — Node-пакеты (`apps/api`, `apps/gateway`, `packages/contracts`, `tests/*`): ESM, `module: NodeNext`.
- `tsconfig/react.json` — `apps/web`: `moduleResolution: Bundler`, JSX, DOM.
- `eslint/index.mjs` — готовый flat-config `nodusConfig`: typescript-eslint recommended, границы модулей (I6, eslint-plugin-boundaries v7: элементы по папкам, read-порты модулей — file-дескрипторы `boundaries/files` категории `module-port` с политикой-исключением ниже запрета; устаревший `mode: 'file'` не используется, #320), лимит размера файлов (I5: warn > 300, error > 500), Rules of Hooks и `exhaustive-deps` (оба error, #320), строки интерфейса только из i18n (I15, #320: кириллица в тексте/атрибутах/шаблонах JSX и в `toast(...)` — `no-restricted-syntax`; логика, тесты и MSW-моки — вне правила), type-aware промисы.

**Храповик предупреждений I5 (#320):** корневой `pnpm lint` = `eslint . --max-warnings N`, где N — текущее число предупреждений (все они — `max-lines-warn`). Новый файл > 300 строк валит lint и CI. Раздробил файл и число упало — уменьши N в корневом `package.json` в том же PR (храповик идёт только вниз).

- `test-env.mjs` (`@nodus/config/test-env`) — изоляция Redis интеграционных тестов (#332): `isolateIntegrationRedis()` в `vitest.integration.config.ts` переписывает `REDIS_URL` на db 15 и `STORAGE_BUCKET` на `nodus-test-files` (#324), `assertIsolatedTestRedis()` в хелперах тестовых БД — громкий отказ при чужом db (корневой `.env` смотрит в Redis живого стека).

## Использование

```jsonc
// tsconfig.json пакета
{ "extends": "@nodus/config/tsconfig/node.json" }
```

```js
// eslint.config.mjs
import { nodusConfig } from '@nodus/config/eslint';
export default [{ ignores: ['**/dist/**'] }, ...nodusConfig];
```

## Лимиты

Конфиги не содержат секретов и путей вне репозитория. Изменение пресетов — в коммите с обновлением этого README.
