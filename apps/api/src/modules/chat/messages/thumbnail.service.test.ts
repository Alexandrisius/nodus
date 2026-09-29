import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { PinoLogger } from 'nestjs-pino';

import type { FileStorage } from '../../../core/ports/file-storage.port.js';
import { AttachmentsRepository, type AttachmentRow } from './attachments.repository.js';
import { ThumbnailService } from './thumbnail.service.js';

const OWNER = '00000000-0000-0000-0000-000000000001';
const FILE_ID = '00000000-0000-4000-8000-00000000000f';
const THUMB_ID = '00000000-0000-4000-8000-00000000000e';

const attachment = (overrides: Partial<AttachmentRow> = {}): AttachmentRow => ({
  id: '00000000-0000-4000-8000-0000000000a1',
  fileId: FILE_ID,
  ownerId: OWNER,
  name: 'фото.png',
  size: 10_000,
  mime: 'image/png',
  kind: 'image',
  width: 1200,
  height: 600,
  thumbFileId: null,
  ...overrides,
});

async function fixturePng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 40, b: 90 } },
  })
    .png()
    .toBuffer();
}

interface SavedDerivative {
  mime: string;
  name: string;
  size: number;
  ownerId: string;
  derivedFrom?: string;
}

interface Harness {
  service: ThumbnailService;
  storage: FileStorage;
  saved: { input: SavedDerivative | null; buffer: Buffer };
  marked: { thumbFileId: string; width: number; height: number }[];
}

function makeHarness(original: Buffer, attachmentRow: AttachmentRow | null): Harness {
  const saved: Harness['saved'] = { input: null, buffer: Buffer.alloc(0) };
  const storage: FileStorage = {
    save: vi.fn(async (input, content) => {
      saved.input = input;
      const chunks: Buffer[] = [];
      for await (const chunk of content) chunks.push(chunk as Buffer);
      saved.buffer = Buffer.concat(chunks);
      return { fileId: THUMB_ID };
    }),
    get: vi.fn(async () => ({
      stream: Readable.from(original),
      mime: 'image/png',
      name: 'фото.png',
      size: original.byteLength,
    })),
    remove: vi.fn(async () => undefined),
  };
  const marked: Harness['marked'] = [];
  const repo = {
    findAnyById: vi.fn(async () => attachmentRow),
    markThumbnail: vi.fn(
      async (_id: string, data: { thumbFileId: string; width: number; height: number }) => {
        marked.push(data);
      },
    ),
  } as unknown as AttachmentsRepository;
  const service = new ThumbnailService(storage, repo, {
    setContext: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  } as unknown as PinoLogger);
  return { service, storage, saved, marked };
}

describe('ThumbnailService — серверные превью (#150)', () => {
  it('генерирует WebP ≤800 по большей стороне, пишет дериват и авторитетные размеры', async () => {
    const png = await fixturePng(1200, 600);
    const h = makeHarness(png, attachment());
    await h.service.generateFor('att-1');

    expect(h.saved.input).toMatchObject({
      mime: 'image/webp',
      size: h.saved.buffer.byteLength,
      derivedFrom: FILE_ID,
      ownerId: OWNER,
    });
    const meta = await sharp(h.saved.buffer).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(400);
    expect(h.marked).toEqual([{ thumbFileId: THUMB_ID, width: 1200, height: 600 }]);
  });

  it('мелкое изображение не увеличивается (withoutEnlargement)', async () => {
    const png = await fixturePng(300, 200);
    const h = makeHarness(png, attachment({ width: 300, height: 200 }));
    await h.service.generateFor('att-1');
    const meta = await sharp(h.saved.buffer).metadata();
    expect(meta.width).toBe(300);
    expect(meta.height).toBe(200);
    expect(h.marked).toEqual([{ thumbFileId: THUMB_ID, width: 300, height: 200 }]);
  });

  it('EXIF-ориентация ≥5 меняет width/height местами (авторитетные габариты)', async () => {
    // Физически 800×400 + orientation 6 (поворот 90°) → видим 400×800.
    const jpeg = await sharp({
      create: { width: 800, height: 400, channels: 3, background: { r: 10, g: 120, b: 30 } },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const h = makeHarness(jpeg, attachment({ mime: 'image/jpeg' }));
    await h.service.generateFor('att-1');
    expect(h.marked).toEqual([{ thumbFileId: THUMB_ID, width: 400, height: 800 }]);
  });

  it('идемпотентно: готовое превью — no-op без чтения хранилища', async () => {
    const png = await fixturePng(50, 50);
    const h = makeHarness(png, attachment({ thumbFileId: THUMB_ID }));
    await h.service.generateFor('att-1');
    expect(h.storage.get).not.toHaveBeenCalled();
    expect(h.marked).toEqual([]);
  });

  it('не-изображение и отсутствующая строка — no-op', async () => {
    const png = await fixturePng(50, 50);
    const file = makeHarness(png, attachment({ kind: 'file' }));
    await file.service.generateFor('att-1');
    expect(file.storage.get).not.toHaveBeenCalled();

    const none = makeHarness(png, null);
    await none.service.generateFor('att-1');
    expect(none.storage.get).not.toHaveBeenCalled();
  });

  it('недекодируемый буфер — тихий отказ без записи', async () => {
    const h = makeHarness(Buffer.from('not an image at all'), attachment());
    await h.service.generateFor('att-1');
    expect(h.marked).toEqual([]);
  });
});
