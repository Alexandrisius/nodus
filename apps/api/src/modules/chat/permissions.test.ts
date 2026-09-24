import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import type { ConversationPermissions } from '@nodus/contracts';

import {
  DEFAULT_CONVERSATION_PERMISSIONS,
  can,
  mergePermissions,
  parsePermissions,
  roleSatisfies,
} from './permissions.js';

describe('mergePermissions', () => {
  it('без partial → дефолты сервера', () => {
    expect(mergePermissions()).toEqual(DEFAULT_CONVERSATION_PERMISSIONS);
    expect(mergePermissions(undefined)).toEqual(DEFAULT_CONVERSATION_PERMISSIONS);
  });

  it('частичная матрица → недостающее дополняется дефолтами', () => {
    expect(mergePermissions({ post: 'admin', changeInfo: 'member' })).toEqual({
      changeInfo: 'member',
      addMembers: 'member',
      removeMembers: 'admin',
      post: 'admin',
      manageSettings: 'owner',
    });
  });

  it('невалидная роль в partial → ZodError', () => {
    expect(() =>
      mergePermissions({ post: 'boss' } as unknown as Partial<ConversationPermissions>),
    ).toThrow(ZodError);
  });
});

describe('roleSatisfies', () => {
  it('иерархия owner >= admin >= member (все комбинации)', () => {
    const table: [
      role: 'owner' | 'admin' | 'member',
      required: 'owner' | 'admin' | 'member',
      ok: boolean,
    ][] = [
      ['owner', 'owner', true],
      ['owner', 'admin', true],
      ['owner', 'member', true],
      ['admin', 'owner', false],
      ['admin', 'admin', true],
      ['admin', 'member', true],
      ['member', 'owner', false],
      ['member', 'admin', false],
      ['member', 'member', true],
    ];
    for (const [role, required, ok] of table) {
      expect(roleSatisfies(role, required)).toBe(ok);
    }
  });
});

describe('can', () => {
  it('owner удовлетворяет любому требованию матрицы', () => {
    const strictest: ConversationPermissions = {
      changeInfo: 'owner',
      addMembers: 'owner',
      removeMembers: 'owner',
      post: 'owner',
      manageSettings: 'owner',
    };
    for (const action of Object.keys(strictest) as (keyof ConversationPermissions)[]) {
      expect(can('owner', strictest, action)).toBe(true);
    }
  });

  it('member не проходит требования admin/owner, проходит member', () => {
    expect(can('member', DEFAULT_CONVERSATION_PERMISSIONS, 'removeMembers')).toBe(false);
    expect(can('member', DEFAULT_CONVERSATION_PERMISSIONS, 'manageSettings')).toBe(false);
    expect(can('admin', DEFAULT_CONVERSATION_PERMISSIONS, 'removeMembers')).toBe(true);
    expect(can('member', DEFAULT_CONVERSATION_PERMISSIONS, 'post')).toBe(true);
    expect(can('member', DEFAULT_CONVERSATION_PERMISSIONS, 'addMembers')).toBe(true);
    expect(can('member', DEFAULT_CONVERSATION_PERMISSIONS, 'changeInfo')).toBe(false);
  });
});

describe('parsePermissions', () => {
  it('валидный JSONB → как есть', () => {
    const matrix = { ...DEFAULT_CONVERSATION_PERMISSIONS, post: 'owner' } as const;
    expect(parsePermissions(matrix)).toEqual(matrix);
  });

  it('мусор в БД → дефолты', () => {
    expect(parsePermissions(null)).toEqual(DEFAULT_CONVERSATION_PERMISSIONS);
    expect(parsePermissions('мусор')).toEqual(DEFAULT_CONVERSATION_PERMISSIONS);
    expect(parsePermissions({})).toEqual(DEFAULT_CONVERSATION_PERMISSIONS);
    expect(parsePermissions({ post: 123 })).toEqual(DEFAULT_CONVERSATION_PERMISSIONS);
  });
});
