import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NOTIFICATION_EVENTS } from '@nodus/contracts';

import { UrgentRepeatWorker } from './urgent-repeat.worker.js';

const NOTIF_ID = '66666666-6666-6666-6666-666666666666';
const USER = '33333333-3333-3333-3333-333333333333';
const MSG = '44444444-4444-4444-4444-444444444444';
const TX = 'tx-handle';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTIF_ID,
    seq: 1n,
    user_id: USER,
    priority: 'urgent',
    kind: 'urgent.message',
    source_type: 'conversation',
    source_id: '11111111-1111-1111-1111-111111111111',
    source_seq: 5n,
    actor_id: '22222222-2222-2222-2222-222222222222',
    preview: 'Срочно',
    urgent_text: 'Полный текст',
    conversation_id: '11111111-1111-1111-1111-111111111111',
    conversation_title: null,
    message_id: MSG,
    thread_root_id: null,
    created_at: new Date(Date.now() - 6 * 60 * 1000),
    read_at: null,
    ack_at: null,
    repeats_stopped_at: null,
    ...overrides,
  };
}

describe('UrgentRepeatWorker.remind', () => {
  const repo = {
    findRaw: vi.fn(),
    markRepeatsStopped: vi.fn(),
  };
  const txRunner = { run: vi.fn((cb: (tx: string) => unknown) => cb(TX)) };
  const eventBus = { emit: vi.fn() };
  const repeats = { reenqueue: vi.fn() };
  let worker: UrgentRepeatWorker;

  beforeEach(() => {
    vi.clearAllMocks();
    repo.findRaw.mockResolvedValue(row());
    worker = new UrgentRepeatWorker(
      repo as never,
      txRunner as never,
      eventBus as never,
      repeats as never,
      { setContext: vi.fn(), warn: vi.fn() } as never,
    );
  });

  it('C2: живое срочное — эмит повтора (attempt>=1) и перепланирование', async () => {
    const outcome = await worker.remind(NOTIF_ID);
    expect(outcome).toBe('sent');
    expect(eventBus.emit).toHaveBeenCalledWith(
      TX,
      NOTIFICATION_EVENTS.DISPATCH_REQUESTED,
      expect.objectContaining({ attempt: expect.any(Number) }),
      expect.objectContaining({ aggregateType: 'notification' }),
    );
    expect(repeats.reenqueue).toHaveBeenCalledWith(NOTIF_ID, expect.any(Number));
  });

  it('C2: ознакомлен — стоп повторов', async () => {
    repo.findRaw.mockResolvedValue(row({ ack_at: new Date() }));
    expect(await worker.remind(NOTIF_ID)).toBe('stop');
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it('C3: прочтение (вход в чат) — стоп повторов', async () => {
    repo.findRaw.mockResolvedValue(row({ repeats_stopped_at: new Date() }));
    expect(await worker.remind(NOTIF_ID)).toBe('stop');
  });

  it('C4: потолок времени — стоп, строка остаётся непрочитанной', async () => {
    // Ревизия 05.10: потолок 3600с (пуш каждые 5 минут в течение часа) —
    // 61 минута = expired.
    repo.findRaw.mockResolvedValue(row({ created_at: new Date(Date.now() - 61 * 60 * 1000) }));
    expect(await worker.remind(NOTIF_ID)).toBe('expired');
    expect(repo.markRepeatsStopped).toHaveBeenCalledWith(NOTIF_ID);
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it('не-urgent строки повторами не занимаются', async () => {
    repo.findRaw.mockResolvedValue(row({ priority: 'high' }));
    expect(await worker.remind(NOTIF_ID)).toBe('stop');
  });
});
