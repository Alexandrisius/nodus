import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import boundaries from 'eslint-plugin-boundaries';
import eslintConfigPrettier from 'eslint-config-prettier';
import { nodusInternal } from './nodus-internal.mjs';

/**
 * Границы модулей (I3, I6): backend-модули и web-фичи не импортируют друг друга.
 * Паттерны — относительно cwd запуска ESLint (корень репо или tests/lint/fixtures).
 */
const boundariesConfig = {
  files: ['apps/**/*.ts', 'apps/**/*.tsx', 'packages/**/*.ts'],
  plugins: { boundaries },
  settings: {
    'boundaries/elements': [
      { type: 'api-module', pattern: 'apps/api/src/modules/*', capture: ['module'] },
      { type: 'web-feature', pattern: 'apps/web/src/features/*', capture: ['feature'] },
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
              'Cross-module импорт запрещён (I3, I6): модули общаются событиями и @nodus/contracts',
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

/**
 * Единый flat-config монорепо. Корень добавляет к нему только ignores;
 * tests/lint/fixtures использует как есть (паттерны boundaries cwd-относительны).
 */
export const nodusConfig = tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  boundariesConfig,
  fileSizeConfig,
  eslintConfigPrettier,
);
