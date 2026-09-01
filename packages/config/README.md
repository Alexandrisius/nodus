# @nodus/config

Общие конфиги монорепо (I6): единая точка правды для настроек toolchain, чтобы пакеты не разъезжались по конфигурации.

## Состав

- `tsconfig/base.json` — строгий TypeScript (strict + noUncheckedIndexedAccess + verbatimModuleSyntax). Наследуется всеми пресетами.
- `tsconfig/node.json` — Node-пакеты (`apps/api`, `apps/gateway`, `packages/contracts`, `tests/*`): ESM, `module: NodeNext`.
- `tsconfig/react.json` — `apps/web`: `moduleResolution: Bundler`, JSX, DOM.
- `eslint/index.mjs` — готовый flat-config `nodusConfig`: typescript-eslint recommended, границы модулей (I6, eslint-plugin-boundaries), лимит размера файлов (I5: warn > 300, error > 500).

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
