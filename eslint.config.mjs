import { nodusConfig } from '@nodus/config/eslint';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      // Фикстуры тестов линтера заведомо нарушают правила — это их смысл.
      'tests/lint/fixtures/**',
    ],
  },
  ...nodusConfig,
];
