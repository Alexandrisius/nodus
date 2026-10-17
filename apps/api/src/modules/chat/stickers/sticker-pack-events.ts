import { Injectable } from '@nestjs/common';
import {
  CHAT_EVENTS,
  type ChatStickerAddedPayload,
  type ChatStickerPackInstallPayload,
  type ChatStickerPackPayload,
  type StickerPackScope,
} from '@nodus/contracts';

import { EventBus } from '../../../core/events/event-bus.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import { StickersRepository, type StickerPackRow } from './stickers.repository.js';

type PackRef = Pick<StickerPackRow, 'id' | 'scope' | 'ownerId'>;

type PackChange =
  | typeof CHAT_EVENTS.STICKER_PACK_CREATED
  | typeof CHAT_EVENTS.STICKER_PACK_UPDATED
  | typeof CHAT_EVENTS.STICKER_PACK_DELETED;

type StickerChange = typeof CHAT_EVENTS.STICKER_ADDED | typeof CHAT_EVENTS.STICKER_REMOVED;

type InstallChange =
  typeof CHAT_EVENTS.STICKER_PACK_INSTALLED | typeof CHAT_EVENTS.STICKER_PACK_UNINSTALLED;

/**
 * Outbox-события стикер-паков (I9) с адресатами живой доставки (#318):
 * у события нет беседы, поэтому payload сам говорит gateway, кому слать.
 * Корпоративный пак видят все (общая комната, `audience` пуст); личный —
 * владелец и установившие его «себе» (читаются в транзакции изменения).
 */
@Injectable()
export class StickerPackEvents {
  constructor(
    private readonly repository: StickersRepository,
    private readonly eventBus: EventBus,
  ) {}

  async packChanged(
    tx: TransactionClient,
    type: PackChange,
    pack: PackRef,
    title: string,
    actorId: string,
  ): Promise<void> {
    const payload: ChatStickerPackPayload = {
      packId: pack.id,
      title,
      actorId,
      ...(await this.audienceOf(pack, tx)),
    };
    await this.emit(tx, type, payload, pack.id, actorId);
  }

  async stickerChanged(
    tx: TransactionClient,
    type: StickerChange,
    pack: PackRef,
    stickerId: string,
    actorId: string,
  ): Promise<void> {
    const payload: ChatStickerAddedPayload = {
      packId: pack.id,
      stickerId,
      actorId,
      ...(await this.audienceOf(pack, tx)),
    };
    await this.emit(tx, type, payload, pack.id, actorId);
  }

  /** Установка/снятие «себе»: меняется только набор установившего. */
  async installChanged(
    tx: TransactionClient,
    type: InstallChange,
    packId: string,
    userId: string,
  ): Promise<void> {
    const payload: ChatStickerPackInstallPayload = { packId, userId };
    await this.emit(tx, type, payload, packId, userId);
  }

  private async audienceOf(
    pack: PackRef,
    tx: TransactionClient,
  ): Promise<{ scope: StickerPackScope; audience: string[] }> {
    if (pack.scope === 'corporate') return { scope: 'corporate', audience: [] };
    const audience = new Set(await this.repository.listInstallerIds(pack.id, tx));
    if (pack.ownerId) audience.add(pack.ownerId);
    return { scope: 'personal', audience: [...audience] };
  }

  private async emit(
    tx: TransactionClient,
    type: string,
    payload: Record<string, unknown>,
    packId: string,
    actorId: string,
  ): Promise<void> {
    await this.eventBus.emit(tx, type, payload, {
      actorId,
      aggregateType: 'sticker_pack',
      aggregateId: packId,
    });
  }
}
