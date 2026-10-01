import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SignedUrlService } from '../../../core/crypto/signed-url.service.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import type { FileStorage } from '../../../core/ports/file-storage.port.js';
import type { StickerPackRow, StickerRow, StickersRepository } from './stickers.repository.js';
import { PERSONAL_PACKS_MAX, STICKERS_PER_PACK_MAX, StickersService } from './stickers.service.js';

const ME = '00000000-0000-0000-0000-000000000001';
const OTHER = '00000000-0000-0000-0000-000000000002';
const PACK_ID = '00000000-0000-0000-0000-0000000000aa';
const FILE_ID = '00000000-0000-0000-0000-0000000000ff';
const TX = 'tx-handle';

function pack(overrides: Partial<StickerPackRow> = {}): StickerPackRow {
  return {
    id: PACK_ID,
    title: 'Мемы',
    scope: 'personal',
    ownerId: ME,
    createdBy: ME,
    createdAt: new Date('2026-09-30T00:00:00Z'),
    ...overrides,
  };
}

function sticker(overrides: Partial<StickerRow> = {}): StickerRow {
  return {
    id: '00000000-0000-0000-0000-0000000000b1',
    packId: PACK_ID,
    fileId: FILE_ID,
    emojis: ['🔥'],
    width: 512,
    height: 512,
    mime: 'image/png',
    size: 2048,
    sortOrder: 0,
    ...overrides,
  };
}

/** Минимальный валидный PNG (8-байт сигнатура + хвост). */
function pngBytes(size = 64): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(Math.max(0, size - 8)),
  ]);
}

function makeService(repoOverrides: Partial<Record<string, unknown>> = {}): {
  service: StickersService;
  repo: StickersRepository;
  storage: FileStorage;
  eventBus: { emit: ReturnType<typeof vi.fn> };
} {
  const repo = {
    listVisible: vi.fn(async () => ({ packs: [], installedIds: new Set() })),
    findPack: vi.fn(async () => null),
    findPackAccessible: vi.fn(async () => null),
    countPersonalPacks: vi.fn(async () => 0),
    createPack: vi.fn(async (row: StickerPackRow): Promise<StickerPackRow> => row),
    renamePack: vi.fn(async () => undefined),
    softDeletePack: vi.fn(async () => undefined),
    countStickers: vi.fn(async () => 0),
    insertSticker: vi.fn(async (row: StickerRow): Promise<StickerRow> => row),
    findSticker: vi.fn(async () => null),
    deleteSticker: vi.fn(async () => undefined),
    install: vi.fn(async () => true),
    uninstall: vi.fn(async () => true),
    insertAttachmentForMessage: vi.fn(),
    ...repoOverrides,
  } as unknown as StickersRepository;
  const storage: FileStorage = {
    save: vi.fn(async () => ({ fileId: FILE_ID })),
    get: vi.fn(async () => null),
    remove: vi.fn(async () => undefined),
  };
  const eventBus = { emit: vi.fn(async () => undefined) };
  const txRunner = {
    run: vi.fn((cb: (tx: unknown) => unknown) => cb(TX)),
  } as unknown as TransactionRunner;
  const service = new StickersService(
    repo,
    txRunner,
    eventBus as unknown as EventBus,
    new SignedUrlService({ STORAGE_URL_SECRET: 'test-secret-32-chars-aaaaaaaaaaaa' }),
    storage,
  );
  return { service, repo, storage, eventBus: eventBus as { emit: ReturnType<typeof vi.fn> } };
}

describe('StickersService (#143)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('create', () => {
    it('личный пак создаёт любой сотрудник', async () => {
      const { service, repo } = makeService();
      const dto = await service.create(ME, false, { title: 'Мемы', scope: 'personal' });
      expect(dto).toMatchObject({ title: 'Мемы', scope: 'personal', owned: true });
      expect(repo.createPack).toHaveBeenCalledOnce();
    });

    it('корпоративный без права sticker.manage — FORBIDDEN (I8)', async () => {
      const { service } = makeService();
      await expect(
        service.create(ME, false, { title: 'Nodus', scope: 'corporate' }),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    it('корпоративный с правом — создаётся, ownerId null', async () => {
      const { service, repo } = makeService();
      await service.create(ME, true, { title: 'Nodus', scope: 'corporate' });
      expect(repo.createPack).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'corporate', ownerId: null }),
      );
    });

    it(`лимит ${PERSONAL_PACKS_MAX} личных паков — VALIDATION_FAILED`, async () => {
      const { service } = makeService({
        countPersonalPacks: vi.fn(async () => PERSONAL_PACKS_MAX),
      });
      await expect(
        service.create(ME, false, { title: 'Лишний', scope: 'personal' }),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });
  });

  describe('rename / delete (права)', () => {
    it('владелец переименовывает; событие UPDATED в той же транзакции', async () => {
      const { service, eventBus } = makeService({
        findPack: vi.fn(async () => ({ ...pack(), stickers: [] })),
      });
      const dto = await service.rename(ME, false, PACK_ID, 'Новое имя');
      expect(dto.title).toBe('Новое имя');
      expect(eventBus.emit).toHaveBeenCalledWith(
        TX,
        'chat.sticker_pack_updated',
        expect.objectContaining({ packId: PACK_ID, title: 'Новое имя' }),
        expect.anything(),
      );
    });

    it('чужой личный пак — FORBIDDEN даже у другого админа без права', async () => {
      const { service } = makeService({
        findPack: vi.fn(async () => ({ ...pack({ ownerId: OTHER }), stickers: [] })),
      });
      await expect(service.rename(ME, false, PACK_ID, 'Хак')).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('корпоративный пак переименовывает носитель права, не владелец-строки', async () => {
      const { service } = makeService({
        findPack: vi.fn(async () => ({
          ...pack({ scope: 'corporate', ownerId: null }),
          stickers: [],
        })),
      });
      await expect(service.rename(ME, true, PACK_ID, 'Корп')).resolves.toBeTruthy();
    });

    it('удаление — soft (deletedAt), файлы не трогаем', async () => {
      const { service, repo, storage } = makeService({
        findPack: vi.fn(async () => ({ ...pack(), stickers: [sticker()] })),
      });
      await service.delete(ME, false, PACK_ID);
      expect(repo.softDeletePack).toHaveBeenCalledOnce();
      expect(storage.remove).not.toHaveBeenCalled();
    });
  });

  describe('uploadSticker (magic bytes + лимиты)', () => {
    it('валидный PNG сохраняется, mime выводится из байтов, событие STICKER_ADDED', async () => {
      // findPack после вставки возвращает пак с новым стикером (в проде —
      // перечитывание в транзакции).
      let inserted: StickerRow | null = null;
      const insertSticker = vi.fn(async (row: StickerRow): Promise<StickerRow> => {
        inserted = row;
        return row;
      });
      const { service, repo, storage, eventBus } = makeService({
        findPack: vi.fn(async () => ({ ...pack(), stickers: inserted ? [inserted] : [] })),
        countStickers: vi.fn(async () => 0),
        insertSticker,
      });
      const dto = await service.uploadSticker(
        ME,
        false,
        PACK_ID,
        { emojis: ['🔥'], size: 64, width: 512, height: 512 },
        Readable.from([pngBytes()]),
      );
      expect(storage.save).toHaveBeenCalledWith(
        expect.objectContaining({ mime: 'image/png', size: 64 }),
        expect.anything(),
      );
      expect(repo.insertSticker).toHaveBeenCalledWith(
        expect.objectContaining({ mime: 'image/png' }),
      );
      expect(eventBus.emit).toHaveBeenCalledWith(
        TX,
        'chat.sticker_added',
        expect.objectContaining({ packId: PACK_ID }),
        expect.anything(),
      );
      expect(dto.stickers).toHaveLength(1);
    });

    it('подделка mime: GIF-байты с заявленным image/png — CHAT_STICKER_INVALID', async () => {
      const { service } = makeService({
        findPack: vi.fn(async () => ({ ...pack(), stickers: [] })),
      });
      const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(60)]);
      await expect(
        service.uploadSticker(
          ME,
          false,
          PACK_ID,
          { emojis: ['🔥'], size: gif.length },
          Readable.from([gif]),
        ),
      ).rejects.toMatchObject({ code: 'CHAT_STICKER_INVALID', httpStatus: undefined });
    });

    it('файл больше потолка — обрыв чтения и 413 (заявленный size не спасает)', async () => {
      const { service } = makeService({
        findPack: vi.fn(async () => ({ ...pack(), stickers: [] })),
      });
      // Заявлено 1КБ, фактически 600КБ — потолок превышен по байтам.
      const big = Buffer.concat([pngBytes(0), Buffer.alloc(600 * 1024)]);
      await expect(
        service.uploadSticker(
          ME,
          false,
          PACK_ID,
          { emojis: ['🔥'], size: 1024 },
          Readable.from([big]),
        ),
      ).rejects.toMatchObject({ httpStatus: 413 });
    });

    it(`пак полон (${STICKERS_PER_PACK_MAX}) — VALIDATION_FAILED`, async () => {
      const { service } = makeService({
        findPack: vi.fn(async () => ({ ...pack(), stickers: [] })),
        countStickers: vi.fn(async () => STICKERS_PER_PACK_MAX),
      });
      await expect(
        service.uploadSticker(
          ME,
          false,
          PACK_ID,
          { emojis: ['🔥'], size: 64 },
          Readable.from([pngBytes()]),
        ),
      ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('загрузка в чужой пак — FORBIDDEN', async () => {
      const { service, storage } = makeService({
        findPack: vi.fn(async () => ({ ...pack({ ownerId: OTHER }), stickers: [] })),
      });
      await expect(
        service.uploadSticker(
          ME,
          false,
          PACK_ID,
          { emojis: ['🔥'], size: 64 },
          Readable.from([pngBytes()]),
        ),
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(storage.save).not.toHaveBeenCalled();
    });
  });

  describe('removeSticker (права + событие)', () => {
    it('владелец убирает стикер: строка удалена, файл НЕ тронут, событие STICKER_REMOVED', async () => {
      const hit = { ...sticker(), pack: pack() };
      // Мок-состояние: после deleteSticker перечитанный пак без стикера
      // (в проде — перечитывание в транзакции).
      let deleted = false;
      const { service, repo, storage, eventBus } = makeService({
        findSticker: vi.fn(async () => hit),
        findPack: vi.fn(async () => ({ ...pack(), stickers: deleted ? [] : [hit] })),
        deleteSticker: vi.fn(async () => {
          deleted = true;
        }),
      });
      const dto = await service.removeSticker(ME, false, hit.id);
      expect(repo.deleteSticker).toHaveBeenCalledWith(hit.id);
      // Файл остаётся: отправленные сообщения рендерятся по file_id+снапшоту.
      expect(storage.remove).not.toHaveBeenCalled();
      expect(eventBus.emit).toHaveBeenCalledWith(
        TX,
        'chat.sticker_removed',
        { packId: PACK_ID, stickerId: hit.id, actorId: ME },
        expect.anything(),
      );
      expect(dto.stickers).toHaveLength(0);
    });

    it('не-владелец чужого личного пака — FORBIDDEN, без удаления', async () => {
      const hit = { ...sticker(), pack: pack({ ownerId: OTHER }) };
      const { service, repo } = makeService({ findSticker: vi.fn(async () => hit) });
      await expect(service.removeSticker(ME, false, hit.id)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      expect(repo.deleteSticker).not.toHaveBeenCalled();
    });

    it('несуществующий стикер — NOT_FOUND', async () => {
      const { service } = makeService({ findSticker: vi.fn(async () => null) });
      await expect(service.removeSticker(ME, false, 'nope')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  describe('install / uninstall', () => {
    it('установка идемпотентна: повтор тих, событие только при вставке', async () => {
      const { service, eventBus } = makeService({
        findPack: vi.fn(async () => ({ ...pack({ ownerId: OTHER }), stickers: [] })),
        install: vi.fn(async () => false),
      });
      const dto = await service.install(ME, PACK_ID);
      expect(dto.installed).toBe(true); // ответ отражает итоговое состояние
      expect(eventBus.emit).not.toHaveBeenCalled();
    });

    it('первая установка — событие INSTALLED', async () => {
      const { service, eventBus } = makeService({
        findPack: vi.fn(async () => ({ ...pack({ ownerId: OTHER }), stickers: [] })),
        install: vi.fn(async () => true),
      });
      await service.install(ME, PACK_ID);
      expect(eventBus.emit).toHaveBeenCalledWith(
        TX,
        'chat.sticker_pack_installed',
        { packId: PACK_ID, userId: ME },
        expect.anything(),
      );
    });

    it('удалённый пак не устанавливается — NOT_FOUND', async () => {
      const { service } = makeService({ findPack: vi.fn(async () => null) });
      await expect(service.install(ME, PACK_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('listVisible / DTO', () => {
    it('корпоративные installed=false (смысла нет), личние — по установке', async () => {
      const corporate = pack({ id: 'c', scope: 'corporate', ownerId: null });
      const mine = pack({ id: 'm' });
      const { service } = makeService({
        listVisible: vi.fn(async () => ({
          packs: [
            { ...corporate, stickers: [] },
            { ...mine, stickers: [sticker({ packId: 'm' })] },
          ],
          installedIds: new Set(['m', 'c']),
        })),
      });
      const list = await service.list(ME);
      const byId = new Map(list.items.map((p) => [p.id, p]));
      expect(byId.get('c')).toMatchObject({ installed: false, owned: false });
      expect(byId.get('m')).toMatchObject({ installed: true, owned: true });
      expect(byId.get('m')?.stickers[0]).toMatchObject({ mime: 'image/png', packId: 'm' });
    });
  });
});
