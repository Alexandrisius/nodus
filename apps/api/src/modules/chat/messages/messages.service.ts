import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  CHAT_EVENTS,
  ErrorCode,
  type ChatMessage,
  type EditMessageBody,
  type ListMessagesQuery,
  type Paginated,
  type ReadConversationResult,
  type SendMessageBody,
} from '@nodus/contracts';

import { EventBus } from '../../../core/events/event-bus.js';
import {
  TransactionRunner,
  type TransactionClient,
} from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import {
  USER_PROFILE_READER,
  type UserProfileReader,
} from '../../../core/ports/user-profile.port.js';
import { decodeCursor, encodeCursor } from '../../../core/pagination/cursor.util.js';
import {
  ConversationsRepository,
  type MemberRow,
} from '../conversations/conversations.repository.js';
import { can, parsePermissions } from '../permissions.js';
import { MessageDtoMapper } from './message-dto.mapper.js';
import { addMentionWatchers, resolveMentionMatches } from './mentions.js';
import { assertUrgentSendAllowed } from './send-urgent.policy.js';
import {
  MessagesRepository,
  type MessageRow,
  type ClaimedAttachmentRow,
} from './messages.repository.js';
import { AttachmentsRepository } from './attachments.repository.js';
import { ThreadParticipantsRepository } from './thread-participants.repository.js';
import { buildReplySnapshot } from './reply-snapshot.js';
import {
  StickersRepository,
  type StickerAttachmentRow,
  type StickerWithPackRow,
} from '../stickers/stickers.repository.js';

const messageCursorSchema = z.object({ s: z.number().int().positive() });

/** Результат удаления: 204-семантика (бесследно) или надгробие. */
export interface DeleteResult {
  message: MessageRow;
  obliterated: boolean;
  members: MemberRow[];
}

export interface SendResult {
  message: MessageRow;
  members: MemberRow[];
  replayed: boolean;
}

// >300 строк — обоснование (I5): транзакция отправки (идемпотентность+seq+вложения+побочные+события)
// неразрывна; правка/удаление разделяют те же инварианты правила следа — единый сервис агрегата.
/**
 * Ядро сообщений: отправка (seq + идемпотентность в БД + outbox в одной
 * транзакции), лента/треды курсором по seq, квитанции просмотров (POST
 * /read — watermark GREATEST), правка/удаление по правилу следа. Все
 * мутации сообщений начинаются с UPDATE conversations SET last_seq →
 * транзакции беседы сериализуются.
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly repo: MessagesRepository,
    private readonly attachmentsRepo: AttachmentsRepository,
    private readonly conversations: ConversationsRepository,
    private readonly mapper: MessageDtoMapper,
    private readonly txRunner: TransactionRunner,
    private readonly eventBus: EventBus,
    @Inject(USER_PROFILE_READER) private readonly userProfiles: UserProfileReader,
    private readonly threadParticipants: ThreadParticipantsRepository,
    private readonly stickersRepo: StickersRepository,
  ) {}

  // ===== Чтение =====

  /** Страница ленты/треда (ASC в странице, курсор назад по seq). Курсор
   *  прочтения НЕ двигает (#102 раунд 2): просмотр = видимость в вьюпорте,
   *  квитанции — POST /read от клиента. */
  async list(
    userId: string,
    conversationId: string,
    query: ListMessagesQuery,
  ): Promise<Paginated<ChatMessage>> {
    const membership = await this.conversations.findMembership(conversationId, userId);
    if (!membership) throw DomainException.notFound('Conversation not found');
    const beforeSeq = query.cursor
      ? BigInt(decodeCursor(query.cursor, messageCursorSchema).s)
      : null;
    const { rows, hasMore } = await this.repo.listPage(conversationId, {
      limit: query.limit,
      beforeSeq,
      threadRootId: query.threadRootId ?? null,
    });
    const members = await this.conversations.listMembers([conversationId]);
    const items = await this.mapper.toDtos(rows, { viewerId: userId, members });
    return {
      items,
      nextCursor: hasMore && rows.length > 0 ? encodeCursor({ s: Number(rows[0]!.seq) }) : null,
    };
  }

  /**
   * Квитанция просмотров (#102 раунд 2): клиент видел до upToSeq (клампится к
   * last_seq беседы — фантомное «всё прочитано» с кривым клиентом невозможно).
   * Watermark двигается GREATEST-ом в своей транзакции; событие — только при
   * реальном изменении (дубликаты/повторы тихи). readAt — фактическое время
   * из строки, не момент эмита.
   *
   * threadRootId (раунд 3) — квитанция ИЗ ТРЕДА: сверх watermark беседы
   * («увидел где угодно = просмотрено») двигает watermark трэда НАБЛЮДАТЕЛЯ
   * (точка «есть новые» на посте гаснет); не-наблюдателю писать нечего.
   */
  async readConversation(
    userId: string,
    conversationId: string,
    upToSeq: number,
    threadRootId?: string,
  ): Promise<ReadConversationResult> {
    return this.txRunner.run(async (tx) => {
      const membership = await this.conversations.findMembership(conversationId, userId, tx);
      if (!membership) throw DomainException.notFound('Conversation not found');
      const lastSeq = await this.conversations.findLastSeq(conversationId, tx);
      if (lastSeq === null) throw DomainException.notFound('Conversation not found');
      const target = lastSeq < BigInt(upToSeq) ? lastSeq : BigInt(upToSeq);
      if (threadRootId !== undefined) {
        const root = await this.repo.findByIdInConversation(conversationId, threadRootId, tx);
        if (!root || root.threadRootId !== null) {
          throw DomainException.notFound('Thread root not found');
        }
      }
      const { advanced, lastReadAt } = await this.repo.advanceReadCursor(
        conversationId,
        userId,
        target,
        tx,
      );
      if (threadRootId !== undefined) {
        // Тихо: событие беседы ниже уже инвалидирует thread-state клиентам.
        await this.threadParticipants.advanceReadCursor(threadRootId, userId, target, tx);
      }
      if (advanced) {
        await this.eventBus.emit(
          tx,
          CHAT_EVENTS.MESSAGE_READ,
          {
            conversationId,
            userId,
            upToSeq: Number(target),
            readAt: (lastReadAt ?? new Date()).toISOString(),
          },
          { actorId: userId, aggregateType: 'conversation', aggregateId: conversationId },
        );
      }
      return { upToSeq: Number(target) };
    });
  }

  // ===== Отправка =====

  /**
   * Отправка: транзакция [replay-проверка → валидации → seq → INSERT ON
   * CONFLICT → вложения → гашение черновика/снуза → события]. Идемпотентность
   * двойная: Redis-интерсептор (ADR-0005) на повторе запроса и уникальная
   * пара (author, client_message_id) в БД на crash-окно между реплеем и
   * фиксацией. client_message_id = Idempotency-Key запроса.
   */
  async send(
    userId: string,
    conversationId: string,
    body: SendMessageBody,
    idempotencyKey: string | undefined,
  ): Promise<SendResult> {
    const clientMessageId = idempotencyKey ?? randomUUID();
    // @упоминания (раунд 3): справочник читаем ДО транзакции — текст известен
    // заранее, а второе соединение пула внутри tx голодает его под пачкой
    // параллельных отправок (repro chat-reliability).
    const mentionMatches = await resolveMentionMatches(this.userProfiles, body.text);
    return this.txRunner.run(async (tx) => {
      const membership = await this.conversations.findMembership(conversationId, userId, tx);
      if (!membership) throw DomainException.notFound('Conversation not found');

      // Быстрый replay: тот же ключ уже зафиксирован — побочные эффекты сделаны.
      const existing = await this.repo.findExisting(userId, clientMessageId, tx);
      if (existing) {
        if (existing.conversationId !== conversationId) {
          throw DomainException.conflict('Idempotency-Key already used for another message');
        }
        return {
          message: existing,
          members: await this.conversations.listMembers([conversationId], tx),
          replayed: true,
        };
      }

      const conversation = await this.conversations.findTypeAndPermissions(conversationId, tx);
      if (!conversation) throw DomainException.notFound('Conversation not found');
      const permissions = parsePermissions(conversation.permissions);
      const threadRootId = body.threadRootId ?? null;

      // «Важное сообщение» (#100): лимит отправителя и потолок участников —
      // на бэкенде (I8); политика — чистая функция send-urgent.policy.ts.
      const urgent = body.urgent ?? false;
      if (urgent) {
        const memberCount =
          conversation.type === 'direct'
            ? 0
            : await this.conversations.countMembers(conversationId, tx);
        const sentToday = await this.repo.countUrgentSentSince(
          userId,
          new Date(Date.now() - 24 * 3600 * 1000),
          tx,
        );
        assertUrgentSendAllowed({
          conversationType: conversation.type,
          memberCount,
          sentToday,
          dailyLimit: Number(process.env.NOTIFY_URGENT_DAILY_LIMIT ?? 3),
          groupMax: Number(process.env.NOTIFY_URGENT_GROUP_MAX ?? 20),
        });
      }

      // Право постить — только на корневые сообщения ленты; треды открыты
      // всем участникам (модель канала новостей: постят избранные, обсуждают все).
      if (
        threadRootId === null &&
        !can(membership.role as 'owner' | 'admin' | 'member', permissions, 'post')
      ) {
        throw DomainException.forbidden('Posting in this conversation requires permission');
      }

      // Валидация треда: ровно один уровень, корень — этой беседы.
      let threadRoot: MessageRow | null = null;
      if (threadRootId !== null) {
        threadRoot = await this.repo.findByIdInConversation(conversationId, threadRootId, tx);
        if (!threadRoot || threadRoot.threadRootId !== null) {
          throw DomainException.notFound('Thread root not found');
        }
      }

      // Стикер (#143): доступ проверяется в транзакции (корпоративный |
      //  владеет | установлен); стикер-сообщение монолитно — текста и
      //  обычных вложений не несёт (модель Telegram, клиентский контракт).
      let stickerHit: StickerWithPackRow | null = null;
      if (body.stickerId !== undefined) {
        if (body.text.length > 0 || (body.attachmentIds?.length ?? 0) > 0) {
          throw new DomainException(
            ErrorCode.VALIDATION_FAILED,
            'Sticker message cannot carry text or attachments',
          );
        }
        stickerHit = await this.stickersRepo.findSticker(body.stickerId, tx);
        if (!stickerHit) throw DomainException.notFound('Sticker not found');
        const accessible = await this.stickersRepo.findPackAccessible(
          stickerHit.pack.id,
          userId,
          tx,
        );
        if (!accessible) throw DomainException.notFound('Sticker not found');
      }

      // Снапшот цитаты (оригинал — только этой беседы: чужое не утекает).
      let replySnapshot: ReturnType<typeof buildReplySnapshot> | null = null;
      let replyOriginalRow: MessageRow | null = null;
      if (body.replyToId) {
        replyOriginalRow = await this.repo.findByIdInConversation(
          conversationId,
          body.replyToId,
          tx,
        );
        const originalAttachments =
          replyOriginalRow && !replyOriginalRow.deletedAt
            ? await this.repo.attachmentsFor([replyOriginalRow.id], tx)
            : [];
        replySnapshot = buildReplySnapshot(
          replyOriginalRow
            ? {
                authorId: replyOriginalRow.authorId,
                text: replyOriginalRow.text,
                deleted: replyOriginalRow.deletedAt !== null,
                attachmentKind:
                  (originalAttachments[0]?.kind as 'image' | 'file' | 'sticker') ?? null,
              }
            : null,
          body.quoteText ?? null,
        );
      }

      const seq = await this.repo.allocateSeqs(conversationId, 1, tx);
      const inserted = await this.repo.insertMessage(
        {
          id: randomUUID(),
          conversationId,
          seq,
          authorId: userId,
          clientMessageId,
          text: body.text,
          replyToId: body.replyToId ?? null,
          replySnapshot,
          threadRootId,
          fwd: null,
          urgent,
          mentionedUserIds: mentionMatches,
          createdAt: new Date(),
        },
        tx,
      );
      if (!inserted) {
        // Редкая гонка: фиксация конкурента между SELECT и INSERT — реплей.
        const raced = await this.repo.findExisting(userId, clientMessageId, tx);
        if (!raced) throw new Error('send: ON CONFLICT returned nothing and no existing row');
        return {
          message: raced,
          members: await this.conversations.listMembers([conversationId], tx),
          replayed: true,
        };
      }

      // Вложения: стикер — прямая вставка со снапшотом пака (#143), обычные —
      // одноразовый claim трея. Активность беседы — только корневые.
      const claimedAttachments: (ClaimedAttachmentRow | StickerAttachmentRow)[] = stickerHit
        ? [
            await this.stickersRepo.insertAttachmentForMessage(
              inserted.id,
              userId,
              stickerHit,
              stickerHit.pack,
              tx,
            ),
          ]
        : await this.repo.claimAttachments(inserted.id, body.attachmentIds ?? [], userId, tx);
      // Стикер не гасит черновик композера (keepDraft, #143): набранный текст
      // остаётся жить в PUT /draft после отправки стикера.
      if (stickerHit === null) {
        await this.conversations.clearDraft(conversationId, userId, tx);
      }
      await this.conversations.unsnooze(conversationId, userId, tx);
      // Активность раскрывает беседу скрывшим её участникам (#103).
      await this.conversations.revealHidden(conversationId, tx);
      if (threadRootId === null) {
        await this.repo.touchLastMessageAt(conversationId, tx);
      } else {
        // Автор корня — участник треда с момента первого ответа (уведомления).
        if (threadRoot && threadRoot.authorId !== userId) {
          await this.threadParticipants.upsert(threadRootId, threadRoot.authorId, 'author', tx);
        }
        await this.threadParticipants.upsert(threadRootId, userId, 'replier', tx);
        // Свой ответ = «я видел тред до сюда» (модель Telegram): watermark
        // трэда реплайера доходит до seq ответа — прежние чужие ответы не
        // вспыхивают «непрочитанными» у только что подключившегося.
        await this.threadParticipants.advanceReadCursor(threadRootId, userId, inserted.seq, tx);
        const priorReplies = await this.repo.countThreadReplies(threadRootId, inserted.id, tx);
        if (priorReplies === 0) {
          await this.eventBus.emit(
            tx,
            CHAT_EVENTS.THREAD_CREATED,
            { conversationId, threadRootId, messageId: inserted.id },
            { actorId: userId, aggregateType: 'conversation', aggregateId: conversationId },
          );
        }
      }
      // @упоминания (раунд 3): упомянутые — наблюдатели трэда этого сообщения
      // (для корневого — его будущего треда); соответствие решено до tx.
      await addMentionWatchers(
        this.threadParticipants,
        tx,
        threadRootId ?? inserted.id,
        mentionMatches,
        userId,
      );

      const members = await this.conversations.listMembers([conversationId], tx);
      // Полный DTO в payload (раунд 3): клиенты применяют событие локально по
      // seq без рефеча («буря рефечей»); собираем из данных транзакции.
      const payloadMessage = await this.mapper.toFreshDto(inserted, {
        viewerId: userId,
        members,
        replyOriginal: replyOriginalRow,
        attachments: claimedAttachments,
        tx,
      });
      await this.eventBus.emit(
        tx,
        CHAT_EVENTS.MESSAGE_SENT,
        {
          conversationId,
          messageId: inserted.id,
          seq: Number(inserted.seq),
          authorId: userId,
          threadRootId,
          forwarded: false,
          urgent,
          mentionedUserIds: mentionMatches,
          message: payloadMessage,
        },
        { actorId: userId, aggregateType: 'conversation', aggregateId: conversationId },
      );
      return { message: inserted, members, replayed: false };
    });
  }

  // ===== Правка =====

  /** Правка (#188): текст + опционально полный состав вложений. Только
   *  автор, без давности; editedAt — только при реальной смене (текст,
   *  состав или имена файлов). */
  async edit(
    userId: string,
    conversationId: string,
    messageId: string,
    body: EditMessageBody,
  ): Promise<{ message: MessageRow; members: MemberRow[] }> {
    return this.txRunner.run(async (tx) => {
      if (!(await this.conversations.findMembership(conversationId, userId, tx))) {
        throw DomainException.notFound('Conversation not found');
      }
      const message = await this.repo.findByIdInConversation(conversationId, messageId, tx);
      if (!message || message.deletedAt) throw DomainException.notFound('Message not found');
      if (message.authorId !== userId) {
        throw DomainException.forbidden('Only author can modify this message');
      }
      // Пересланную копию не правит даже переславший (#111, I8): текст под
      // атрибуцией «Переслано от» принадлежит оригинальному автору — правка
      // позволила бы исказить чужие слова (модель Telegram: только удаление).
      if (message.fwdMessageId) {
        throw DomainException.forbidden('Forwarded messages cannot be edited');
      }
      const attachmentsChanged = await this.syncEditAttachments(messageId, userId, body, tx);
      let updated = message;
      if (message.text !== body.text || attachmentsChanged) {
        updated = await this.repo.updateEditText(conversationId, messageId, userId, body.text, tx);
        // readAt сбрасывается выводно (editedAt > last_read_at читателей) —
        // «повторный пуш прочитавшим» (решение #41); состав вложений в
        // событии не разносится — подписчики дочитывают через API.
        await this.eventBus.emit(
          tx,
          CHAT_EVENTS.MESSAGE_EDITED,
          {
            conversationId,
            messageId,
            editedAt: updated.editedAt!.toISOString(),
            authorId: userId,
            text: updated.text,
            seq: Number(updated.seq),
          },
          { actorId: userId, aggregateType: 'conversation', aggregateId: conversationId },
        );
      }
      return {
        message: updated,
        members: await this.conversations.listMembers([conversationId], tx),
      };
    });
  }

  /** Применение состава вложений правки (#188): claim новых, detach
   *  убранных, reorder, переименования. Возвращает «была ли реальная смена»
   *  (сигнатура состава+имён до/после) — она решает, ставить ли editedAt и
   *  событие. Стикер-сообщение не правится ни составом, ни именами (стикер
   *  неделим, #143). Инвариант непустоты: текст или ≥1 вложение — иначе
   *  валидационная ошибка и откат транзакции (мусорный/чужой id в списке не
   *  оставит сообщение пустым — security-ревью #188). */
  private async syncEditAttachments(
    messageId: string,
    userId: string,
    body: EditMessageBody,
    tx: TransactionClient,
  ): Promise<boolean> {
    if (body.attachmentIds === undefined && body.attachmentRenames === undefined) return false;
    const before = await this.repo.attachmentsFor([messageId], tx);
    if (before.some((a) => a.kind === 'sticker')) {
      throw DomainException.forbidden('Sticker messages cannot be edited');
    }
    if (body.attachmentIds !== undefined) {
      await this.attachmentsRepo.syncMessageAttachments(messageId, body.attachmentIds, userId, tx);
    }
    if (body.attachmentRenames !== undefined && body.attachmentRenames.length > 0) {
      await this.attachmentsRepo.renameMessageAttachments(messageId, body.attachmentRenames, tx);
    }
    const after = await this.repo.attachmentsFor([messageId], tx);
    if (body.text.trim().length === 0 && after.length === 0) {
      throw new DomainException(
        ErrorCode.VALIDATION_FAILED,
        'Message must have text or attachments',
      );
    }
    const signature = (rows: typeof before) => rows.map((a) => `${a.id}:${a.name}`).join('|');
    return signature(before) !== signature(after);
  }

  // ===== Удаление =====

  /**
   * Удаление одного: правило следа «по ответам» (#163, вердикт владельца
   * 30.09) — след держат только ЖИВЫЕ ОТВЕТЫ (есть кому показывать цепочку);
   * прочтения ни при чём: ошибочное сообщение не оставляет мусор прочитавшим.
   * Оба варианта: авто-unpin, пометка цитат, событие, каскад коллапса якорей.
   * Бесследное (obliterated) исключается из всех выдач, но строка и seq
   * остаются (непрерывность ссылок/истории/аудита).
   */
  async delete(userId: string, conversationId: string, messageId: string): Promise<DeleteResult> {
    return this.deleteInternal(userId, conversationId, messageId);
  }

  /** Пакетное удаление: чужие/чужой беседы/удалённые пропускаются молча (мок). */
  async batchDelete(
    userId: string,
    conversationId: string,
    messageIds: string[],
  ): Promise<{ removed: string[]; tombstones: { message: MessageRow; members: MemberRow[] }[] }> {
    if (!(await this.conversations.findMembership(conversationId, userId))) {
      throw DomainException.notFound('Conversation not found');
    }
    const removed: string[] = [];
    const tombstones: { message: MessageRow; members: MemberRow[] }[] = [];
    for (const messageId of messageIds) {
      const message = await this.repo.findByIdInConversation(conversationId, messageId);
      if (!message || message.deletedAt || message.authorId !== userId) continue;
      const result = await this.deleteInternal(userId, conversationId, messageId);
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
  ): Promise<DeleteResult> {
    return this.txRunner.run(async (tx) => {
      if (!(await this.conversations.findMembership(conversationId, userId, tx))) {
        throw DomainException.notFound('Conversation not found');
      }
      const message = await this.repo.findByIdInConversation(conversationId, messageId, tx);
      if (!message || message.deletedAt) throw DomainException.notFound('Message not found');
      if (message.authorId !== userId) {
        throw DomainException.forbidden('Only author can modify this message');
      }
      // Правило следа #163: надгробие — только при живых ответах (якорь
      // цепочки), иначе бесследно. Решает сервер, прочтения не участвуют.
      const hasReplies = await this.repo.hasLiveReplies(conversationId, messageId, tx);
      const obliterated = !hasReplies;
      const tombstone = await this.repo.tombstone(conversationId, messageId, obliterated, tx);
      await this.repo.deletePinByMessage(messageId, tx);
      await this.repo.markRepliesDeleted(messageId, tx);
      await this.eventBus.emit(
        tx,
        CHAT_EVENTS.MESSAGE_DELETED,
        { conversationId, messageId, obliterated },
        { actorId: userId, aggregateType: 'conversation', aggregateId: conversationId },
      );
      await this.collapseAnchors(userId, conversationId, tombstone, tx);
      return {
        message: tombstone,
        obliterated,
        members: await this.conversations.listMembers([conversationId], tx),
      };
    });
  }

  /**
   * Каскад #163: удаление ответа могло оставить родителя/корень треда —
   * надгробие-якорь без живых ответов. Такой якорь больше не нужен (след
   * держится только цепочкой) — коллапс в obliterated, своё событие. Условие
   * атомарно в UPDATE (obliterateTombstone), двойной коллапс невозможен.
   */
  private async collapseAnchors(
    userId: string,
    conversationId: string,
    deleted: MessageRow,
    tx: TransactionClient,
  ): Promise<void> {
    const anchors = new Set(
      [deleted.replyToId, deleted.threadRootId].filter(
        (id): id is string => id !== null && id !== deleted.id,
      ),
    );
    for (const anchorId of anchors) {
      const collapsed = await this.repo.obliterateTombstone(conversationId, anchorId, tx);
      if (collapsed) {
        await this.eventBus.emit(
          tx,
          CHAT_EVENTS.MESSAGE_DELETED,
          { conversationId, messageId: anchorId, obliterated: true },
          { actorId: userId, aggregateType: 'conversation', aggregateId: conversationId },
        );
      }
    }
  }
}
