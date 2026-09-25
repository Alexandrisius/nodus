// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { MESSAGE_TEXT_LIMIT, messageLimitState } from './chat-composer.js';

/** Превалидация лимита 4000 (раунд 3, замечание 5): счётчик у черты,
 *  блокировка с понятным сообщением — текст не теряется (сервер 422 не
 *  наступает). Границы по контрактной семантике text.max(4000). */

describe('messageLimitState', () => {
  it('далеко от лимита — без счётчика', () => {
    expect(messageLimitState(100)).toEqual({ over: false, counter: null });
    expect(messageLimitState(3500)).toEqual({ over: false, counter: null });
  });

  it('у черты (3501..4000) — счётчик «N / 4000», не заблокировано', () => {
    expect(messageLimitState(3501)).toEqual({ over: false, counter: '3501 / 4000' });
    expect(messageLimitState(4000)).toEqual({ over: false, counter: '4000 / 4000' });
  });

  it('превышение (4001+) — заблокировано, счётчик виден', () => {
    expect(messageLimitState(4001)).toEqual({ over: true, counter: '4001 / 4000' });
    expect(messageLimitState(12000)).toEqual({ over: true, counter: '12000 / 4000' });
  });

  it('константа лимита соответствует контракту', () => {
    expect(MESSAGE_TEXT_LIMIT).toBe(4000);
  });
});
