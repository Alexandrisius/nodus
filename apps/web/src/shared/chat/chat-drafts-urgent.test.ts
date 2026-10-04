import { beforeEach, describe, expect, it } from 'vitest';

import { useChatDrafts } from './chat-drafts.js';

/** Молния «Важное» в черновиках (#177, ревизия модели 05.10 — простой
 *  тоггл): setUrgent переключает флаг, prune держит черновик при горящей
 *  молнии (иначе тоггл на пустом поле вычищался бы), clear сбрасывает. */

const KEY = 'conversation:probe-177';

describe('useChatDrafts: молния «Важное» (#177)', () => {
  beforeEach(() => {
    useChatDrafts.getState().clear(KEY);
  });

  it('setUrgent(true) включает молнию на пустом поле — черновик держится в сторе', () => {
    useChatDrafts.getState().setUrgent(KEY, true);
    expect(useChatDrafts.getState().drafts[KEY]?.urgent).toBe(true);
  });

  it('setUrgent(false) гасит молнию — пустой черновик вычищается (prune)', () => {
    useChatDrafts.getState().setUrgent(KEY, true);
    useChatDrafts.getState().setUrgent(KEY, false);
    expect(useChatDrafts.getState().drafts[KEY]).toBeUndefined();
  });

  it('clear (успешная отправка) сбрасывает молнию целиком', () => {
    useChatDrafts.getState().setUrgent(KEY, true);
    useChatDrafts.getState().setText(KEY, 'текст');
    useChatDrafts.getState().clear(KEY);
    expect(useChatDrafts.getState().drafts[KEY]).toBeUndefined();
    const restored = useChatDrafts.getState().drafts[KEY] ?? { urgent: false };
    expect(restored.urgent).toBe(false);
  });
});
