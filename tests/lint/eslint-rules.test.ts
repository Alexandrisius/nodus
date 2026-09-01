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

  it('разрешает импорт внутри своего модуля', async () => {
    const messages = await lintFile('apps/api/src/modules/alpha/uses-internal.ts');

    expect(messages.filter((m) => m.ruleId === 'boundaries/dependencies')).toHaveLength(0);
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
