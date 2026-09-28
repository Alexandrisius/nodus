import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { PinoLogger } from 'nestjs-pino';

import { AuditRepository } from '../../../core/audit/audit.repository.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { FilesRepository, type FileObjectRow, type FileVersionRow } from '../files.repository.js';
import { MinioStorageDriver } from '../storage/minio-storage.driver.js';
import type { OfficeConfig } from './office.config.js';
import { OfficeCallbackService, type OfficeCallbackBody } from './office-callback.service.js';

const FILE_ID = '00000000-0000-0000-0000-00000000000f';
const SECRET = 'test-secret-32-chars-aaaaaaaaaaaa';

function makeFile(version = 1): FileObjectRow {
  return {
    id: FILE_ID,
    ownerId: '00000000-0000-0000-0000-000000000001',
    bucket: 'nodus-files',
    key: version === 1 ? `files/${FILE_ID}` : `files/${FILE_ID}/v${version}`,
    version,
    name: 'Смета.xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: 1024,
    scanStatus: 'pending',
    createdAt: new Date(),
  };
}

function makeVersionRow(
  version: number,
  sourceKey: string | null,
  sourceLastsave: string | null,
): FileVersionRow {
  return {
    id: `00000000-0000-0000-0000-0000000000${version}0`,
    fileObjectId: FILE_ID,
    version,
    key: `files/${FILE_ID}/v${version}`,
    size: 1024,
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    sourceKey,
    sourceLastsave: sourceLastsave ? BigInt(Date.parse(sourceLastsave)) : null,
    createdAt: new Date(),
  };
}

interface Mocks {
  findById: ReturnType<typeof vi.fn>;
  findVersions: ReturnType<typeof vi.fn>;
  saveVersion: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  append: ReturnType<typeof vi.fn>;
}

interface Harness {
  service: OfficeCallbackService;
  mocks: Mocks;
  tx: Record<string, unknown>;
}

function makeHarness(file: FileObjectRow | null, versions: FileVersionRow[] = []): Harness {
  const mocks = {
    findById: vi.fn(async () => file),
    findVersions: vi.fn(async () => versions),
    saveVersion: vi.fn(async (_tx: unknown, input: unknown) => input),
    put: vi.fn(async () => ({ etag: 'e', bytes: 2 })),
    remove: vi.fn(async () => undefined),
    emit: vi.fn(async () => undefined),
    append: vi.fn(async () => undefined),
  };
  const repo = mocks as unknown as FilesRepository;
  const driver = mocks as unknown as MinioStorageDriver;
  const tx = { marker: 'tx' };
  const txRunner = {
    run: vi.fn(async (fn: (tx: unknown) => Promise<void>) => fn(tx)),
  } as unknown as TransactionRunner;
  const eventBus = mocks as unknown as EventBus;
  const audit = mocks as unknown as AuditRepository;
  const config: OfficeConfig = {
    enabled: true,
    editEnabled: true,
    jwtSecret: SECRET,
    apiInternalUrl: 'http://api-internal:3001',
    internalUrl: 'http://ds-internal:80',
    maxViewBytes: 52_428_800,
  };
  const service = new OfficeCallbackService(repo, driver, txRunner, eventBus, audit, config, {
    setContext: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  } as unknown as PinoLogger);
  return { service, mocks, tx };
}

function mockFetchOk(contentLength: number): ReturnType<typeof vi.fn> {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2]));
      controller.close();
    },
  });
  return vi.fn(async () => ({
    ok: true,
    body,
    headers: new Map([['content-length', String(contentLength)]]) as unknown as Headers,
    status: 200,
  }));
}

const SAVE_URL = 'https://nodus.by/cache/files/data/xxx/output.xlsx?md5=abc&expires=999';

describe('OfficeCallbackService (#138)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('status 2 без url — подтверждение без версии', async () => {
    const h = makeHarness(makeFile());
    await h.service.handle(FILE_ID, { status: 2, key: `${FILE_ID}:v1` });
    expect(h.mocks.put).not.toHaveBeenCalled();
    expect(h.mocks.saveVersion).not.toHaveBeenCalled();
  });

  it('status 4 — нет изменений, ничего не делает', async () => {
    const h = makeHarness(makeFile());
    await h.service.handle(FILE_ID, { status: 4, key: `${FILE_ID}:v1` });
    expect(h.mocks.put).not.toHaveBeenCalled();
  });

  it('status 6 (forcesave): версия v2, объект в хранилище, событие и аудит в транзакции', async () => {
    const fetchMock = mockFetchOk(2);
    vi.stubGlobal('fetch', fetchMock);
    const h = makeHarness(makeFile(1));
    const body: OfficeCallbackBody = {
      status: 6,
      key: `${FILE_ID}:v1`,
      url: SAVE_URL,
      lastsave: '2026-09-28T20:00:00.000Z',
      forcesavetype: 1,
    };
    await h.service.handle(FILE_ID, body);

    // origin переписан на внутренний адрес DS, путь и подпись сохранены
    expect(fetchMock).toHaveBeenCalledWith(
      'http://ds-internal/cache/files/data/xxx/output.xlsx?md5=abc&expires=999',
    );
    expect(h.mocks.put).toHaveBeenCalledWith(
      `files/${FILE_ID}/v2`,
      2,
      expect.any(String),
      expect.anything(),
    );
    expect(h.mocks.saveVersion).toHaveBeenCalledWith(h.tx, {
      fileObjectId: FILE_ID,
      version: 2,
      key: `files/${FILE_ID}/v2`,
      size: 2,
      mime: expect.any(String),
      sourceKey: `${FILE_ID}:v1`,
      sourceLastsave: BigInt(Date.parse('2026-09-28T20:00:00.000Z')),
    });
    expect(h.mocks.emit).toHaveBeenCalledWith(
      h.tx,
      'file.version_created',
      { fileId: FILE_ID, version: 2, size: 2, mime: expect.any(String) },
      expect.anything(),
    );
    expect(h.mocks.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'files.office_save', entityId: FILE_ID }),
    );
  });

  it('повторная доставка того же сохранения (тот же lastsave) не плодит версию', async () => {
    const fetchMock = mockFetchOk(2);
    vi.stubGlobal('fetch', fetchMock);
    const h = makeHarness(makeFile(2), [
      makeVersionRow(2, `${FILE_ID}:v1`, '2026-09-28T20:00:00.000Z'),
    ]);
    await h.service.handle(FILE_ID, {
      status: 2,
      key: `${FILE_ID}:v1`,
      url: SAVE_URL,
      lastsave: '2026-09-28T20:00:00.000Z',
    });
    expect(h.mocks.put).not.toHaveBeenCalled();
    expect(h.mocks.saveVersion).not.toHaveBeenCalled();
  });

  it('более поздний lastsave того же ключа — новая версия (реальные изменения)', async () => {
    const fetchMock = mockFetchOk(2);
    vi.stubGlobal('fetch', fetchMock);
    const h = makeHarness(makeFile(2), [
      makeVersionRow(2, `${FILE_ID}:v1`, '2026-09-28T20:00:00.000Z'),
    ]);
    await h.service.handle(FILE_ID, {
      status: 2,
      key: `${FILE_ID}:v1`,
      url: SAVE_URL,
      lastsave: '2026-09-28T20:05:00.000Z',
    });
    expect(h.mocks.saveVersion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ version: 3 }),
    );
  });

  it('колбэк устаревшего ключа подтверждается без сохранения', async () => {
    const h = makeHarness(makeFile(2));
    await h.service.handle(FILE_ID, { status: 2, key: `${FILE_ID}:v1`, url: SAVE_URL });
    expect(h.mocks.put).not.toHaveBeenCalled();
  });

  it('файл удалён — подтверждение без ошибки (DS завершает сессию)', async () => {
    const h = makeHarness(null);
    await expect(
      h.service.handle(FILE_ID, { status: 2, key: `${FILE_ID}:v1`, url: SAVE_URL }),
    ).resolves.toBeUndefined();
  });

  it('несовпадение размера — объект удалён, ошибка наружу (DS повторит)', async () => {
    vi.stubGlobal('fetch', mockFetchOk(999));
    const h = makeHarness(makeFile(1));
    await expect(
      h.service.handle(FILE_ID, {
        status: 2,
        key: `${FILE_ID}:v1`,
        url: SAVE_URL,
        lastsave: '2026-09-28T20:00:00.000Z',
      }),
    ).rejects.toThrow(/size mismatch/i);
    expect(h.mocks.remove).toHaveBeenCalledWith([`files/${FILE_ID}/v2`]);
    expect(h.mocks.saveVersion).not.toHaveBeenCalled();
  });
});
