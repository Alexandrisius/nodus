import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_EVENTS, FILE_EVENTS } from '@nodus/contracts';

import { FileVersionHandler } from './file-version.handler.js';

const FILE_ID = '00000000-0000-0000-0000-00000000000f';
const CONV_A = '11111111-1111-1111-1111-111111111111';
const CONV_B = '22222222-2222-2222-2222-222222222222';
const EVENT_ID = '55555555-5555-5555-5555-555555555555';
const TX = 'tx-handle';

function makeEvent(payload: Record<string, unknown> = {}) {
  return {
    id: EVENT_ID,
    type: FILE_EVENTS.VERSION_CREATED,
    actorId: null,
    payload: { fileId: FILE_ID, version: 2, size: 128, mime: 'text/csv', ...payload },
    createdAt: '2026-10-01T00:00:00Z',
  } as never;
}

describe('FileVersionHandler (#182: мост версий в беседы)', () => {
  const prisma = { messageAttachment: { findMany: vi.fn() } };
  const txRunner = { run: vi.fn((cb: (tx: string) => unknown) => cb(TX)) };
  const eventBus = { emit: vi.fn() };
  const logger = { setContext: vi.fn(), info: vi.fn() };
  let handler: FileVersionHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new FileVersionHandler(
      prisma as never,
      txRunner as never,
      eventBus as never,
      logger as never,
    );
  });

  it('эмитит chat.attachment_updated в каждую беседу вложения (distinct)', async () => {
    prisma.messageAttachment.findMany.mockResolvedValue([
      { message: { conversationId: CONV_A } },
      { message: { conversationId: CONV_A } }, // тот же файл дважды в беседе
      { message: { conversationId: CONV_B } },
    ]);
    await handler.handle(makeEvent());

    expect(prisma.messageAttachment.findMany).toHaveBeenCalledWith({
      where: { fileId: FILE_ID, messageId: { not: null } },
      select: { message: { select: { conversationId: true } } },
    });
    expect(eventBus.emit).toHaveBeenCalledTimes(2);
    expect(eventBus.emit).toHaveBeenCalledWith(
      TX,
      CHAT_EVENTS.ATTACHMENT_UPDATED,
      {
        conversationId: CONV_A,
        fileId: FILE_ID,
        version: 2,
        size: 128,
      },
      expect.anything(),
    );
    expect(eventBus.emit).toHaveBeenCalledWith(
      TX,
      CHAT_EVENTS.ATTACHMENT_UPDATED,
      expect.objectContaining({ conversationId: CONV_B }),
      expect.anything(),
    );
  });

  it('вложений в беседах нет (только «трей») — молча, без эмитов', async () => {
    prisma.messageAttachment.findMany.mockResolvedValue([{ message: null }]);
    await handler.handle(makeEvent());
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it('мусорный payload без fileId — игнор', async () => {
    await handler.handle(makeEvent({ fileId: undefined }));
    expect(prisma.messageAttachment.findMany).not.toHaveBeenCalled();
  });
});
