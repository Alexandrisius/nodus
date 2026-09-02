import { nodusConfig } from '@nodus/config/eslint';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      // Фикстуры тестов линтера заведомо нарушают правила — это их смысл.
      'tests/lint/fixtures/**',
      // Генерируемый Prisma client (генерируемое не коммитится и не линтится).
      'apps/api/src/generated/**',
    ],
  },
  ...nodusConfig,
];
