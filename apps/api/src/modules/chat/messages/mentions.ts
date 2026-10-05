/**
 * @упоминания в тексте сообщения (#176): inline-токены `@[текст](user:uuid)`
 * (модель Slack — привязка по id, отображаемый текст свободный; грамматика и
 * парсер — `@nodus/contracts/chat/mention-tokens`, один источник для api,
 * web и моков). Упомянутый становится наблюдателем трэда (точка «есть новые»
 * + счётчик).
 *
 * Правило уведомлений — канон Slack: пинг получают только АКТИВНЫЕ
 * УЧАСТНИКИ этой беседы (кроме автора). Упомянутый не-участник и
 * деактивированный — валидная ссылка-чип на карточку сотрудника, но без
 * уведомления и наблюдения трэда. Точное угадывание «@Имя» по справочнику
 * (раунды 3–#100) упразднено: упоминание — только явный токен.
 */

import { extractMentionIds } from '@nodus/contracts';

import type { UserProfileReader } from '../../../core/ports/user-profile.port.js';
import type { ConversationsRepository } from '../conversations/conversations.repository.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import type { ThreadParticipantsRepository } from './thread-participants.repository.js';

/** userId упомянутых, кому летит уведомление: токены текста → активные
 *  участники беседы ∩ ≠ автор, в порядке появления. Справочник и состав
 *  читаются ДО транзакции отправки (текст известен заранее, второе
 *  соединение пула внутри tx голодает его — repro chat-reliability). */
export async function resolveMentionTargets(
  userProfiles: Pick<UserProfileReader, 'filterActiveUserIds'>,
  conversations: Pick<ConversationsRepository, 'listMembersPage'>,
  conversationId: string,
  text: string,
  authorId: string,
  tx?: TransactionClient,
): Promise<string[]> {
  const ids = extractMentionIds(text).filter((id) => id !== authorId);
  if (ids.length === 0) return [];
  // Фильтр «участник беседы» — готовый listMembersPage с searchUserIds
  // (канон Slack: «не в беседе» не пингуется).
  const memberRows = await conversations.listMembersPage(
    conversationId,
    { limit: ids.length + 1, searchUserIds: ids },
    tx,
  );
  const memberIds = memberRows.map((row) => row.userId);
  if (memberIds.length === 0) return [];
  const activeIds = await userProfiles.filterActiveUserIds(memberIds, tx);
  if (activeIds.length === 0) return [];
  const active = new Set(activeIds);
  return ids.filter((id) => active.has(id));
}

/** Упомянутые — наблюдатели трэда этого сообщения (для корневого — его
 *  будущего треда); автора упоминание не добавляет (он и так участник). */
export async function addMentionWatchers(
  threadParticipants: ThreadParticipantsRepository,
  tx: TransactionClient,
  threadRootId: string,
  mentionedIds: string[],
  authorId: string,
): Promise<void> {
  for (const mentionedId of mentionedIds) {
    if (mentionedId === authorId) continue;
    await threadParticipants.upsert(threadRootId, mentionedId, 'mentioned', tx);
  }
}
