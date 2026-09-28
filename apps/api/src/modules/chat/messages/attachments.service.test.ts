import { Readable } from 'node:stream';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PinoLogger } from 'nestjs-pino';

import { SignedUrlService } from '../../../core/crypto/signed-url.service.js';
import type { FileStorage } from '../../../core/ports/file-storage.port.js';
import { AttachmentsRepository, type AttachmentRow } from './attachments.repository.js';
import {
  AttachmentsService,
  MAX_ATTACHMENT_BYTES,
  MAX_PENDING_ATTACHMENTS,
} from './attachments.service.js';

const OWNER = '00000000-0000-0000-0000-000000000001';

function makeService(
  storageOverrides: Partial<FileStorage> = {},
  repoOverrides: Partial<AttachmentsRepository> = {},
): { service: AttachmentsService; storage: FileStorage; repo: AttachmentsRepository } {
  const storage: FileStorage = {
    save: vi.fn(async () => ({ fileId: '00000000-0000-0000-0000-00000000000f' })),
    remove: vi.fn(async () => undefined),
    ...storageOverrides,
  };
  const repo = {
    countUnclaimed: vi.fn(async () => 0),
    findStaleUnclaimed: vi.fn(async () => []),
    deleteUnclaimedByIds: vi.fn(async () => undefined),
    insertAttachment: vi.fn(async (row: AttachmentRow): Promise<AttachmentRow> => row),
    findUnclaimed: vi.fn(async () => null),
    deleteUnclaimed: vi.fn(async () => true),
    ...repoOverrides,
  } as unknown as AttachmentsRepository;
  const service = new AttachmentsService(
    storage,
    repo,
    new SignedUrlService({ STORAGE_URL_SECRET: 'test-secret-32-chars-aaaaaaaaaaaa' }),
    { setContext: vi.fn(), info: vi.fn(), warn: vi.fn() } as unknown as PinoLogger,
  );
  return { service, storage, repo };
}

function content(): Readable {
  return Readable.from(['hello']);
}

describe('AttachmentsService (#57)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('загружает: kind=image для изображений, url — подписанная ссылка', async () => {
    const { service } = makeService();
    const dto = await service.upload(
      OWNER,
      { name: 'foto.png', mime: 'image/png', size: 10, width: 640, height: 480 },
      content(),
    );
    expect(dto.kind).toBe('image');
    expect(dto.width).toBe(640);
    expect(dto.url).toMatch(/^\/api\/v1\/files\/.+\/content\?exp=\d+&sig=[0-9a-f]{64}$/);
    expect(dto.thumbnailUrl).toBeNull();
  });

  it('kind=file для не-изображений', async () => {
    const { service } = makeService();
    const dto = await service.upload(
      OWNER,
      { name: 'doc.pdf', mime: 'application/pdf', size: 10 },
      content(),
    );
    expect(dto.kind).toBe('file');
  });

  it(`файл > ${MAX_ATTACHMENT_BYTES} байт — CHAT_ATTACHMENT_TOO_LARGE (413) до записи`, async () => {
    const { service, storage } = makeService();
    await expect(
      service.upload(
        OWNER,
        { name: 'big.zip', mime: 'application/zip', size: MAX_ATTACHMENT_BYTES + 1 },
        content(),
      ),
    ).rejects.toMatchObject({ code: 'CHAT_ATTACHMENT_TOO_LARGE', httpStatus: 413 });
    expect(storage.save).not.toHaveBeenCalled();
  });

  it(`${MAX_PENDING_ATTACHMENTS}+ неотправленных — CHAT_ATTACHMENT_TOO_MANY`, async () => {
    const { service } = makeService(
      {},
      { countUnclaimed: vi.fn(async () => MAX_PENDING_ATTACHMENTS) },
    );
    await expect(
      service.upload(OWNER, { name: 'a.txt', mime: 'text/plain', size: 1 }, content()),
    ).rejects.toMatchObject({ code: 'CHAT_ATTACHMENT_TOO_MANY' });
  });

  it('отмена: удаляет строку и объект хранилища; чужое/отправленное — молча', async () => {
    const fileId = '00000000-0000-0000-0000-00000000000f';
    const { service, storage } = makeService(
      {},
      {
        findUnclaimed: vi.fn(async () => ({
          id: 'att-1',
          fileId,
          ownerId: OWNER,
          name: 'a.txt',
          size: 1,
          mime: 'text/plain',
          kind: 'file',
          width: null,
          height: null,
        })),
      },
    );
    await service.cancel(OWNER, 'att-1');
    expect(storage.remove).toHaveBeenCalledWith([fileId]);
  });

  it('сбой GC брошенных загрузок не валит новую загрузку', async () => {
    const { service } = makeService(
      {},
      {
        findStaleUnclaimed: vi.fn(async () => {
          throw new Error('db down');
        }),
      },
    );
    const dto = await service.upload(
      OWNER,
      { name: 'a.txt', mime: 'text/plain', size: 1 },
      content(),
    );
    expect(dto.id).toBeTruthy();
  });
});
