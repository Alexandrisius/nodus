import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint, type Linter } from 'eslint';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const fixturesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const generatedDir = path.join(fixturesDir, 'generated');

function makeCodeFile(lines: number): string {
  return (
    Array.from({ length: lines }, (_, i) => `export const line${i + 1} = ${i + 1};`).join('\n') +
    '\n'
  );
}

// Таймаут — в скрипте test (30 с): первый lintFile поднимает projectService
// type-aware правил (холодный TS-проект), под параллельной нагрузкой turbo это
// дольше дефолтных 5 с (#317).
async function lintFile(relativePath: string): Promise<Linter.LintMessage[]> {
  const eslint = new ESLint({
    cwd: fixturesDir,
    overrideConfigFile: path.join(fixturesDir, 'eslint.config.mjs'),
  });
  const [result] = await eslint.lintFiles([relativePath]);
  return result?.messages ?? [];
}

beforeAll(() => {
  mkdirSync(generatedDir, { recursive: true });
  // I5: предупреждение > 300 строк, ошибка > 500 (blank-строки и комментарии не считаются).
  writeFileSync(path.join(generatedDir, 'medium-350.ts'), makeCodeFile(350));
  writeFileSync(path.join(generatedDir, 'too-long-501.ts'), makeCodeFile(501));
});

afterAll(() => {
  rmSync(generatedDir, { recursive: true, force: true });
});

describe('строки интерфейса только из i18n (I15, #320)', () => {
  it('ловит кириллицу в тексте/атрибуте/шаблоне JSX и в тосте', async () => {
    const messages = await lintFile('apps/web/src/features/profile/hardcoded-ui.tsx');
    const lines = messages
      .filter((m) => m.ruleId === 'no-restricted-syntax' && m.severity === 2)
      .map((m) => m.line)
      .sort((a, b) => a - b);

    // Тост (5), атрибут (7), текст JSX (узел начинается переводом строки
    // после тега — тоже 7), шаблон в выражении (9), обе ветки тернарника
    // в атрибуте и запасной текст `||` (10).
    expect(lines).toEqual([5, 7, 7, 9, 10, 10, 10]);
  });

  it('не трогает кириллицу в логике (сравнения, ключи)', async () => {
    const messages = await lintFile('apps/web/src/features/profile/logic-literals.tsx');

    expect(messages.filter((m) => m.ruleId === 'no-restricted-syntax')).toHaveLength(0);
  });
});

describe('границы модулей (I3, I6)', () => {
  it('ловит cross-module импорт в apps/api', async () => {
    const messages = await lintFile('apps/api/src/modules/alpha/alpha.service.ts');

    expect(messages.some((m) => m.ruleId === 'boundaries/dependencies' && m.severity === 2)).toBe(
      true,
    );
  });

  it('ловит cross-feature импорт в apps/web', async () => {
    const messages = await lintFile('apps/web/src/features/orders/orders-list.ts');

    expect(messages.some((m) => m.ruleId === 'boundaries/dependencies' && m.severity === 2)).toBe(
      true,
    );
  });

  it('разрешает read-порт чужого модуля (*.port.ts, *-ports.module.ts — ADR-0012)', async () => {
    const messages = await lintFile('apps/api/src/modules/alpha/uses-beta-port.ts');

    expect(messages.filter((m) => m.ruleId === 'boundaries/dependencies')).toHaveLength(0);
  });

  it('разрешает импорт внутри своего модуля', async () => {
    const messages = await lintFile('apps/api/src/modules/alpha/uses-internal.ts');

    expect(messages.filter((m) => m.ruleId === 'boundaries/dependencies')).toHaveLength(0);
  });

  it('ловит импорт кода бэкенда из веба (I1, I6)', async () => {
    const messages = await lintFile('apps/web/src/features/orders/uses-backend.ts');

    expect(messages.some((m) => m.ruleId === 'boundaries/dependencies' && m.severity === 2)).toBe(
      true,
    );
  });
});

describe('repository pattern (patterns.md)', () => {
  it('ловит PrismaService в сервисе модуля', async () => {
    const messages = await lintFile('apps/api/src/modules/alpha/alpha-data.service.ts');

    expect(messages.some((m) => m.ruleId === 'no-restricted-imports' && m.severity === 2)).toBe(
      true,
    );
  });

  it('разрешает PrismaService в репозитории', async () => {
    const messages = await lintFile('apps/api/src/modules/alpha/alpha.repository.ts');

    expect(messages.filter((m) => m.ruleId === 'no-restricted-imports')).toHaveLength(0);
  });
});

describe('безопасность промисов (type-aware)', () => {
  it('ловит промис без await/catch', async () => {
    const messages = await lintFile('apps/api/src/modules/alpha/floating-promise.ts');

    expect(
      messages.some(
        (m) => m.ruleId === '@typescript-eslint/no-floating-promises' && m.severity === 2,
      ),
    ).toBe(true);
  });
});

describe('лимит размера файлов (I5)', () => {
  it('ошибка на файле > 500 строк', async () => {
    const messages = await lintFile('generated/too-long-501.ts');

    expect(messages.some((m) => m.ruleId === 'max-lines' && m.severity === 2)).toBe(true);
  });

  it('предупреждение (не ошибка) на файле > 300 строк', async () => {
    const messages = await lintFile('generated/medium-350.ts');

    expect(
      messages.some((m) => m.ruleId === 'nodus-internal/max-lines-warn' && m.severity === 1),
    ).toBe(true);
    expect(messages.filter((m) => m.severity === 2)).toHaveLength(0);
  });
});
