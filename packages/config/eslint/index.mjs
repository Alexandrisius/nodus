import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import eslintConfigPrettier from 'eslint-config-prettier';
import { nodusInternal } from './nodus-internal.mjs';

const BACKEND_ELEMENTS = [
  'api-module',
  'api-module-port',
  'api-module-ports-module',
  'api-core',
  'gateway',
];
const WEB_ELEMENTS = ['web-feature', 'web-shared', 'web-app'];

/**
 * Границы модулей (I3, I6): backend-модули и web-фичи не импортируют друг друга;
 * слои web направлены вниз: app (композиция) → features → shared (shared не
 * импортирует features/app никогда — аудит #45: до правил агрегат моков жил
 * в shared и тянул все фичи; features→app — только публичное API каркаса,
 * patterns.md, линтером не выражается).
 * Паттерны — относительно cwd запуска ESLint (корень репо или tests/lint/fixtures).
 */
const boundariesConfig = {
  files: ['apps/**/*.ts', 'apps/**/*.tsx', 'packages/**/*.ts'],
  plugins: { boundaries },
  settings: {
    'boundaries/elements': [
      // Read-порты модулей-владельцев (ADR-0012): токен + интерфейс порта и
      // тонкий *-ports.module.ts — ЕДИНСТВЕННАЯ допустимая форма межмодульного
      // импорта на бэке (первый случай: chat → notifications, #100). Специфичные
      // file-паттерны стоят выше общего api-module (порядок разрешения).
      {
        type: 'api-module-port',
        pattern: 'apps/api/src/modules/**/*.port.ts',
        mode: 'file',
        capture: ['module'],
      },
      {
        type: 'api-module-ports-module',
        pattern: 'apps/api/src/modules/**/*-ports.module.ts',
        mode: 'file',
        capture: ['module'],
      },
      { type: 'api-module', pattern: 'apps/api/src/modules/*', capture: ['module'] },
      { type: 'api-core', pattern: 'apps/api/src/core/*', capture: [] },
      { type: 'gateway', pattern: 'apps/gateway/src', capture: [] },
      { type: 'web-feature', pattern: 'apps/web/src/features/*', capture: ['feature'] },
      { type: 'web-app', pattern: 'apps/web/src/app/*', capture: [] },
      { type: 'web-shared', pattern: 'apps/web/src/shared/*', capture: [] },
    ],
    'import/resolver': {
      typescript: { alwaysTryTypes: true },
    },
  },
  rules: {
    'boundaries/dependencies': [
      'error',
      {
        default: 'allow',
        policies: [
          {
            from: { element: { type: 'api-module' } },
            disallow: {
              to: {
                element: {
                  type: 'api-module',
                  captured: { module: '!{{ from.element.captured.module }}' },
                },
              },
            },
            message:
              'Cross-module импорт запрещён (I3, I6): модули общаются событиями и @nodus/contracts; исключение — read-порты (*.port.ts, *-ports.module.ts, ADR-0012)',
          },
          {
            from: { element: { type: 'web-feature' } },
            disallow: {
              to: {
                element: {
                  type: 'web-feature',
                  captured: { feature: '!{{ from.element.captured.feature }}' },
                },
              },
            },
            message:
              'Cross-feature импорт запрещён (I3, I6): общее — только @nodus/contracts и @nodus/ui',
          },
          {
            from: { element: { type: 'web-shared' } },
            disallow: { to: { element: { type: 'web-feature' } } },
            message:
              'Shared не импортирует features (направление слоёв: app → features → shared, аудит #45)',
          },
          {
            from: { element: { type: 'web-shared' } },
            disallow: { to: { element: { type: 'web-app' } } },
            message:
              'Shared не импортирует app (направление слоёв: app → features → shared, аудит #45)',
          },
          // Приложения монорепо не импортируют код друг друга (I1, I6): общее
          // между web, api и gateway — только packages/* (@nodus/contracts,
          // @nodus/ui). Относительный `../../../api/src/...` проходил при
          // default: 'allow' (аудит #317).
          {
            from: { element: { type: ['web-feature', 'web-shared', 'web-app'] } },
            disallow: { to: { element: { type: BACKEND_ELEMENTS } } },
            message:
              'Веб не импортирует код бэкенда (I1, I6): обмен — только через @nodus/contracts',
          },
          {
            from: { element: { type: BACKEND_ELEMENTS } },
            disallow: { to: { element: { type: WEB_ELEMENTS } } },
            message:
              'Бэкенд не импортирует код веба (I1, I6): обмен — только через @nodus/contracts',
          },
          {
            from: { element: { type: 'gateway' } },
            disallow: {
              to: {
                element: {
                  type: ['api-module', 'api-module-port', 'api-module-ports-module', 'api-core'],
                },
              },
            },
            message:
              'Gateway — отдельный процесс (I1): код api не импортирует, общее — @nodus/contracts',
          },
          {
            from: {
              element: {
                type: ['api-module', 'api-module-port', 'api-module-ports-module', 'api-core'],
              },
            },
            disallow: { to: { element: { type: 'gateway' } } },
            message: 'Api не импортирует код gateway (I1): общее — @nodus/contracts',
          },
          // Ядро api — нижний слой: модули зависят от core, не наоборот.
          {
            from: { element: { type: 'api-core' } },
            disallow: { to: { element: { type: 'api-module' } } },
            message:
              'Core не импортирует модули (направление: modules → core); нужна обратная связь — порт в core/ports или событие',
          },
        ],
      },
    ],
  },
};

/** Лимит размера файлов (I5): предупреждение > 300 строк, ошибка > 500. */
const fileSizeConfig = {
  plugins: { 'nodus-internal': nodusInternal },
  rules: {
    'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
    'nodus-internal/max-lines-warn': [
      'warn',
      { max: 300, skipBlankLines: true, skipComments: true },
    ],
  },
};

/** Rules of Hooks (#168): условный вызов хука прошёл все гейты и ловился
 *  только ручным аудитом (урок PR #167/#164 — React 19 падает в рантайме
 *  «Expected static flag was missing»). Только два классических правила:
 *  пресеты плагина v7 («recommended*») тянут React-Compiler-набор
 *  (purity/immutability/…) — отдельное решение, не этого issue. */
const reactHooksConfig = {
  files: [
    'apps/web/**/*.ts',
    'apps/web/**/*.tsx',
    'packages/ui/**/*.ts',
    'packages/ui/**/*.tsx',
    'apps/desktop/**/*.ts',
    'apps/desktop/**/*.tsx',
  ],
  plugins: { 'react-hooks': reactHooks },
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
  },
};

/**
 * Repository pattern (patterns.md): PrismaService в модулях — только в
 * `*.repository.ts` и адаптерах read-портов `*.provider.ts` (ADR-0012:
 * реализация порта — репозиторий модуля-владельца для чужого потребителя).
 * Сервисы, контроллеры и обработчики событий работают через репозитории —
 * иначе канон «на бумаге» копируется новыми модулями (аудит #317: модуль
 * задач первой итерации писал Prisma прямо в сервисах).
 */
const repositoryPatternConfig = {
  files: ['apps/api/src/modules/**/*.ts'],
  ignores: ['**/*.repository.ts', '**/*.provider.ts', '**/*.test.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['**/core/database/prisma.service*'],
            message:
              'PrismaService — только в *.repository.ts / адаптерах портов *.provider.ts (patterns.md: repository pattern)',
          },
        ],
      },
    ],
  },
};

/** Браузерный код: браузерные глобали вместо node (`process`/`Buffer` в
 *  бандле — ошибка сборки в рантайме), console.log не уезжает в прод
 *  (warn/error — легальный канал диагностики). */
const BROWSER_FILES = [
  'apps/web/src/**/*.{ts,tsx}',
  'apps/desktop/src/**/*.{ts,tsx}',
  'packages/ui/src/**/*.{ts,tsx}',
];
const browserConfig = {
  files: BROWSER_FILES,
  languageOptions: {
    globals: { ...globals.browser },
  },
  rules: {
    'no-console': ['error', { allow: ['warn', 'error'] }],
  },
};

/**
 * Type-aware правила промисов (аудит #317): весь бэкенд — async (NestJS,
 * BullMQ, Socket.IO), фронт — мутации и WS. Забытый await = потерянная
 * ошибка, транзакция после ответа, необработанный rejection; линтер без
 * типов этого не видит. projectService берёт ближайший tsconfig файла;
 * цена — ~15 с на весь репо (замер 17.10.2026, 922 файла).
 */
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const promiseSafetyConfig = {
  files: ['apps/api/src/**/*.ts', 'apps/gateway/src/**/*.ts', 'apps/web/src/**/*.{ts,tsx}'],
  languageOptions: {
    parserOptions: { projectService: true, tsconfigRootDir: REPO_ROOT },
  },
  rules: {
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
  },
};

/**
 * Единый flat-config монорепо. Корень добавляет к нему только ignores;
 * tests/lint/fixtures использует как есть (паттерны boundaries cwd-относительны).
 */
export const nodusConfig = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: BROWSER_FILES,
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  boundariesConfig,
  repositoryPatternConfig,
  browserConfig,
  promiseSafetyConfig,
  fileSizeConfig,
  reactHooksConfig,
  eslintConfigPrettier,
);
