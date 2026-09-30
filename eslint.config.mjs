import { nodusConfig } from '@nodus/config/eslint';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      // Скретч песочницы агента (гитигнорнут, но eslint ходит по нему —
      // проб-скрипты прошлых сессий валили локальный линт, #165).
      '**/.live-stack/**',
      // Служебные артефакты ZCode (планы, workflow-прогоны) — не код проекта.
      '**/.zcode/**',
      // Фикстуры тестов линтера заведомо нарушают правила — это их смысл.
      'tests/lint/fixtures/**',
      // Генерируемый Prisma client (генерируемое не коммитится и не линтится).
      'apps/api/src/generated/**',
    ],
  },
  ...nodusConfig,
];
