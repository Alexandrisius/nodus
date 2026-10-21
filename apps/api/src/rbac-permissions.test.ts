import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Permission } from '@nodus/contracts';
import { describe, expect, it } from 'vitest';

import { ALL_PERMISSIONS } from '../prisma/all-permissions.js';

/** Миграции — единственный путь данных на прод (seed там не запускается, #311/#398). */
const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '../prisma/migrations');

function grantedPermissions(): Set<string> {
  const granted = new Set<string>();
  for (const entry of readdirSync(migrationsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sql = readFileSync(join(migrationsDir, entry.name, 'migration.sql'), 'utf8');
    for (const block of sql.matchAll(/INSERT INTO "role_permissions"[\s\S]*?;/g)) {
      for (const match of block[0].matchAll(/'([a-zA-Z][a-zA-Z_.]+)'/g)) granted.add(match[1]!);
    }
  }
  return granted;
}

describe('каталог прав и миграции', () => {
  it('сид выдаёт администратору все права каталога Permission', () => {
    expect([...ALL_PERMISSIONS].sort()).toEqual([...Object.values(Permission)].sort());
  });

  it('каждое право Permission доезжает до прода миграцией role_permissions', () => {
    const granted = grantedPermissions();
    const missing = Object.values(Permission).filter((permission) => !granted.has(permission));
    expect(
      missing,
      `Новое право не доставлено на прод: добавьте INSERT INTO "role_permissions" в миграцию (${missing.join(', ')})`,
    ).toEqual([]);
  });
});
