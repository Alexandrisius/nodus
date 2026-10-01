/**
 * @упоминания в тексте сообщения (раунд 3): «@Имя» — точное совпадение
 * ФИО/имени/фамилии сотрудника; упомянутый становится наблюдателем трэда
 * (точка «есть новые» + счётчик). Выпадающий список-подсказка — задел будущей
 * линии; здесь — только парсирование токенов, соответствие решает справочник
 * (порт USER_PROFILE_READER, ADR-0012).
 */

/** Токен упоминания: @ + буквы/цифры/точка/дефис/подчёркивание (без пробелов —
 *  ФИО из нескольких слов в v1 не парсится, только имя/фамилия/логин целиком).
 *  Lookbehind отсекает email (a@b.by) и «@» в середине слова: упоминание
 *  начинается с начала строки/пробела/знака. */
const MENTION_RE = /(?<![\p{L}\p{M}\p{N}._-])@([\p{L}\p{M}\p{N}._-]+)/gu;

/** Ограничение на токены одного сообщения (защита от «@ всех подряд»). */
export const MENTION_TOKENS_MAX = 20;

/** Уникальные токены упоминаний в порядке появления (без «@»). */
export function parseMentionTokens(text: string): string[] {
  const tokens: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(MENTION_RE)) {
    const token = match[1];
    if (!token || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
    if (tokens.length >= MENTION_TOKENS_MAX) break;
  }
  return tokens;
}

import type { UserProfileReader } from '../../../core/ports/user-profile.port.js';
import type { TransactionClient } from '../../../core/database/transaction-runner.js';
import type { ThreadParticipantsRepository } from './thread-participants.repository.js';

/** userId точных @совпадений (раунд 3 + #100): приоритет ФИО > имя >
 *  фамилия, ТОЧНОЕ совпадение без регистра; дедуп; автора здесь не фильтруем
 *  (наблюдателя-автора не добавляет сервис отправки). Вынесено из сервиса
 *  (I5: файл перевалил порог 500 кодовых строк). */
export async function resolveMentionMatches(
  userProfiles: UserProfileReader,
  text: string,
): Promise<string[]> {
  const tokens = parseMentionTokens(text);
  if (tokens.length === 0) return [];
  const lower = new Set(tokens.map((t) => t.toLowerCase()));
  const matches = await userProfiles.findMentionMatches(tokens);
  const mentioned: string[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    const exact =
      lower.has(match.displayName.toLowerCase()) ||
      lower.has(match.firstName.toLowerCase()) ||
      lower.has(match.lastName.toLowerCase());
    if (!exact || seen.has(match.ref.id)) continue;
    seen.add(match.ref.id);
    mentioned.push(match.ref.id);
  }
  return mentioned;
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
