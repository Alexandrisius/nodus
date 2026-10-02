import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';

import { DerivativesService } from './derivatives.service.js';
import type { DerivativesConfig } from './derivatives.config.js';
import type { DerivativesRepository } from './derivatives.repository.js';
import type { FileObjectRow } from '../files.repository.js';
import type { MinioStorageDriver } from '../storage/minio-storage.driver.js';

const FILE_ID = '00000000-0000-0000-0000-0000000000f1';

function makeFile(overrides: Partial<FileObjectRow> = {}): FileObjectRow {
  return {
    id: FILE_ID,
    ownerId: '00000000-0000-0000-0000-000000000001',
    bucket: 'nodus-files',
    key: `files/${FILE_ID}/v1`,
    version: 1,
    name: 'Смета.docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    size: 1024,
    scanStatus: 'pending',
    derivedFrom: null,
    createdAt: new Date(),
    ...overrides,
  };
}

const CONFIG: DerivativesConfig = {
  gotenbergUrl: 'http://gotenberg-test:3000',
  pdfExtensions: ['docx', 'odt', 'rtf'],
};

describe('DerivativesService (#139)', () => {
  const files = { findById: vi.fn() };
  const derivatives = {
    find: vi.fn(),
    ensurePending: vi.fn(),
    markReady: vi.fn(),
    markFailed: vi.fn(async () => undefined),
  };
  const driver = { get: vi.fn(), put: vi.fn(), remove: vi.fn(async () => undefined) };
  const logger = { setContext: vi.fn(), info: vi.fn(), warn: vi.fn() };
  let service: DerivativesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DerivativesService(
      files as never,
      derivatives as never as DerivativesRepository,
      driver as never as MinioStorageDriver,
      CONFIG,
      logger as never,
    );
  });

  it('готовая производная — no-op (идемпотентность job)', async () => {
    derivatives.find.mockResolvedValue({ status: 'ready', key: `files/${FILE_ID}/v1/deriv.pdf` });
    await service.generatePdf(FILE_ID, 1);
    expect(driver.get).not.toHaveBeenCalled();
  });

  it('docx → конвертация, put с MIME pdf, ready + ключ версии', async () => {
    files.findById.mockResolvedValue(makeFile());
    derivatives.find.mockResolvedValue(null);
    driver.get.mockResolvedValue(Readable.from([Buffer.from('docx-bytes')]));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(Buffer.from('%PDF-fake'), { status: 200 })),
    );
    driver.put.mockResolvedValue({ etag: 'e', bytes: 9 });

    await service.generatePdf(FILE_ID, 1);

    expect(fetch).toHaveBeenCalledWith(
      'http://gotenberg-test:3000/forms/libreoffice/convert',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(driver.put).toHaveBeenCalledWith(
      `files/${FILE_ID}/v1/deriv.pdf`,
      9,
      'application/pdf',
      expect.anything(),
    );
    expect(derivatives.markReady).toHaveBeenCalledWith({
      fileObjectId: FILE_ID,
      version: 1,
      kind: 'pdf',
      key: `files/${FILE_ID}/v1/deriv.pdf`,
      size: 9,
    });
    vi.unstubAllGlobals();
  });

  it('xlsx не конвертируется (спека: таблицы PDF-простынёй — антипаттерн)', async () => {
    files.findById.mockResolvedValue(makeFile({ name: 'Ведомость.xlsx' }));
    await service.generatePdf(FILE_ID, 1);
    expect(driver.get).not.toHaveBeenCalled();
  });

  it('новая версия — производная под ключом этой версии (ключ генерации)', async () => {
    files.findById.mockResolvedValue(makeFile({ version: 2, key: `files/${FILE_ID}/v2` }));
    derivatives.find.mockResolvedValue(null);
    driver.get.mockResolvedValue(Readable.from([Buffer.from('v2')]));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(Buffer.from('%PDF-2'), { status: 200 })),
    );
    driver.put.mockResolvedValue({ etag: 'e', bytes: 6 });
    await service.generatePdf(FILE_ID, 2);
    expect(driver.put).toHaveBeenCalledWith(
      `files/${FILE_ID}/v2/deriv.pdf`,
      6,
      'application/pdf',
      expect.anything(),
    );
    vi.unstubAllGlobals();
  });

  it('markFailed фиксирует причину после исчерпания ретраев (наблюдаемость)', async () => {
    await service.markFailed(FILE_ID, 1, new Error('boom'));
    expect(derivatives.markFailed).toHaveBeenCalledWith(
      { fileObjectId: FILE_ID, version: 1, kind: 'pdf' },
      'Error: boom',
    );
  });

  it('infected — карантин уважается, конвертации нет', async () => {
    files.findById.mockResolvedValue(makeFile({ scanStatus: 'infected' }));
    await service.generatePdf(FILE_ID, 1);
    expect(driver.get).not.toHaveBeenCalled();
  });

  it('Gotenberg недоступен (500) — бросок (ретраи очереди), без markReady', async () => {
    files.findById.mockResolvedValue(makeFile());
    derivatives.find.mockResolvedValue(null);
    driver.get.mockResolvedValue(Readable.from([Buffer.from('x')]));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 500 })),
    );
    await expect(service.generatePdf(FILE_ID, 1)).rejects.toThrow(/Gotenberg convert failed/);
    expect(derivatives.markReady).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('GOTENBERG_URL пуст — конвейер выключен, тихий no-op', async () => {
    const off = new DerivativesService(
      files as never,
      derivatives as never,
      driver as never,
      { ...CONFIG, gotenbergUrl: null },
      logger as never,
    );
    await off.generatePdf(FILE_ID, 1);
    expect(files.findById).not.toHaveBeenCalled();
  });
});
