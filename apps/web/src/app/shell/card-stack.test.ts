import { describe, expect, it } from 'vitest';

import {
  cardRefFromString,
  cardRefToString,
  parseCardStack,
  sameCard,
  serializeCardStack,
} from './card-stack.js';

describe('card-stack: (де)сериализация стека карточек в URL', () => {
  it('cardRefToString / cardRefFromString — обратимы', () => {
    const ref = { kind: 'task' as const, id: '30000000-0000-4000-8000-000000000001' };
    expect(cardRefFromString(cardRefToString(ref))).toEqual(ref);
  });

  it('cardRefFromString отбрасывает мусор', () => {
    expect(cardRefFromString('')).toBeNull();
    expect(cardRefFromString('nope')).toBeNull();
    expect(cardRefFromString(':task')).toBeNull();
    expect(cardRefFromString('wizard:123')).toBeNull();
    expect(cardRefFromString('task:')).toBeNull();
  });

  it('parseCardStack: строка search-параметра → стек, мусор пропускается', () => {
    expect(parseCardStack('task:t1,project:p1')).toEqual([
      { kind: 'task', id: 't1' },
      { kind: 'project', id: 'p1' },
    ]);
    expect(parseCardStack('task:t1,junk,letter:l1')).toEqual([
      { kind: 'task', id: 't1' },
      { kind: 'letter', id: 'l1' },
    ]);
    expect(parseCardStack(undefined)).toEqual([]);
    expect(parseCardStack('')).toEqual([]);
    expect(parseCardStack(42)).toEqual([]);
    expect(parseCardStack(['task:t1'])).toEqual([]);
  });

  it('мессенджер — сущность стека: messenger:<id> сериализуется и восстанавливается', () => {
    expect(parseCardStack('task:t1,messenger:c1')).toEqual([
      { kind: 'task', id: 't1' },
      { kind: 'messenger', id: 'c1' },
    ]);
    expect(
      serializeCardStack([
        { kind: 'task', id: 't1' },
        { kind: 'messenger', id: 'c1' },
      ]),
    ).toBe('task:t1,messenger:c1');
    expect(cardRefFromString('messenger:')).toBeNull();
    expect(cardRefFromString('chat:c1')).toBeNull();
  });

  it('serializeCardStack: пустой стек → undefined (параметр уходит из URL)', () => {
    expect(serializeCardStack([])).toBeUndefined();
    expect(
      serializeCardStack([
        { kind: 'employee', id: 'u1' },
        { kind: 'task', id: 't1' },
      ]),
    ).toBe('employee:u1,task:t1');
  });

  it('sameCard сравнивает kind+id', () => {
    const a = { kind: 'task' as const, id: 't1' };
    expect(sameCard(a, { kind: 'task', id: 't1' })).toBe(true);
    expect(sameCard(a, { kind: 'task', id: 't2' })).toBe(false);
    expect(sameCard(a, { kind: 'letter', id: 't1' })).toBe(false);
  });
});
