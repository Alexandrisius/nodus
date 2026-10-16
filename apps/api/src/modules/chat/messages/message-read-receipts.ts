import type { MemberRow } from '../conversations/conversations.repository.js';
import type { MessageRow } from './message-row.js';

/**
 * Прочитанность СВОИХ сообщений (модель Битрикс24/Telegram, #102): прочитавшим
 * считается участник с lastReadSeq >= seq, прочитавший ПОСЛЕ правки
 * (editedAt; «повторный пуш прочитавшим», решение #41). readAt — момент
 * ПЕРВОГО прочитавшего (min; в direct он единственный); readBy — все
 * прочитавшие на момент выдачи, по времени прочтения. Для чужих сообщений
 * readAt=null, readBy=[] (прочитавших видит только автор).
 */
export function computeReadAt(
  row: Pick<MessageRow, 'authorId' | 'seq' | 'editedAt' | 'createdAt'>,
  members: MemberRow[],
  viewerId: string,
): string | null {
  if (row.authorId !== viewerId) return null;
  if (!members.some((m) => m.userId !== row.authorId)) {
    return row.createdAt.toISOString(); // «Избранное» (одиночная беседа)
  }
  let firstReaderAt: Date | null = null;
  for (const reader of readCursors(row, members)) {
    if (firstReaderAt === null || reader.lastReadAt < firstReaderAt) {
      firstReaderAt = reader.lastReadAt;
    }
  }
  return firstReaderAt?.toISOString() ?? null;
}

/** Прочитавшие своё сообщение (userId по возрастанию времени прочтения). */
export function computeReadBy(
  row: Pick<MessageRow, 'authorId' | 'seq' | 'editedAt'>,
  members: MemberRow[],
  viewerId: string,
): { userId: string; lastReadAt: Date }[] {
  if (row.authorId !== viewerId) return [];
  return readCursors(row, members).sort((a, b) => a.lastReadAt.getTime() - b.lastReadAt.getTime());
}

function readCursors(
  row: Pick<MessageRow, 'authorId' | 'seq' | 'editedAt'>,
  members: MemberRow[],
): { userId: string; lastReadAt: Date }[] {
  const readers: { userId: string; lastReadAt: Date }[] = [];
  for (const other of members) {
    if (other.userId === row.authorId) continue;
    const readCurrent = other.lastReadSeq >= row.seq;
    const readAfterEdit =
      row.editedAt === null || (other.lastReadAt !== null && other.lastReadAt >= row.editedAt);
    if (readCurrent && readAfterEdit && other.lastReadAt !== null) {
      readers.push({ userId: other.userId, lastReadAt: other.lastReadAt });
    }
  }
  return readers;
}
