import { describe, expect, it } from 'vitest';

import {
  PERMISSION_CATALOG,
  accessModuleSchema,
  permissionsOfModule,
} from './permission-catalog.js';
import { Permission } from './permission.js';

/**
 * Полнота каталога прав (#379, ADR-0034): новое право без записи в каталоге
 * или без названия/описания — баг модели, а не «забыли текст».
 */

describe('каталог прав (#379)', () => {
  it('каждое право каталога Permission встречается ровно один раз', () => {
    const listed = PERMISSION_CATALOG.map((entry) => entry.permission);
    expect(listed).toHaveLength(Object.values(Permission).length);
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual([...Object.values(Permission)].sort());
  });

  it('названия и описания непустые и укладываются в лимиты строки таблицы', () => {
    for (const entry of PERMISSION_CATALOG) {
      expect(entry.label.trim(), entry.permission).not.toBe('');
      expect(entry.description.trim(), entry.permission).not.toBe('');
      expect(entry.label.length, `${entry.permission}: название длиннее 60`).toBeLessThanOrEqual(
        60,
      );
      expect(
        entry.description.length,
        `${entry.permission}: описание длиннее 120`,
      ).toBeLessThanOrEqual(120);
    }
  });

  it('у каждого раздела есть хотя бы одно право', () => {
    for (const module of accessModuleSchema.options) {
      expect(permissionsOfModule(module).length, module).toBeGreaterThan(0);
    }
  });

  it('«Автоматизация» — ровно три строки в порядке матрицы', () => {
    expect(permissionsOfModule('automation').map((entry) => entry.permission)).toEqual([
      Permission.WORKFLOW_MANAGE,
      Permission.CUSTOM_FIELD_MANAGE,
      Permission.DICTIONARY_MANAGE,
    ]);
  });

  it('срез раздела не теряет и не переставляет права', () => {
    const all = accessModuleSchema.options.flatMap((module) =>
      permissionsOfModule(module).map((entry) => entry.permission),
    );
    expect(all).toEqual(PERMISSION_CATALOG.map((entry) => entry.permission));
  });
});
