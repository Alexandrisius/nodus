import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AttachmentSentHandler } from './attachment-sent.handler.js';
import type { DerivativesService } from '../derivatives/derivatives.service.js';
import type { DerivativesQueue } from '../derivatives/derivatives.queue.js';
import type { FilesRepository, FileObjectRow } from '../files.repository.js';

const FILE_DOCX = '00000000-0000-0000-0000-0000000000d1';
const FILE_XLSX = '00000000-0000-0000-0000-0000000000x1';

function file(id: string, name: string): FileObjectRow {
  return {
    id,
    ownerId: '00000000-0000-0000-0000-000000000001',
    bucket: 'b',
    key: `files/${id}`,
    version: 1,
    name,
    mime: 'application/octet-stream',
    size: 1,
    scanStatus: 'pending',
    derivedFrom: null,
    createdAt: new Date(),
  };
}

function makeEvent(attachments: unknown[]) {
  return {
    id: 'e1',
    type: 'chat.message_sent',
    actorId: null,
    payload: { message: { attachments } },
    createdAt: '2026-10-01T00:00:00Z',
  } as never;
}

describe('AttachmentSentHandler (#139: запуск конвейера по отправке)', () => {
  const files = { findById: vi.fn() };
  const derivatives = { shouldGeneratePdf: (name: string) => /\.(docx|odt|rtf)$/i.test(name) };
  const queue = { enqueuePdf: vi.fn() };
  const logger = { setContext: vi.fn() };
  let handler: AttachmentSentHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new AttachmentSentHandler(
      files as never as FilesRepository,
      derivatives as never as DerivativesService,
      queue as never as DerivativesQueue,
      logger as never,
    );
  });

  it('офисное вложение → постановка PDF-производной текущей версии', async () => {
    files.findById.mockResolvedValue(file(FILE_DOCX, 'Смета.docx'));
    await handler.handle(makeEvent([{ fileId: FILE_DOCX }]));
    expect(queue.enqueuePdf).toHaveBeenCalledWith(FILE_DOCX, 1);
  });

  it('xlsx пропускается (спека), прочие вложения — тоже', async () => {
    files.findById.mockImplementation(async (id: string) =>
      id === FILE_XLSX ? file(FILE_XLSX, 'Ведомость.xlsx') : file(id, 'картинка.png'),
    );
    await handler.handle(makeEvent([{ fileId: FILE_XLSX }, { fileId: 'img-1' }]));
    expect(queue.enqueuePdf).not.toHaveBeenCalled();
  });

  it('без вложений и с мусорным payload — тишина', async () => {
    await handler.handle(makeEvent([]));
    await handler.handle(makeEvent([{ nope: 1 }]));
    expect(files.findById).not.toHaveBeenCalled();
  });
});
