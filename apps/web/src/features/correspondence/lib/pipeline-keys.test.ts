import { describe, expect, it } from 'vitest';

import { neighbourId, nextAfterRemoval, pipelineKeyAction } from './pipeline-keys.js';

const key = (patch: Partial<Parameters<typeof pipelineKeyAction>[0]>) => ({
  key: '',
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...patch,
});

describe('клавиатура конвейера «Новые» (#55, U4)', () => {
  it('Alt+↑/↓ — соседнее письмо, Ctrl/⌘+Enter — регистрация (и из поля ввода)', () => {
    expect(pipelineKeyAction(key({ altKey: true, key: 'ArrowUp' }), true)).toBe('prev');
    expect(pipelineKeyAction(key({ altKey: true, key: 'ArrowDown' }), true)).toBe('next');
    expect(pipelineKeyAction(key({ ctrlKey: true, key: 'Enter' }), true)).toBe('register');
    expect(pipelineKeyAction(key({ metaKey: true, key: 'Enter' }), false)).toBe('register');
    expect(pipelineKeyAction(key({ key: 'Enter' }), true)).toBeNull();
    expect(pipelineKeyAction(key({ key: 'ArrowDown' }), false)).toBeNull();
  });

  it('Shift+Delete — спам только вне поля ввода («вырезать» Windows не ломаем)', () => {
    expect(pipelineKeyAction(key({ shiftKey: true, key: 'Delete' }), false)).toBe('spam');
    expect(pipelineKeyAction(key({ shiftKey: true, key: 'Delete' }), true)).toBeNull();
    expect(pipelineKeyAction(key({ key: 'Delete' }), false)).toBeNull();
  });

  it('соседнее письмо: края держатся, без выбора — первое', () => {
    const ids = ['a', 'b', 'c'];
    expect(neighbourId(ids, 'b', 1)).toBe('c');
    expect(neighbourId(ids, 'c', 1)).toBe('c');
    expect(neighbourId(ids, 'a', -1)).toBe('a');
    expect(neighbourId(ids, null, 1)).toBe('a');
    expect(neighbourId([], null, 1)).toBeNull();
  });

  it('после регистрации — следующее ниже, на последнем — предыдущее, пусто — null', () => {
    expect(nextAfterRemoval(['a', 'b', 'c'], 'a')).toBe('b');
    expect(nextAfterRemoval(['a', 'b', 'c'], 'c')).toBe('b');
    expect(nextAfterRemoval(['a'], 'a')).toBeNull();
  });
});
