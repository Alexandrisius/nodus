import type { ConversationListItem } from '@nodus/contracts';
import { conversationInfoBodySchema, ErrorCode } from '@nodus/contracts';

import { http, HttpResponse } from 'msw';

import { demoConversations } from '../../../../shared/mocks/data/chat.js';
import { demoUserListItems, userRef } from '../../../../shared/mocks/data/users.js';
import { actorUserRef, getMockActor } from '../../../../shared/mocks/mock-actor.js';
import { mockMemberRole, setMockMemberRole } from './chat-mock-state.js';

/** Мутации настроек и состава беседы (#186): участники, название, аватар.
 *  Мутации — только группы и каналы: зеркало API-гварда restrictTypes
 *  (переименование/аватар #186, участники #195). */
function notGroupChannel(conversation: ConversationListItem | undefined) {
  return conversation && conversation.type !== 'group' && conversation.type !== 'project_channel'
    ? HttpResponse.json(
        {
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Action is not supported for this conversation type',
        },
        { status: 400 },
      )
    : null;
}

export const conversationMutationHandlers = [
  /** Участники беседы — мок-стор ролей поверх membersPreview; владелец
   *  — создатель (у созданных моком бесед это актёр), прочие — участники. */
  http.get('/api/v1/chat/conversations/:id/members', ({ params, request }) => {
    const conversation = demoConversations.find((c) => c.id === params.id);
    if (!conversation)
      return HttpResponse.json(
        { code: ErrorCode.NOT_FOUND, message: 'Conversation not found' },
        { status: 404 },
      );
    const url = new URL(request.url);
    const search = (url.searchParams.get('search') ?? '').trim().toLowerCase();
    const actorId = getMockActor().id;
    const rows = [
      { user: actorUserRef(), role: mockMemberRole(conversation.id, actorId, 'owner') },
      ...conversation.membersPreview
        .filter((m) => m.id !== actorId)
        .map((m) => ({
          user: m,
          role: mockMemberRole(conversation.id, m.id, 'member'),
        })),
    ].filter((row) => !search || row.user.displayName.toLowerCase().includes(search));
    return HttpResponse.json({
      items: rows.map((row) => ({
        ...row,
        joinedAt: new Date('2026-09-01T09:00:00Z').toISOString(),
      })),
      nextCursor: null,
    });
  }),

  http.post('/api/v1/chat/conversations/:id/members', async ({ params, request }) => {
    const conversation = demoConversations.find((c) => c.id === params.id);
    if (!conversation)
      return HttpResponse.json(
        { code: ErrorCode.NOT_FOUND, message: 'Conversation not found' },
        { status: 404 },
      );
    const restricted = notGroupChannel(conversation);
    if (restricted) return restricted;
    const body = (await request.json()) as { userIds?: string[] };
    const actorId = getMockActor().id;
    for (const id of body.userIds ?? []) {
      if (id === actorId || conversation.membersPreview.some((m) => m.id === id)) continue;
      const person = demoUserListItems.find((u) => u.id === id);
      if (!person) continue;
      conversation.membersPreview.push(userRef(id));
      conversation.membersCount += 1;
    }
    return HttpResponse.json(conversation);
  }),

  http.patch('/api/v1/chat/conversations/:id/members/:userId', async ({ params, request }) => {
    const conversation = demoConversations.find((c) => c.id === params.id);
    const restricted = notGroupChannel(conversation);
    if (restricted) return restricted;
    const body = (await request.json()) as { role?: 'admin' | 'member' };
    if (body.role) setMockMemberRole(String(params.id), String(params.userId), body.role);
    const user = conversation?.membersPreview.find((m) => m.id === params.userId);
    if (!conversation || !user)
      return HttpResponse.json(
        { code: ErrorCode.NOT_FOUND, message: 'Member not found' },
        { status: 404 },
      );
    return HttpResponse.json({
      user,
      role: body.role ?? 'member',
      joinedAt: new Date('2026-09-01T09:00:00Z').toISOString(),
    });
  }),

  http.delete('/api/v1/chat/conversations/:id/members/:userId', ({ params }) => {
    const conversation = demoConversations.find((c) => c.id === params.id);
    if (!conversation)
      return HttpResponse.json(
        { code: ErrorCode.NOT_FOUND, message: 'Conversation not found' },
        { status: 404 },
      );
    const restricted = notGroupChannel(conversation);
    if (restricted) return restricted;
    const before = conversation.membersPreview.length;
    conversation.membersPreview = conversation.membersPreview.filter((m) => m.id !== params.userId);
    conversation.membersCount -= before - conversation.membersPreview.length;
    return new HttpResponse(null, { status: 204 });
  }),

  /** Переименование (#186). */
  http.patch('/api/v1/chat/conversations/:id/info', async ({ params, request }) => {
    const parsed = conversationInfoBodySchema.safeParse(await request.json());
    if (!parsed.success)
      return HttpResponse.json(
        { code: ErrorCode.VALIDATION_FAILED, message: 'Invalid body' },
        { status: 422 },
      );
    const conversation = demoConversations.find((c) => c.id === params.id);
    if (!conversation)
      return HttpResponse.json(
        { code: ErrorCode.NOT_FOUND, message: 'Conversation not found' },
        { status: 404 },
      );
    const restricted = notGroupChannel(conversation);
    if (restricted) return restricted;
    conversation.title = parsed.data.title;
    return HttpResponse.json(conversation);
  }),

  /** Аватар беседы (#186): мок берёт previewUrl из формы как url (объектная
   *  ссылка страницы — контракт загрузок мок-режима). */
  http.post('/api/v1/chat/conversations/:id/avatar', async ({ params, request }) => {
    const conversation = demoConversations.find((c) => c.id === params.id);
    if (!conversation)
      return HttpResponse.json(
        { code: ErrorCode.NOT_FOUND, message: 'Conversation not found' },
        { status: 404 },
      );
    const restricted = notGroupChannel(conversation);
    if (restricted) return restricted;
    const form = await request.formData();
    const previewUrl = String(form.get('previewUrl') ?? '');
    if (previewUrl) conversation.avatarUrl = previewUrl;
    return HttpResponse.json(conversation);
  }),

  http.delete('/api/v1/chat/conversations/:id/avatar', ({ params }) => {
    const conversation = demoConversations.find((c) => c.id === params.id);
    if (!conversation)
      return HttpResponse.json(
        { code: ErrorCode.NOT_FOUND, message: 'Conversation not found' },
        { status: 404 },
      );
    const restricted = notGroupChannel(conversation);
    if (restricted) return restricted;
    conversation.avatarUrl = null;
    return HttpResponse.json(conversation);
  }),
];
