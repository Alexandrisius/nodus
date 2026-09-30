import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  CHAT_EVENTS,
  ErrorCode,
  type CreateStickerPackBody,
  type StickerPack,
  type StickerPackList,
  type StickerPackScope,
} from '@nodus/contracts';

import { SignedUrlService } from '../../../core/crypto/signed-url.service.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { FILE_STORAGE, type FileStorage } from '../../../core/ports/file-storage.port.js';
import { STICKER_STATIC_MAX_BYTES, validateStickerBytes } from './sticker-file-rules.js';
import { StickersRepository, type StickerPackRow, type StickerRow } from './stickers.repository.js';

/** Лимиты (спека #143, лимиты Telegram/Битрикса): 120 стикеров в паке,
 *  20 личных паков у сотрудника; корпоративных — без лимита (создаёт админ). */
export const STICKERS_PER_PACK_MAX = 120;
export const PERSONAL_PACKS_MAX = 20;

/** Управление паком: владелец личного; корпоративный — право sticker.manage
 *  (I8: финальное решение на сервере, UI лишь прячет). Право приходит из JWT
 *  контроллером — сервис не знает про request-scope. */
function canManagePack(pack: StickerPackRow, userId: string, canManageCorporate: boolean): boolean {
  return pack.ownerId === userId || (pack.scope === 'corporate' && canManageCorporate);
}

/**
 * Стикер-паки (#143): CRUD, загрузка стикеров (magic bytes + лимиты),
 * установка/снятие «себе» (дистрибуция «из чата»). Мутации — в транзакции с
 * outbox-событиями (I9). Стикер-сообщение отправляет messages.service.send
 * (stickerId) — тем же репозиторием; файлы удалённых стикеров/паков НЕ
 * чистим: сообщения рендерятся дальше (снапшот + fileId), объём копеечный.
 */
@Injectable()
export class StickersService {
  constructor(
    private readonly repository: StickersRepository,
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    private readonly signedUrls: SignedUrlService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  async list(userId: string): Promise<StickerPackList> {
    const { packs, installedIds } = await this.repository.listVisible(userId);
    return { items: packs.map((pack) => this.toDto(pack, pack.stickers, userId, installedIds)) };
  }

  /** Деталь пака — окно из чата (пак может быть не в «моих»). installed
   *  реальный: по нему окно рисует футер «Добавить себе»/«Набор добавлен»
   *  и пункт «Отправить в чат» (валидатор Ф2: пустой Set ломал установленные
   *  чужие паки — маскировалось моками). */
  async get(userId: string, packId: string): Promise<StickerPack> {
    const pack = await this.repository.findPack(packId);
    if (!pack) throw DomainException.notFound('Sticker pack not found');
    const installed = await this.repository.isInstalled(userId, packId);
    return this.toDto(pack, pack.stickers, userId, installed ? new Set([packId]) : new Set());
  }

  async create(
    userId: string,
    canManageCorporate: boolean,
    body: CreateStickerPackBody,
  ): Promise<StickerPack> {
    if (body.scope === 'corporate' && !canManageCorporate) {
      throw DomainException.forbidden('Corporate sticker packs require sticker.manage');
    }
    return this.txRunner.run(async (tx) => {
      if (body.scope === 'personal') {
        const owned = await this.repository.countPersonalPacks(userId);
        if (owned >= PERSONAL_PACKS_MAX) {
          throw new DomainException(
            ErrorCode.VALIDATION_FAILED,
            'Personal sticker pack limit reached',
            { max: PERSONAL_PACKS_MAX },
          );
        }
      }
      const pack = await this.repository.createPack({
        id: randomUUID(),
        title: body.title,
        scope: body.scope,
        ownerId: body.scope === 'corporate' ? null : userId,
        createdBy: userId,
      });
      await this.eventBus.emit(
        tx,
        CHAT_EVENTS.STICKER_PACK_CREATED,
        { packId: pack.id, scope: pack.scope, title: pack.title, actorId: userId },
        { actorId: userId, aggregateType: 'sticker_pack', aggregateId: pack.id },
      );
      return this.toDto(pack, [], userId, new Set());
    });
  }

  async rename(
    userId: string,
    canManageCorporate: boolean,
    packId: string,
    title: string,
  ): Promise<StickerPack> {
    return this.txRunner.run(async (tx) => {
      const pack = await this.repository.findPack(packId, tx);
      if (!pack) throw DomainException.notFound('Sticker pack not found');
      if (!canManagePack(pack, userId, canManageCorporate)) {
        throw DomainException.forbidden('Only pack owner or admin can manage this pack');
      }
      await this.repository.renamePack(packId, title);
      await this.eventBus.emit(
        tx,
        CHAT_EVENTS.STICKER_PACK_UPDATED,
        { packId, scope: pack.scope, title, actorId: userId },
        { actorId: userId, aggregateType: 'sticker_pack', aggregateId: packId },
      );
      return this.toDto({ ...pack, title }, pack.stickers, userId, new Set());
    });
  }

  /** Удаление «для всех» (soft): пак исчезает из пикеров; отправленные
   *  сообщения рендерятся дальше по снапшоту вложений; файлы не чистим. */
  async delete(userId: string, canManageCorporate: boolean, packId: string): Promise<void> {
    await this.txRunner.run(async (tx) => {
      const pack = await this.repository.findPack(packId, tx);
      if (!pack) throw DomainException.notFound('Sticker pack not found');
      if (!canManagePack(pack, userId, canManageCorporate)) {
        throw DomainException.forbidden('Only pack owner or admin can manage this pack');
      }
      await this.repository.softDeletePack(packId);
      await this.eventBus.emit(
        tx,
        CHAT_EVENTS.STICKER_PACK_DELETED,
        { packId, scope: pack.scope, title: pack.title, actorId: userId },
        { actorId: userId, aggregateType: 'sticker_pack', aggregateId: packId },
      );
    });
  }

  /** Загрузка стикера (multipart): формат определяется magic bytes (mime
   *  клиента не верим), лимит — по типу. Файл → FILE_STORAGE (ADR-0013),
   *  затем строка stickers + событие; ответ — пак целиком (мок-контракт). */
  async uploadSticker(
    userId: string,
    canManageCorporate: boolean,
    packId: string,
    input: {
      emojis: string[];
      size: number;
      width?: number | undefined;
      height?: number | undefined;
    },
    content: Readable,
  ): Promise<StickerPack> {
    const pack = await this.repository.findPack(packId);
    if (!pack) throw DomainException.notFound('Sticker pack not found');
    if (!canManagePack(pack, userId, canManageCorporate)) {
      throw DomainException.forbidden('Only pack owner or admin can manage this pack');
    }
    if (pack.stickers.length >= STICKERS_PER_PACK_MAX) {
      throw new DomainException(ErrorCode.VALIDATION_FAILED, 'Sticker pack is full', {
        max: STICKERS_PER_PACK_MAX,
      });
    }

    // Стикеры ≤512КБ по спецификации — буферим с потолком: поток больше
    // лимита обрываем, память не расходуется (объявленный size — не истина).
    const bytes = await this.readCapped(content, STICKER_STATIC_MAX_BYTES);
    const verdict = validateStickerBytes(bytes);
    if (verdict.issue !== null) {
      throw new DomainException(
        ErrorCode.CHAT_STICKER_INVALID,
        verdict.issue === 'format'
          ? 'Sticker must be WebP, PNG or silent WebM'
          : 'Sticker exceeds size limit',
        {
          reason: verdict.issue,
          maxBytes: verdict.type === 'webm' ? 256 * 1024 : STICKER_STATIC_MAX_BYTES,
        },
        // формат — 400 (выбор файла), размер — 413 (как CHAT_ATTACHMENT_TOO_LARGE)
        verdict.issue === 'format' ? undefined : 413,
      );
    }

    const { fileId } = await this.storage.save(
      { ownerId: userId, name: `sticker.${verdict.type}`, mime: verdict.mime, size: bytes.length },
      Readable.from(bytes),
    );
    return this.txRunner.run(async (tx) => {
      // Перепроверка лимита в транзакции: параллельные загрузки в один пак
      // не должны превысить потолок (проверка до IO — лишь fast-fail).
      const live = await this.repository.countStickers(packId, tx);
      if (live >= STICKERS_PER_PACK_MAX) {
        throw new DomainException(ErrorCode.VALIDATION_FAILED, 'Sticker pack is full', {
          max: STICKERS_PER_PACK_MAX,
        });
      }
      const sticker = await this.repository.insertSticker({
        id: randomUUID(),
        packId,
        fileId,
        emojis: input.emojis,
        width: input.width ?? null,
        height: input.height ?? null,
        mime: verdict.mime,
        size: bytes.length,
        sortOrder: live,
      });
      await this.eventBus.emit(
        tx,
        CHAT_EVENTS.STICKER_ADDED,
        { packId, stickerId: sticker.id, actorId: userId },
        { actorId: userId, aggregateType: 'sticker_pack', aggregateId: packId },
      );
      const fresh = await this.repository.findPack(packId, tx);
      return this.toDto(
        fresh ?? { ...pack, updatedAt: new Date() },
        fresh?.stickers ?? [...pack.stickers, sticker],
        userId,
        new Set(),
      );
    });
  }

  /** Убрать стикер из пака: строки сообщений (fileId + снапшот) живут дальше —
   *  файловый объект не удаляем (рендер отправленных стикеров не ломается). */
  async removeSticker(
    userId: string,
    canManageCorporate: boolean,
    stickerId: string,
  ): Promise<StickerPack> {
    return this.txRunner.run(async (tx) => {
      const hit = await this.repository.findSticker(stickerId, tx);
      if (!hit) throw DomainException.notFound('Sticker not found');
      if (!canManagePack(hit.pack, userId, canManageCorporate)) {
        throw DomainException.forbidden('Only pack owner or admin can manage this pack');
      }
      await this.repository.deleteSticker(stickerId);
      await this.eventBus.emit(
        tx,
        CHAT_EVENTS.STICKER_REMOVED,
        { packId: hit.pack.id, stickerId, actorId: userId },
        { actorId: userId, aggregateType: 'sticker_pack', aggregateId: hit.pack.id },
      );
      const fresh = await this.repository.findPack(hit.pack.id, tx);
      if (!fresh) throw new Error('removeSticker: pack disappeared mid-transaction');
      return this.toDto(fresh, fresh.stickers, userId, new Set());
    });
  }

  /** Установка «себе» (дистрибуция «из чата»): идемпотентна (PK); событие —
   *  только при реальной установке (повторы тихи). */
  async install(userId: string, packId: string): Promise<StickerPack> {
    return this.txRunner.run(async (tx) => {
      const pack = await this.repository.findPack(packId, tx);
      if (!pack) throw DomainException.notFound('Sticker pack not found');
      const inserted = await this.repository.install(userId, packId, tx);
      if (inserted) {
        await this.eventBus.emit(
          tx,
          CHAT_EVENTS.STICKER_PACK_INSTALLED,
          { packId, userId },
          { actorId: userId, aggregateType: 'sticker_pack', aggregateId: packId },
        );
      }
      return this.toDto(pack, pack.stickers, userId, new Set([packId]));
    });
  }

  async uninstall(userId: string, packId: string): Promise<StickerPack> {
    return this.txRunner.run(async (tx) => {
      const pack = await this.repository.findPack(packId, tx);
      if (!pack) throw DomainException.notFound('Sticker pack not found');
      const removed = await this.repository.uninstall(userId, packId, tx);
      if (removed) {
        await this.eventBus.emit(
          tx,
          CHAT_EVENTS.STICKER_PACK_UNINSTALLED,
          { packId, userId },
          { actorId: userId, aggregateType: 'sticker_pack', aggregateId: packId },
        );
      }
      return this.toDto(pack, pack.stickers, userId, new Set());
    });
  }

  /** Читает поток в буфер с потолком: больше cap байт — обрываем чтение и
   *  отказываем (413). Непрочитанный остаток тела дренится Fastify —
   *  соединение не зависает (как при лимите @fastify/multipart, #57). */
  private readCapped(content: Readable, cap: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let total = 0;
      content.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        total += chunk.length;
        if (total > cap) {
          content.destroy();
          reject(
            new DomainException(
              ErrorCode.CHAT_STICKER_INVALID,
              'Sticker exceeds size limit',
              { reason: 'size', maxBytes: cap },
              413,
            ),
          );
        }
      });
      content.on('end', () => resolve(Buffer.concat(chunks)));
      content.on('error', reject);
    });
  }

  private toDto(
    pack: StickerPackRow & { stickers?: StickerRow[] },
    stickers: StickerRow[],
    actorId: string,
    installedIds: Set<string>,
  ): StickerPack {
    return {
      id: pack.id,
      title: pack.title,
      scope: pack.scope as StickerPackScope,
      owned: pack.ownerId === actorId,
      installed: pack.scope === 'personal' && installedIds.has(pack.id),
      stickers: stickers.map((sticker) => ({
        id: sticker.id,
        packId: sticker.packId,
        emojis: sticker.emojis,
        url: this.signedUrls.fileContentUrl(sticker.fileId),
        mime: sticker.mime,
        size: sticker.size,
        width: sticker.width,
        height: sticker.height,
      })),
    };
  }
}
