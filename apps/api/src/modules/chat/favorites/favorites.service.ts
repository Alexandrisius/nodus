import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  CHAT_EVENTS,
  ErrorCode,
  type AddFavoritesBody,
  type FavoriteCard,
  type FavoriteLabelList,
  type ListFavoritesQuery,
  type Paginated,
  type UpdateFavoriteBody,
} from '@nodus/contracts';

import { DomainException } from '../../../core/errors/domain-exception.js';
import { EventBus } from '../../../core/events/event-bus.js';
import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { decodeCursor, encodeCursor } from '../../../core/pagination/cursor.util.js';
import { ConversationsRepository } from '../conversations/conversations.repository.js';
import { MessagesRepository } from '../messages/messages.repository.js';
import { FavoriteCardMapper } from './favorite-card.mapper.js';
import { FavoritesRepository } from './favorites.repository.js';

const favoriteCursorSchema = z.object({ t: z.iso.datetime(), id: z.uuid() });

/**
 * Избранное (#171): личные закладки-ссылки на сообщения. Звезда мгновенна
 * (идемпотентна PK user×message), события — в outbox той же транзакции,
 * только в user-комнату владельца (личное состояние, как прочитанность).
 * Приватность: звезда ставится только на сообщения бесед, где владелец
 * участник; карточки исключённых бесед перестают выдаваться (репозиторий).
 */
@Injectable()
export class FavoritesService {
  constructor(
    private readonly favorites: FavoritesRepository,
    private readonly cards: FavoriteCardMapper,
    private readonly messages: MessagesRepository,
    private readonly conversations: ConversationsRepository,
    private readonly eventBus: EventBus,
    private readonly txRunner: TransactionRunner,
  ) {}

  /** Список карточек: ключ по моменту закладки (свежие первыми). */
  async list(userId: string, query: ListFavoritesQuery): Promise<Paginated<FavoriteCard>> {
    const cursor = query.cursor ? decodeCursor(query.cursor, favoriteCursorSchema) : null;
    const { rows, nextCursor } = await this.favorites.list(userId, query, cursor);
    return {
      items: await this.cards.toDtos(rows, userId),
      nextCursor: nextCursor ? encodeCursor({ t: nextCursor.t, id: nextCursor.id }) : null,
    };
  }

  /** Подсказки существующих эмодзи-меток (чипы поиска витрины). */
  async labels(userId: string): Promise<FavoriteLabelList> {
    return { items: await this.favorites.distinctLabels(userId) };
  }

  /**
   * Поставить звёзды (одна или цепочка мультиселекта): порядок массива =
   * порядок потока «Избранного» (createdAt = now+i мс, канон forward). Чужие
   * беседы/удалённые сообщения молча пропускаются (не раскрываем
   * существование); уже стоящие — идемпотентно в ответе без дублей событий.
   * Записи собственного «Избранного» (direct с собой) РАЗРЕШЕНЫ с ревизии
   * 04.10 раунд 5: звезда на запись = строка личных тэгов-реакций (витрина
   * дедуплицирует запись/карточку одного сообщения; UI-звезда внутри
   * витрины по-прежнему скрыта — self-reference тумблера).
   */
  async add(userId: string, body: AddFavoritesBody): Promise<{ items: FavoriteCard[] }> {
    const uniqueIds = [...new Set(body.messageIds)];
    const rows = await this.messages.findByIds(uniqueIds);
    const byId = new Map(rows.map((row) => [row.id, row]));

    // Право: только сообщения бесед, где владелец — участник (I8: нечлен
    // не может сохранить ссылку на чужой контент).
    const allowed: { messageId: string; conversationId: string }[] = [];
    for (const messageId of uniqueIds) {
      const row = byId.get(messageId);
      if (!row) continue;
      if (!(await this.conversations.findMembership(row.conversationId, userId))) continue;
      allowed.push({ messageId, conversationId: row.conversationId });
    }

    await this.txRunner.run(async (tx) => {
      const existing = await this.favorites.findExisting(
        userId,
        allowed.map((a) => a.messageId),
      );
      const now = Date.now();
      const created: string[] = [];
      for (const [index, item] of allowed.entries()) {
        if (existing.has(item.messageId)) continue;
        const inserted = await this.favorites.create(
          userId,
          item.messageId,
          new Date(now + index),
          tx,
        );
        if (inserted) {
          created.push(item.messageId);
          await this.eventBus.emit(
            tx,
            CHAT_EVENTS.FAVORITE_ADDED,
            { userId, conversationId: item.conversationId, messageId: item.messageId },
            { actorId: userId, aggregateType: 'message', aggregateId: item.messageId },
          );
        }
      }
      return created;
    });

    // Ответ — карточки всех доступных запрошенных (вставленные + стоявшие):
    // «звезда мгновенна», повтор запроса тем же Idempotency-Key — тот же состав.
    const cardRows = await Promise.all(
      allowed.map(({ messageId }) => this.favorites.findRow(userId, messageId)),
    );
    const cards = await this.cards.toDtos(
      cardRows.filter((row): row is NonNullable<typeof row> => row !== null),
      userId,
    );
    // Порядок ответа — порядок запроса (карточки цепочки в порядке выделения).
    const order = new Map(allowed.map((a, i) => [a.messageId, i]));
    cards.sort((a, b) => (order.get(a.messageId) ?? 0) - (order.get(b.messageId) ?? 0));
    return { items: cards };
  }

  /** Снять звезду: 204 всегда (незвёздное — тихо, toggle-идемпотентность). */
  async remove(userId: string, messageId: string): Promise<void> {
    const row = await this.favorites.findRow(userId, messageId);
    if (!row) return;
    await this.txRunner.run(async (tx) => {
      const removed = await this.favorites.delete(userId, messageId, tx);
      if (removed) {
        await this.eventBus.emit(
          tx,
          CHAT_EVENTS.FAVORITE_REMOVED,
          { userId, conversationId: row.conversation.id, messageId },
          { actorId: userId, aggregateType: 'message', aggregateId: messageId },
        );
      }
    });
  }

  /** Личные эмодзи-метки закладки (мультивыбор, весь состав массивом).
   *  Приватность: карточка с контентом оригинала выдаётся только действующим
   *  участникам беседы-источника — исключённый теряет и её (NOT_FOUND). */
  async update(userId: string, messageId: string, body: UpdateFavoriteBody): Promise<FavoriteCard> {
    const existing = await this.favorites.findRow(userId, messageId);
    if (!existing) throw new DomainException(ErrorCode.NOT_FOUND, 'Favorite not found');
    if (!(await this.conversations.findMembership(existing.conversation.id, userId))) {
      throw new DomainException(ErrorCode.NOT_FOUND, 'Favorite not found');
    }
    const row = await this.txRunner.run(async (tx) => {
      const updated = await this.favorites.update(userId, messageId, { labels: body.labels }, tx);
      if (!updated) return null;
      await this.eventBus.emit(
        tx,
        CHAT_EVENTS.FAVORITE_UPDATED,
        { userId, conversationId: updated.conversation.id, messageId },
        { actorId: userId, aggregateType: 'message', aggregateId: messageId },
      );
      return updated;
    });
    if (!row) throw new DomainException(ErrorCode.NOT_FOUND, 'Favorite not found');
    const [card] = await this.cards.toDtos([row], userId);
    return card!;
  }
}
