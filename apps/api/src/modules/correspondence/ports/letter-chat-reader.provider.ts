import { Injectable } from '@nestjs/common';
import type { LetterRef } from '@nodus/contracts';

import { canViewLetter } from '../access/letter-access.js';
import { LettersRepository } from '../letters/letters.repository.js';
import type {
  LetterChatReader,
  LetterChatRoster,
  LetterViewer,
} from './letter-chat-reader.port.js';

/**
 * Реализация порта письма для чата (#55, Р10): состав беседы (адресат —
 * владелец, участники — члены), ссылки для превью и видимость той же
 * функцией, что у карточки (Р7).
 */
@Injectable()
export class LetterChatReaderProvider implements LetterChatReader {
  constructor(private readonly letters: LettersRepository) {}

  async roster(letterId: string): Promise<LetterChatRoster | null> {
    const row = await this.letters.chatRoster(letterId);
    if (!row || row.registeredAt === null || !row.addresseeId) return null;
    const participants = await this.letters.participants(letterId);
    return {
      ownerId: row.addresseeId,
      members: participants.map((participant) => ({
        userId: participant.userId,
        muted: false,
      })),
    };
  }

  refs(ids: readonly string[]): Promise<LetterRef[]> {
    return this.letters.refs(ids) as Promise<LetterRef[]>;
  }

  async canView(letterId: string, viewer: LetterViewer): Promise<boolean> {
    const row = await this.letters.findDetailById(letterId);
    return Boolean(row && canViewLetter(viewer, row));
  }
}
