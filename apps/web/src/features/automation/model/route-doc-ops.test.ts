import { describe, expect, it } from 'vitest';
import type { WorkflowDraftDocument, WorkflowLayout } from '@nodus/contracts';

import { resolveRoute } from '../../../shared/flow/route-resolve.js';
import { freezeLayout, setStagePosition, settleLoops } from './route-doc-ops.js';

const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const C = '00000000-0000-4000-8000-000000000003';
const rules = { conditions: [], validators: [], postFunctions: [] };

const stage = (id: string, name: string, isInitial = false) => ({
  id,
  code: null,
  name,
  color: 'neutral' as const,
  systemState: 'active' as const,
  outcome: null,
  isInitial,
  sortOrder: 0,
});
const back = (id: string, from: string, sortOrder: number) => ({
  id,
  code: null,
  name: `Вернуть ${sortOrder}`,
  fromStageId: from,
  toStageId: A,
  display: 'button' as const,
  sortOrder,
  rules,
});

/** A — B — C в ряд, две обратные стрелки в A понизу (U-обходы). */
const doc = (layout?: WorkflowLayout): WorkflowDraftDocument => ({
  stages: [stage(A, 'А', true), stage(B, 'Б'), stage(C, 'В')],
  transitions: [back('ba', B, 0), back('ca', C, 1)],
  ...(layout ? { layout } : {}),
});
const pinned: WorkflowLayout = {
  stages: { [A]: { x: 0, y: 0 }, [B]: { x: 400, y: 0 }, [C]: { x: 800, y: 0 } },
  transitions: {
    ba: { sourceHandle: 'b1', targetHandle: 'b1', offset: 24 },
    ca: { sourceHandle: 'b3', targetHandle: 'b3', offset: 40 },
  },
};

describe('route-doc-ops: «что видишь — то и стоит» (#378 ред. 2)', () => {
  it('первая правка фиксирует всю видимую картинку: позиции, точки, глубины', () => {
    const fresh = doc();
    const before = resolveRoute(fresh);
    const next = freezeLayout(fresh, setStagePosition(fresh, B, { x: 500, y: 300 }));
    const after = resolveRoute(next);
    expect(after.positions.get(B)).toEqual({ x: 500, y: 300 });
    expect(after.positions.get(A)).toEqual(before.positions.get(A));
    expect(after.positions.get(C)).toEqual(before.positions.get(C));
    for (const [id, h] of before.handles) expect(after.handles.get(id)).toEqual(h);
    for (const id of before.loops.keys()) {
      expect(next.layout?.transitions[id]?.offset).toBe(before.spread.get(id)!.offset);
    }
  });

  it('сдвинутый обход держит глубину, чужой обход не меняется никогда', () => {
    const prev = doc(pinned);
    const next = settleLoops(prev, setStagePosition(prev, C, { x: 800, y: 300 }));
    expect(next.layout?.transitions.ca?.offset).toBe(40);
    expect(next.layout?.transitions.ba).toEqual(pinned.transitions.ba);
  });

  it('сдвинутый обход при наложении уходит глубже — сосед остаётся на месте', () => {
    const prev = doc({
      ...pinned,
      transitions: { ...pinned.transitions, ca: { ...pinned.transitions.ca, offset: 56 } },
    });
    // C сдвинули так, что линия его обхода легла на линию обхода B → A.
    const next = settleLoops(prev, setStagePosition(prev, C, { x: 800, y: -32 }));
    expect(next.layout?.transitions.ba?.offset).toBe(24);
    const depth = resolveRoute(next);
    const ba = depth.loops.get('ba')!;
    const ca = depth.loops.get('ca')!;
    expect(Math.abs(ca.base + depth.spread.get('ca')!.offset - (ba.base + 24))).toBeGreaterThan(11);
  });
});
