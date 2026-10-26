import type { ConversationListItem } from '@nodus/contracts';
import { ErrorCode } from '@nodus/contracts';
import { http, HttpResponse } from 'msw';

import { demoConversations } from '../../../../shared/mocks/data/chat.js';
import {
  canSeeLetter,
  findLetter,
  letterMemberIds,
  letterRefOf,
} from '../../../../shared/mocks/data/letters.js';
import { userRef } from '../../../../shared/mocks/data/users.js';
import { getMockActor } from '../../../../shared/mocks/mock-actor.js';

/** Чат письма (#55, Р10): find-or-create беседы `type='letter'` по письму с
 *  синхронизацией состава (адресат + присоединившиеся; регистратор — нет,
 *  В2). Не участнику и невидимого письма — 404 без оракула. */
export const letterConversationHandlers = [
  http.get('/api/v1/chat/conversations/by-letter/:letterId', ({ params }) => {
    const letter = findLetter(String(params.letterId));
    const actor = getMockActor();
    const memberIds = letter ? letterMemberIds(letter) : [];
    if (!letter || !canSeeLetter(letter, actor) || !memberIds.includes(actor.id)) {
      return HttpResponse.json(
        { code: ErrorCode.NOT_FOUND, message: 'Conversation not found' },
        { status: 404 },
      );
    }
    const members = memberIds.map(userRef);
    const existing = demoConversations.find(
      (c) => c.type === 'letter' && c.letter?.id === letter.id,
    );
    if (existing) {
      existing.membersPreview = members;
      existing.membersCount = members.length;
      existing.letter = letterRefOf(letter);
      return HttpResponse.json(existing);
    }
    const conversation: ConversationListItem = {
      id: crypto.randomUUID(),
      type: 'letter',
      title: null,
      avatarUrl: null,
      myRole: 'member',
      permissions: {
        changeInfo: 'admin',
        addMembers: 'member',
        removeMembers: 'admin',
        post: 'member',
        manageSettings: 'owner',
      },
      draft: null,
      visibility: null,
      description: null,
      project: letter.project,
      task: null,
      letter: letterRefOf(letter),
      membersPreview: members,
      membersCount: members.length,
      lastMessage: null,
      lastActivityAt: null,
      unreadCount: 0,
      myLastReadSeq: 0,
      pinned: false,
      muted: false,
      snoozed: false,
    };
    demoConversations.push(conversation);
    return HttpResponse.json(conversation);
  }),
];
