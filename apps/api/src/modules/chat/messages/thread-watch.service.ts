import { Injectable } from '@nestjs/common';
import type { ThreadState } from '@nodus/contracts';

import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { DomainException } from '../../../core/errors/domain-exception.js';
import { ConversationsRepository } from '../conversations/conversations.repository.js';
import { MessagesRepository } from './messages.repository.js';
import { ThreadParticipantsRepository } from './thread-participants.repository.js';

/**
 * Наблюдение трэдов (раунд 3): watch-toggle и состояния трэдов для точки
 * «есть новые». Выделено из MessageActionsService (I5: один файл = одна
 * ответственность).
 */
@Injectable()
export class ThreadWatchService {
  constructor(
    private readonly messages: MessagesRepository,
    private readonly conversations: ConversationsRepository,
    private readonly txRunner: TransactionRunner,
    private readonly threadParticipants: ThreadParticipantsRepository,
  ) {}

  // ===== Треды: наблюдение и состояния (раунд 3) =====

  /**
   * Состояния трэдов беседы для текущего пользователя: строка на каждый трэд,
   * где он наблюдатель (автор корня / реплай / кнопка / @). Точка «есть новые»
   * на посте и счётчик новым тоном — только по этим данным.
   */
  async threadStates(userId: string, conversationId: string): Promise<ThreadState[]> {
    if (!(await this.conversations.findMembership(conversationId, userId))) {
      throw DomainException.notFound('Conversation not found');
    }
    return this.threadParticipants.states(conversationId, userId);
  }

  /**
   * Toggle наблюдения (кнопка «Следить/Перестать» в шапке окна треда):
   * нет строки участия → добавить watcher; есть → снять наблюдение (строка
   * удаляется целиком — реплай/@ добавят снова при следующем событии).
   * Идемпотентность пары (пользователь, трэд) держит PK; повтор запроса с тем
   * же Idempotency-Key возвращает первый результат (Redis-интерсептор).
   */
  async watchThread(
    userId: string,
    conversationId: string,
    threadRootId: string,
  ): Promise<{ watching: boolean }> {
    return this.txRunner.run(async (tx) => {
      if (!(await this.conversations.findMembership(conversationId, userId, tx))) {
        throw DomainException.notFound('Conversation not found');
      }
      const root = await this.messages.findByIdInConversation(conversationId, threadRootId, tx);
      if (!root || root.threadRootId !== null) {
        throw DomainException.notFound('Thread root not found');
      }
      const watching = await this.threadParticipants.findLastRead(threadRootId, userId, tx);
      if (watching === null) {
        await this.threadParticipants.upsert(threadRootId, userId, 'watcher', tx);
        return { watching: true };
      }
      await this.threadParticipants.delete(threadRootId, userId, tx);
      return { watching: false };
    });
  }
}
