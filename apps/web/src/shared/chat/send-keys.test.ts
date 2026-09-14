import { describe, expect, it } from 'vitest';

import { isSendShortcut } from './send-keys.js';

describe('send-keys: классика мессенджеров (вердикт владельца 14.09.2026)', () => {
  it('Enter без модификаторов — отправка', () => {
    expect(isSendShortcut('Enter', false, false)).toBe(true);
  });

  it('Shift+Enter и Ctrl+Enter — перенос строки, НЕ отправка', () => {
    expect(isSendShortcut('Enter', true, false)).toBe(false);
    expect(isSendShortcut('Enter', false, true)).toBe(false);
    expect(isSendShortcut('Enter', true, true)).toBe(false);
  });

  it('прочие клавиши — не отправка', () => {
    expect(isSendShortcut('a', false, false)).toBe(false);
    expect(isSendShortcut('Escape', false, false)).toBe(false);
  });
});
