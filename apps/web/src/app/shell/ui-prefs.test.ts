import { resolveHidden, resolveOrder } from './ui-prefs.js';

import { describe, expect, it } from 'vitest';

const SYSTEM = ['home', 'tasks', 'letters', 'projects', 'chat', 'employees'];

describe('resolveOrder', () => {
  it('без сохранённого — системный порядок', () => {
    expect(resolveOrder(SYSTEM)).toEqual(SYSTEM);
    expect(resolveOrder(SYSTEM, [], [])).toEqual(SYSTEM);
  });

  it('личный порядок побеждает общий', () => {
    const company = ['chat', 'tasks', 'home', 'letters', 'projects', 'employees'];
    const personal = ['tasks', 'home', 'letters', 'projects', 'chat', 'employees'];
    expect(resolveOrder(SYSTEM, personal, company)).toEqual(personal);
  });

  it('общий применяется, когда личного нет', () => {
    const company = ['chat', 'tasks', 'home', 'letters', 'projects', 'employees'];
    expect(resolveOrder(SYSTEM, undefined, company)).toEqual(company);
  });

  it('неизвестные id отбрасываются, новые из реестра — в конец системным порядком', () => {
    const stored = ['chat', 'legacy-gone', 'home'];
    expect(resolveOrder(SYSTEM, stored)).toEqual([
      'chat',
      'home',
      'tasks',
      'letters',
      'projects',
      'employees',
    ]);
  });
});

describe('resolveHidden', () => {
  it('личные скрытые побеждают общие, неизвестные отбрасываются', () => {
    expect(resolveHidden(SYSTEM, ['chat', 'gone'], ['tasks'])).toEqual(['chat']);
    expect(resolveHidden(SYSTEM, undefined, ['tasks'])).toEqual(['tasks']);
    expect(resolveHidden(SYSTEM)).toEqual([]);
  });
});
