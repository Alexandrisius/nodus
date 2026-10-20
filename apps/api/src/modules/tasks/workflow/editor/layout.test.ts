import { describe, expect, it } from 'vitest';

import { liveLayout, resolveLayout } from './layout.js';

const S1 = '00000000-0000-4000-8000-000000000001';
const S2 = '00000000-0000-4000-8000-000000000002';
const T1 = '00000000-0000-4000-8000-000000000011';
const NEW_S = '00000000-0000-4000-8000-0000000000aa';
const NEW_T = '00000000-0000-4000-8000-0000000000bb';

describe('раскладка холста (#378 ред. 2)', () => {
  it('публикация: new:* ключи → созданные uuid, удалённые элементы отброшены', () => {
    const layout = resolveLayout(
      {
        stages: { [S1]: { x: 0, y: 0 }, 'new:check': { x: 300, y: 40 }, [S2]: { x: 9, y: 9 } },
        transitions: {
          [T1]: { sourceHandle: 'r2', targetHandle: 'l2', labelT: 0.4 },
          'new:approve': { labelT: 0.7 },
        },
      },
      {
        stages: new Map([['new:check', NEW_S]]),
        transitions: new Map([['new:approve', NEW_T]]),
      },
      { stageIds: new Set([S1, NEW_S]), transitionIds: new Set([T1, NEW_T]) },
    );
    expect(layout.stages).toEqual({ [S1]: { x: 0, y: 0 }, [NEW_S]: { x: 300, y: 40 } });
    expect(layout.transitions).toEqual({
      [T1]: { sourceHandle: 'r2', targetHandle: 'l2', labelT: 0.4 },
      [NEW_T]: { labelT: 0.7 },
    });
  });

  it('чтение: битая или пустая запись — авторасстановка, чужие ключи отброшены', () => {
    const live = { stageIds: new Set([S1]), transitionIds: new Set<string>() };
    expect(liveLayout({}, live)).toEqual({ stages: {}, transitions: {} });
    expect(liveLayout({ stages: { [S1]: { x: 'bad' } }, transitions: {} }, live)).toEqual({
      stages: {},
      transitions: {},
    });
    expect(
      liveLayout({ stages: { [S1]: { x: 1, y: 2 }, [S2]: { x: 3, y: 4 } }, transitions: {} }, live),
    ).toEqual({ stages: { [S1]: { x: 1, y: 2 } }, transitions: {} });
  });
});
