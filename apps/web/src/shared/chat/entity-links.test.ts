import { describe, expect, it } from 'vitest';

import { parseEntityLinks } from './entity-links.js';

const ID = '80000000-0000-4000-8000-000000000003';

describe('parseEntityLinks: ссылки на сущности в тексте сообщений', () => {
  it('обычный текст — один текстовый сегмент', () => {
    expect(parseEntityLinks('Просто текст')).toEqual([{ kind: 'text', value: 'Просто текст' }]);
  });

  it('portal://letter/<id> — сущность, сырой URI убирается', () => {
    const segments = parseEntityLinks(`Смотри письмо portal://letter/${ID} срочно`);
    expect(segments).toEqual([
      { kind: 'text', value: 'Смотри письмо ' },
      { kind: 'entity', entity: 'letter', id: ID },
      { kind: 'text', value: ' срочно' },
    ]);
  });

  it('deep-link стека ?cards=letter:<id> — сущность', () => {
    const segments = parseEntityLinks(`http://localhost:5173/?cards=letter:${ID}`);
    expect(segments).toEqual([{ kind: 'entity', entity: 'letter', id: ID }]);
  });

  it('стек из нескольких карточек в deep-link — по сущности на каждую', () => {
    const other = '30000000-0000-4000-8000-000000000005';
    const segments = parseEntityLinks(`http://nodus.by/?cards=letter:${ID},task:${other}`);
    expect(segments).toEqual([
      { kind: 'entity', entity: 'letter', id: ID },
      { kind: 'entity', entity: 'task', id: other },
    ]);
  });

  it('текст только из ссылки — пустых сегментов нет', () => {
    expect(parseEntityLinks(`portal://letter/${ID}`)).toEqual([
      { kind: 'entity', entity: 'letter', id: ID },
    ]);
  });

  it('не-ссылка с «cards=» без пары вид:id остаётся текстом', () => {
    const text = 'погляди http://example.com/?cards=abc';
    const segments = parseEntityLinks(text);
    expect(segments.every((s) => s.kind === 'entity')).toBe(false);
    expect(segments.map((s) => (s.kind === 'text' ? s.value : '')).join('')).toContain('погляди');
  });
});
