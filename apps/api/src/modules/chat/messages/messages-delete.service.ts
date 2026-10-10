import { Injectable } from '@nestjs/common';
import { CHAT_EVENTS } from '@nodus/contracts';

import { EventBus } from '../../../core/events/event-bus.js';
import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { AuditRepository } from '../../../core/audit/audit.repository.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import {
  ConversationsRepository,
  type MemberRow,
} from '../conversations/conversations.repository.js';
import { MessagesRepository, type MessageRow } from './messages.repository.js';
import { FavoritesRepository } from '../favorites/favorites.repository.js';
import { VaultRepository } from '../vault/vault.repository.js';
import { collapseAnchors } from './messages-delete-anchors.js';
import { canDeleteForeignMessage } from './messages-delete.policy.js';

/** Результат удаления: 204-семантика (бесследно) или надгробие.
 *  moderated — удалено ЧУЖОЕ сообщение по праву модерации (#245). */
export interface DeleteResult {
  message: MessageRow;
  obliterated: boolean;
  moderated: boolean;
  members: MemberRow[];
}

/**
 * Удаление сообщений — выделено из MessagesService (I5): транзакция правила
 * следа #163 (надгробие по живым ответам, каскад коллапса якорей и закладок)
 * разделяет инварианты агрегата, но не его код: отправка/правка/лента живут
 * в MessagesService. Чужое сообщение — только право модерации #245.
 */
@Injectable()
export class MessagesDeleteService {
  constructor(
    private readonly repo: MessagesRepository,
    private readonly conversations: ConversationsRepository,
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    private readonly favoritesRepo: FavoritesRepository,
    private readonly vault: VaultRepository,
    private readonly audit: AuditRepository,
  ) {}

  /**
   * Удаление одного: правило следа «по ответам» (#163, вердикт владельца
   * 30.09) — след держат только ЖИВЫЕ ОТВЕТЫ (есть кому показывать цепочку);
   * прочтения ни при чём: ошибочное сообщение не оставляет мусор прочитавшим.
   * Оба варианта: авто-unpin, пометка цитат, событие, каскад коллапса якорей.
   * Бесследное (obliterated) исключается из всех выдач, но строка и seq
   * остаются (непрерывность ссылок/истории/аудита).
   * Чужое сообщение — только по праву модерации (#245): админ/владелец
   * беседы или глобальное право chat.moderate, только группы/каналы.
   */
  async delete(
    userId: string,
    conversationId: string,
    messageId: string,
    permissions: readonly string[] = [],
  ): Promise<DeleteResult> {
    const result = await this.deleteInternal(userId, conversationId, messageId, permissions);
    await this.auditModeratedDelete(userId, conversationId, result);
    return result;
  }

  /** Пакетное удаление: недоступные (чужие без права модерации, чужой
   *  беседы, удалённые) пропускаются молча (мок). */
  async batchDelete(
    userId: string,
    conversationId: string,
    messageIds: string[],
    permissions: readonly string[] = [],
  ): Promise<{ removed: string[]; tombstones: { message: MessageRow; members: MemberRow[] }[] }> {
    const membership = await this.conversations.findMembership(conversationId, userId);
    if (!membership) throw DomainException.notFound('Conversation not found');
    const conversation = await this.conversations.findTypeAndPermissions(conversationId);
    const canForeign = conversation
      ? canDeleteForeignMessage({
          conversationType: conversation.type,
          memberRole: membership.role,
          permissions,
        })
      : false;
    const removed: string[] = [];
    const tombstones: { message: MessageRow; members: MemberRow[] }[] = [];
    for (const messageId of messageIds) {
      const message = await this.repo.findByIdInConversation(conversationId, messageId);
      if (!message || message.deletedAt) continue;
      if (message.authorId !== userId && !canForeign) continue;
      const result = await this.deleteInternal(userId, conversationId, messageId, permissions);
      await this.auditModeratedDelete(userId, conversationId, result);
      if (result.obliterated) removed.push(messageId);
      else
        tombstones.push({
          message: result.message,
          members: await this.conversations.listMembers([conversationId]),
        });
    }
    return { removed, tombstones };
  }

  private async deleteInternal(
    userId: string,
    conversationId: string,
    messageId: string,
    permissions: readonly string[] = [],
  ): Promise<DeleteResult> {
    return this.txRunner.run(async (tx) => {
      const membership = await this.conversations.findMembership(conversationId, userId, tx);
      if (!membership) throw DomainException.notFound('Conversation not found');
      const message = await this.repo.findByIdInConversation(conversationId, messageId, tx);
      if (!message || message.deletedAt) throw DomainException.notFound('Message not found');
      // #245: своё — всегда; чужое — только право модерации (группы/каналы,
      // админ/владелец беседы или chat.moderate). Проверка в транзакции —
      // свежая роль, не из кэша запроса.
      let moderated = false;
      if (message.authorId !== userId) {
        const conversation = await this.conversations.findTypeAndPermissions(conversationId, tx);
        const allowed =
          conversation !== null &&
          canDeleteForeignMessage({
            conversationType: conversation.type,
            memberRole: membership.role,
            permissions,
          });
        if (!allowed) throw DomainException.forbidden('Only author can modify this message');
        moderated = true;
      }
      // Правило следа #163: надгробие — только при живых ответах (якорь
      // цепочки), иначе бесследно. Решает сервер, прочтения не участвуют.
      // «Избранное» (#215): беседа с собой (direct, user_min=user_max=автор —
      // состав неизменяем, гонок нет) — личный чат, следов не нужно: свои
      // записи удаляются БЕССЛЕДНО всегда (надгробие в витрине — баг
      // приёмки); прочтения/ознакомления там выключены, якорь цепочки
      // показывать некому. Выродившаяся группа/канал (1 участник) под гвард
      // НЕ попадает — там правило #163 работает как раньше.
      const selfChat = await this.conversations.isNotesConversation(
        conversationId,
        message.authorId,
        tx,
      );
      const hasReplies = selfChat
        ? false
        : await this.repo.hasLiveReplies(conversationId, messageId, tx);
      const obliterated = !hasReplies;
      const tombstone = await this.repo.tombstone(conversationId, messageId, obliterated, tx);
      await this.repo.deletePinByMessage(messageId, tx);
      await this.repo.markRepliesDeleted(messageId, tx);
      // Витрина #211: сообщение уходит из выдач (надгробие/бесследно) — его
      // вложения и ссылки гаснут: чистка строк ссылок + Δ счётчиков (та же tx).
      await this.vault.applyMessageDeleted(tx, conversationId, messageId);
      // Каскад закладок (#215): оригинал удалён — строки избранного гаснут у
      // ВСЕХ владельцев (карточка-призрак не висит в витрине надгробием),
      // каждому — событие в его user-комнату (как при ручном снятии звезды;
      // фронт рефечит список и гасит звёзды).
      const owners = await this.favoritesRepo.deleteByMessage(messageId, tx);
      for (const ownerId of owners) {
        await this.eventBus.emit(
          tx,
          CHAT_EVENTS.FAVORITE_REMOVED,
          { userId: ownerId, conversationId, messageId },
          { actorId: userId, aggregateType: 'message', aggregateId: messageId },
        );
      }
      await this.eventBus.emit(
        tx,
        CHAT_EVENTS.MESSAGE_DELETED,
        { conversationId, messageId, obliterated },
        { actorId: userId, aggregateType: 'conversation', aggregateId: conversationId },
      );
      await collapseAnchors(userId, conversationId, tombstone, this.repo, this.eventBus, tx);
      return {
        message: tombstone,
        obliterated,
        moderated,
        members: await this.conversations.listMembers([conversationId], tx),
      };
    });
  }

  /** #245 (I7): чужое удаление — детальная аудит-запись поверх route-аудита:
   *  кто удалил, чьё сообщение, след/бесследно. Пишется после коммита tx —
   *  запись аудита не может откатить удаление и наоборот не маскирует его. */
  private async auditModeratedDelete(
    actorId: string,
    conversationId: string,
    result: DeleteResult,
  ): Promise<void> {
    if (!result.moderated) return;
    await this.audit.append({
      actorId,
      action: 'chat.message_moderated_delete',
      entityType: 'message',
      entityId: result.message.id,
      details: {
        conversationId,
        authorId: result.message.authorId,
        obliterated: result.obliterated,
      },
    });
  }
}
