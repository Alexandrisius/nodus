import { describe, expect, it } from 'vitest';
import { Permission } from '@nodus/contracts';

import { NAV_MODULES, visibleNavTabs } from '../../../app/shell/nav-registry.js';
import { resolveLettersTab } from './letters-tab.js';

const office = [Permission.CORRESPONDENCE_REGISTER];
const employee = [Permission.DIRECTORY_READ];
const q = (value: string) => new URLSearchParams(value);

describe('resolveLettersTab (#55, §7.4)', () => {
  it('без параметра: канцелярии — «Новые», остальным — «Входящие»', () => {
    expect(resolveLettersTab(q(''), office)).toBe('new');
    expect(resolveLettersTab(q(''), employee)).toBe('incoming');
    expect(resolveLettersTab({}, office)).toBe('new');
  });

  it('явная валидная вкладка — как есть', () => {
    for (const tab of ['incoming', 'outgoing', 'access'] as const) {
      expect(resolveLettersTab(q(`tab=${tab}`), employee)).toBe(tab);
      expect(resolveLettersTab({ tab }, office)).toBe(tab);
    }
    expect(resolveLettersTab(q('tab=new'), office)).toBe('new');
  });

  it('«Новые» без права и мусор — «Входящие» сотруднику, «Новые» канцелярии', () => {
    expect(resolveLettersTab(q('tab=new'), employee)).toBe('incoming');
    expect(resolveLettersTab(q('tab=registry'), employee)).toBe('incoming');
    expect(resolveLettersTab(q('tab=registry'), office)).toBe('incoming');
  });
});

describe('вкладки «Корреспонденции» в топбаре: фильтр по праву (#55)', () => {
  const letters = NAV_MODULES.find((module) => module.id === 'letters')!;

  it('канцелярия видит «Новые», сотрудник — нет; «Права доступа» последней', () => {
    expect(visibleNavTabs(letters, office).map((t) => t.id)).toEqual([
      'new',
      'incoming',
      'outgoing',
      'access',
    ]);
    expect(visibleNavTabs(letters, employee).map((t) => t.id)).toEqual([
      'incoming',
      'outgoing',
      'access',
    ]);
  });

  it('подсветка по умолчанию зависит от прав', () => {
    const active = (permissions: readonly string[]) =>
      visibleNavTabs(letters, permissions).find((t) => t.isActive(q(''), permissions))?.id;
    expect(active(office)).toBe('new');
    expect(active(employee)).toBe('incoming');
  });
});
