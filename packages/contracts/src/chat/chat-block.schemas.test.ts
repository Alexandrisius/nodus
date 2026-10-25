import { describe, expect, it } from 'vitest';

import {
  chatMessageBlockSchema,
  chatMessageKindSchema,
  lookupMessagesQuerySchema,
} from './chat-block.schemas.js';

const block = {
  kind: 'task_transition',
  taskId: crypto.randomUUID(),
  recordId: crypto.randomUUID(),
  transitionName: 'Приостановить',
  fromStageName: 'В работе',
  toStageName: 'Приостановлена',
  commentLabel: 'Причина приостановки',
  result: { fileCount: 2, messageCount: 1 },
};

describe('вид сообщения и блок перехода (#380)', () => {
  it('виды: text и task_transition (#313 добавит system)', () => {
    expect(chatMessageKindSchema.parse('text')).toBe('text');
    expect(chatMessageKindSchema.parse('task_transition')).toBe('task_transition');
    expect(() => chatMessageKindSchema.parse('system')).toThrow();
  });

  it('блок раздела перехода проходит; неизвестный вид отвергается', () => {
    expect(chatMessageBlockSchema.parse(block)).toEqual(block);
    expect(() => chatMessageBlockSchema.parse({ kind: 'system' })).toThrow();
  });

  it('лимиты блока: названия 32/40, подпись 60', () => {
    expect(() =>
      chatMessageBlockSchema.parse({ ...block, transitionName: 'я'.repeat(33) }),
    ).toThrow();
    expect(() =>
      chatMessageBlockSchema.parse({ ...block, fromStageName: 'я'.repeat(41) }),
    ).toThrow();
    expect(() =>
      chatMessageBlockSchema.parse({ ...block, commentLabel: 'я'.repeat(61) }),
    ).toThrow();
  });

  it('ids lookup: 1..50 уникальных, разбор строки', () => {
    const ids = [crypto.randomUUID(), crypto.randomUUID()];
    expect(lookupMessagesQuerySchema.parse({ ids: ids.join(',') }).ids).toEqual(ids);
    expect(() => lookupMessagesQuerySchema.parse({ ids: ids[0] })).not.toThrow();
    expect(() => lookupMessagesQuerySchema.parse({ ids: `${ids[0]},${ids[0]}` })).toThrow();
    expect(() => lookupMessagesQuerySchema.parse({ ids: '' })).toThrow();
    const many = Array.from({ length: 51 }, () => crypto.randomUUID());
    expect(() => lookupMessagesQuerySchema.parse({ ids: many.join(',') })).toThrow();
  });
});
