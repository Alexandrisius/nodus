import type { ConversationListItem } from '@nodus/contracts';
import { ErrorCode } from '@nodus/contracts';
import { http, HttpResponse } from 'msw';

import { demoConversations } from '../../../../shared/mocks/data/chat.js';
import {
  canSeeProject,
  demoProjectRoster,
  isDemoProjectParticipant,
  projectRefOf,
} from '../../../../shared/mocks/data/project-views.js';
import { findDemoProjectRow } from '../../../../shared/mocks/data/projects.js';
import { userRef } from '../../../../shared/mocks/data/users.js';
import { getMockActor } from '../../../../shared/mocks/mock-actor.js';

/** Канал проекта (#52, Р8): find-or-create беседы `project_channel` по
 *  проекту; не участнику проекта и невидимому секретному — 404 без оракула
 *  (к каналу присоединиться нельзя — только через вступление в проект). */
export const projectConversationHandlers = [
  http.get('/api/v1/chat/conversations/by-project/:projectId', ({ params }) => {
    const projectId = String(params.projectId);
    const row = findDemoProjectRow(projectId);
    const actor = getMockActor();
    if (!row || !canSeeProject(row, actor) || !isDemoProjectParticipant(projectId, actor)) {
      return HttpResponse.json(
        { code: ErrorCode.NOT_FOUND, message: 'Conversation not found' },
        { status: 404 },
      );
    }
    const roster = demoProjectRoster(projectId);
    if (!roster) {
      return HttpResponse.json(
        { code: ErrorCode.NOT_FOUND, message: 'Conversation not found' },
        { status: 404 },
      );
    }
    const memberIds = [...new Set([roster.managerId, ...roster.memberIds])];
    const members = memberIds.map(userRef);
    const title = `Проект: ${row.name}`;
    const existing = demoConversations.find(
      (conversation) =>
        conversation.type === 'project_channel' && conversation.project?.id === projectId,
    );
    if (existing) {
      existing.title = title;
      existing.project = projectRefOf(row);
      existing.membersPreview = members;
      existing.membersCount = members.length;
      existing.myRole = actor.id === roster.managerId ? 'owner' : 'member';
      return HttpResponse.json(existing);
    }
    const conversation: ConversationListItem = {
      id: crypto.randomUUID(),
      type: 'project_channel',
      title,
      avatarUrl: null,
      myRole: actor.id === roster.managerId ? 'owner' : 'member',
      permissions: {
        changeInfo: 'admin',
        addMembers: 'member',
        removeMembers: 'admin',
        post: 'member',
        manageSettings: 'owner',
      },
      draft: null,
      visibility: 'closed',
      description: null,
      project: projectRefOf(row),
      task: null,
      letter: null,
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
