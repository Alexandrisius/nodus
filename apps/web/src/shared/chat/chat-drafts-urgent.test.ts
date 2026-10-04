import { beforeEach, describe, expect, it } from 'vitest';

import { useChatDrafts } from './chat-drafts.js';

/** Семантика молнии «Важное» в черновиках (#177, замечание валидатора):
 *  setUrgent гасит requireAck, setRequireAck поднимает urgent, prune держит
 *  черновик живым при горящей молнии (иначе тоггл на пустом поле вычищался),
 *  clear сбрасывает всё. */

const KEY = 'conversation:probe-177';

describe('useChatDrafts: молния «Важное» (#177)', () => {
  beforeEach(() => {
    useChatDrafts.getState().clear(KEY);
  });

  it('setUrgent(true) включает молнию на пустом поле — черновик держится в сторе', () => {
    useChatDrafts.getState().setUrgent(KEY, true);
    expect(useChatDrafts.getState().drafts[KEY]?.urgent).toBe(true);
    expect(useChatDrafts.getState().drafts[KEY]?.requireAck).toBe(false);
  });

  it('setRequireAck(true) поднимает и молнию (чекбокс невозможен без «Важного»)', () => {
    useChatDrafts.getState().setRequireAck(KEY, true);
    expect(useChatDrafts.getState().drafts[KEY]).toMatchObject({
      urgent: true,
      requireAck: true,
    });
  });

  it('setUrgent(false) гасит и молнию, и чекбокс — пустой черновик вычищается (prune)', () => {
    useChatDrafts.getState().setRequireAck(KEY, true);
    useChatDrafts.getState().setUrgent(KEY, false);
    // Черновик стал пустым → prune удаляет его; «выключено» = отсутствие.
    expect(useChatDrafts.getState().drafts[KEY]).toBeUndefined();
  });

  it('setRequireAck(false) снимает только чекбокс — молния остаётся', () => {
    useChatDrafts.getState().setRequireAck(KEY, true);
    useChatDrafts.getState().setRequireAck(KEY, false);
    expect(useChatDrafts.getState().drafts[KEY]).toMatchObject({
      urgent: true,
      requireAck: false,
    });
  });

  it('prune: черновик только с молнией НЕ вычищается, без молнии — вычищается', () => {
    useChatDrafts.getState().setUrgent(KEY, true);
    expect(useChatDrafts.getState().drafts[KEY]).toBeDefined();
    useChatDrafts.getState().setUrgent(KEY, false);
    expect(useChatDrafts.getState().drafts[KEY]).toBeUndefined();
  });

  it('clear (успешная отправка) сбрасывает молнию целиком', () => {
    useChatDrafts.getState().setRequireAck(KEY, true);
    useChatDrafts.getState().setText(KEY, 'текст');
    useChatDrafts.getState().clear(KEY);
    expect(useChatDrafts.getState().drafts[KEY]).toBeUndefined();
    const restored = useChatDrafts.getState().drafts[KEY] ?? {
      urgent: false,
      requireAck: false,
    };
    expect(restored.urgent).toBe(false);
    expect(restored.requireAck).toBe(false);
  });
});
