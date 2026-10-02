import { Readable } from 'node:stream';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { PinoLogger } from 'nestjs-pino';

import { AuditRepository } from '../../../core/audit/audit.repository.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { FilesRepository, type FileObjectRow, type FileVersionRow } from '../files.repository.js';
import { MinioStorageDriver } from '../storage/minio-storage.driver.js';
import type { OfficeConfig } from './office.config.js';
import { OfficeCallbackService, type OfficeCallbackBody } from './office-callback.service.js';
import { OfficeTokenService } from './office-token.service.js';

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
    derivedFrom: null,
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
  findVersion: ReturnType<typeof vi.fn>;
  saveVersion: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
  append: ReturnType<typeof vi.fn>;
  enqueuePdf: ReturnType<typeof vi.fn>;
  warnLog: ReturnType<typeof vi.fn>;
}

interface Harness {
  service: OfficeCallbackService;
  tokens: OfficeTokenService;
  mocks: Mocks;
  tx: Record<string, unknown>;
}

function makeHarness(file: FileObjectRow | null, versions: FileVersionRow[] = []): Harness {
  const mocks = {
    findById: vi.fn(async () => file),
    findVersions: vi.fn(async () => versions),
    findVersion: vi.fn(async () => null),
    saveVersion: vi.fn(async (_tx: unknown, input: unknown) => input),
    // put ПОТРЕБЛЯЕТ стрим (как реальный putObject): без чтения md5-final
    // не наступит и сверка подписи не отработает.
    put: vi.fn(async (_key: string, _size: number, _mime: string, content: Readable) => {
      let bytes = 0;
      for await (const chunk of content) bytes += (chunk as Buffer).length;
      return { etag: 'e', bytes };
    }),
    remove: vi.fn(async () => undefined),
    emit: vi.fn(async () => undefined),
    append: vi.fn(async () => undefined),
    enqueuePdf: vi.fn(async () => undefined),
    warnLog: vi.fn(),
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
  const tokens = new OfficeTokenService(config);
  const service = new OfficeCallbackService(
    repo,
    driver,
    txRunner,
    eventBus,
    audit,
    tokens,
    { enqueuePdf: mocks.enqueuePdf } as never,
    config,
    {
      setContext: vi.fn(),
      info: vi.fn(),
      warn: mocks.warnLog,
    } as unknown as PinoLogger,
  );
  return { service, tokens, mocks, tx };
}

function mockFetchOk(contentLength: number | null): ReturnType<typeof vi.fn> {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2]));
      controller.close();
    },
  });
  const headers = new Map<string, string>();
  if (contentLength !== null) headers.set('content-length', String(contentLength));
  return vi.fn(async () => ({
    ok: true,
    body,
    headers: headers as unknown as Headers,
    status: 200,
  }));
}

const SAVE_URL = 'https://nodus.by/cache/files/data/xxx/output.xlsx?expires=999';
/** md5 от тестового тела [1,2] в base64url — как подписывает DS. */
const SAVE_URL_MD5 =
  'https://nodus.by/cache/files/data/xxx/output.xlsx?md5=DLmI0EKn8o3V_itVs_Wseg&expires=999';

describe('OfficeCallbackService (#138)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('status 2 без url — подтверждение без версии', async () => {
    const h = makeHarness(makeFile());
    await h.service.handle(FILE_ID, { status: 2, key: `${FILE_ID}.v1` });
    expect(h.mocks.put).not.toHaveBeenCalled();
    expect(h.mocks.saveVersion).not.toHaveBeenCalled();
  });

  it('status 4 — нет изменений, ничего не делает', async () => {
    const h = makeHarness(makeFile());
    await h.service.handle(FILE_ID, { status: 4, key: `${FILE_ID}.v1` });
    expect(h.mocks.put).not.toHaveBeenCalled();
  });

  it('status 6 (forcesave): версия v2, объект в хранилище, событие и аудит в транзакции', async () => {
    const fetchMock = mockFetchOk(2);
    vi.stubGlobal('fetch', fetchMock);
    const h = makeHarness(makeFile(1));
    const body: OfficeCallbackBody = {
      status: 6,
      key: `${FILE_ID}.v1`,
      url: SAVE_URL,
      lastsave: '2026-09-28T20:00:00.000Z',
      forcesavetype: 1,
    };
    await h.service.handle(FILE_ID, body);

    // origin переписан на внутренний адрес DS, путь и подпись сохранены
    expect(fetchMock).toHaveBeenCalledWith(
      'http://ds-internal/cache/files/data/xxx/output.xlsx?expires=999',
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
      sourceKey: `${FILE_ID}.v1`,
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
      makeVersionRow(2, `${FILE_ID}.v1`, '2026-09-28T20:00:00.000Z'),
    ]);
    await h.service.handle(FILE_ID, {
      status: 2,
      key: `${FILE_ID}.v1`,
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
      makeVersionRow(2, `${FILE_ID}.v1`, '2026-09-28T20:00:00.000Z'),
    ]);
    await h.service.handle(FILE_ID, {
      status: 2,
      key: `${FILE_ID}.v1`,
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
    await h.service.handle(FILE_ID, { status: 2, key: `${FILE_ID}.v1`, url: SAVE_URL });
    expect(h.mocks.put).not.toHaveBeenCalled();
  });

  it('файл удалён — подтверждение без ошибки (DS завершает сессию)', async () => {
    const h = makeHarness(null);
    await expect(
      h.service.handle(FILE_ID, { status: 2, key: `${FILE_ID}.v1`, url: SAVE_URL }),
    ).resolves.toBeUndefined();
  });

  it('md5-подпись DS расходится с телом — наблюдаемость, версия сохраняется', async () => {
    vi.stubGlobal('fetch', mockFetchOk(2));
    const h = makeHarness(makeFile(1));
    await h.service.handle(FILE_ID, {
      status: 2,
      key: `${FILE_ID}.v1`,
      url: 'https://nodus.by/cache/files/data/xxx/output.xlsx?md5=WRONG&expires=999',
      lastsave: '2026-09-28T20:00:00.000Z',
    });
    expect(h.mocks.saveVersion).toHaveBeenCalledWith(
      h.tx,
      expect.objectContaining({ version: 2, size: 2 }),
    );
  });

  it('md5 совпал — версия сохранена (#182: сверка целостности байтов)', async () => {
    vi.stubGlobal('fetch', mockFetchOk(2));
    const h = makeHarness(makeFile(1));
    await h.service.handle(FILE_ID, {
      status: 6,
      key: `${FILE_ID}.v1`,
      url: SAVE_URL_MD5,
      lastsave: '2026-09-28T20:00:00.000Z',
    });
    expect(h.mocks.saveVersion).toHaveBeenCalledWith(h.tx, expect.objectContaining({ version: 2 }));
  });

  it('нет content-length (chunked) — сохраняет по фактическим байтам', async () => {
    vi.stubGlobal('fetch', mockFetchOk(null));
    const h = makeHarness(makeFile(1));
    await h.service.handle(FILE_ID, {
      status: 6,
      key: `${FILE_ID}.v1`,
      url: SAVE_URL,
      lastsave: '2026-09-28T20:00:00.000Z',
    });
    expect(h.mocks.put).toHaveBeenCalledWith(
      `files/${FILE_ID}/v2`,
      2,
      expect.any(String),
      expect.anything(),
    );
    expect(h.mocks.saveVersion).toHaveBeenCalledWith(h.tx, expect.objectContaining({ size: 2 }));
  });

  it('declared ≠ фактических — предупреждение, версия сохраняется', async () => {
    vi.stubGlobal('fetch', mockFetchOk(999));
    const h = makeHarness(makeFile(1));
    await h.service.handle(FILE_ID, {
      status: 6,
      key: `${FILE_ID}.v1`,
      url: SAVE_URL,
      lastsave: '2026-09-28T20:00:00.000Z',
    });
    expect(h.mocks.saveVersion).toHaveBeenCalledWith(h.tx, expect.objectContaining({ size: 2 }));
    // расхождение зафиксировано наблюдаемостью, не фатально
    expect(h.mocks.warnLog).toHaveBeenCalledWith(
      expect.objectContaining({ declared: 999 }),
      expect.stringContaining('content-length'),
    );
  });

  it('тело сверх потолка скачивания — бросок (DS повторит), без put', async () => {
    // Один чанк над потолком (128 МБ): аллокация живёт секунды, память vitest тянет.
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(129 * 1024 * 1024));
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        body,
        headers: new Map() as unknown as Headers,
        status: 200,
      })),
    );
    const h = makeHarness(makeFile(1));
    await expect(
      h.service.handle(FILE_ID, {
        status: 6,
        key: `${FILE_ID}.v1`,
        url: SAVE_URL,
        lastsave: '2026-09-28T20:00:00.000Z',
      }),
    ).rejects.toThrow(/cap/i);
    expect(h.mocks.put).not.toHaveBeenCalled();
  });

  it('дубль версии по уникальному ключу (ретрай без lastsave) — дедуп, без ошибки', async () => {
    vi.stubGlobal('fetch', mockFetchOk(2));
    const h = makeHarness(makeFile(1));
    h.mocks.findVersion.mockResolvedValue(
      makeVersionRow(2, `${FILE_ID}.v1`, '2026-09-28T20:00:00.000Z'),
    );
    await h.service.handle(FILE_ID, {
      status: 2,
      key: `${FILE_ID}.v1`,
      url: SAVE_URL,
      // lastsave отсутствует: lastsave-дедуп пропущен, ловит unique-дедуп
    });
    expect(h.mocks.put).not.toHaveBeenCalled();
    expect(h.mocks.saveVersion).not.toHaveBeenCalled();
  });

  describe('verifySender', () => {
    const body: OfficeCallbackBody = { status: 2, key: `${FILE_ID}.v1` };

    it('нет токена вовсе — 401', async () => {
      const h = makeHarness(makeFile());
      await expect(h.service.verifySender(body, undefined)).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
      });
    });

    it('мусорный Bearer — 401', async () => {
      const h = makeHarness(makeFile());
      await expect(h.service.verifySender(body, 'Bearer garbage')).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
      });
    });

    it('payload.key чужого документа — 401 (токен не привязан к телу)', async () => {
      const h = makeHarness(makeFile());
      const token = await h.tokens.sign({ payload: { key: 'another-file.v1' } });
      await expect(h.service.verifySender(body, `Bearer ${token}`)).rejects.toMatchObject({
        code: 'UNAUTHENTICATED',
      });
    });

    it('валидный Bearer с тем же ключом — пропускает', async () => {
      const h = makeHarness(makeFile());
      const token = await h.tokens.sign({ payload: { ...body } });
      await expect(h.service.verifySender(body, `Bearer ${token}`)).resolves.toBeUndefined();
    });

    it('токен в теле (body.token) без заголовка — пропускает', async () => {
      const h = makeHarness(makeFile());
      const token = await h.tokens.sign({ payload: { ...body } });
      await expect(h.service.verifySender({ ...body, token }, undefined)).resolves.toBeUndefined();
    });
  });
});
