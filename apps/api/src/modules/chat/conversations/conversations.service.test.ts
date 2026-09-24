import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHAT_EVENTS,
  ErrorCode,
  type CreateConversationBody,
  type ListConversationsQuery,
} from '@nodus/contracts';

import { encodeCursor } from '../../../core/pagination/cursor.util.js';
import { DEFAULT_CONVERSATION_PERMISSIONS } from '../permissions.js';
import { ConversationsService } from './conversations.service.js';
import type { ConversationListRow } from './conversations.repository.js';

const TX = 'tx-handle';

function makeListRow(overrides: Partial<ConversationListRow> = {}): ConversationListRow {
  return {
    id: 'conv-1',
    type: 'group',
    title: 'Группа',
    description: null,
    visibility: 'closed',
    permissions: DEFAULT_CONVERSATION_PERMISSIONS,
    last_message_at: new Date('2026-09-24T10:00:00Z'),
    role: 'owner',
    pinned: false,
    muted: false,
    snoozed: false,
    draft_text: null,
    draft_revision: null,
    draft_updated_at: null,
    unread_count: 0,
    lm_id: null,
    lm_seq: null,
    lm_author_id: null,
    lm_text: null,
    lm_reply_to_id: null,
    lm_reply_snapshot: null,
    lm_thread_root_id: null,
    lm_fwd_conversation_id: null,
    lm_fwd_message_id: null,
    lm_fwd_author_id: null,
    lm_fwd_thread_root_id: null,
    lm_edited_at: null,
    lm_deleted_at: null,
    lm_created_at: null,
    ...overrides,
  };
}

describe('ConversationsService', () => {
  const repo = {
    listForUser: vi.fn(),
    findListItem: vi.fn(),
    findMembership: vi.fn(),
    findOrCreateDirect: vi.fn(),
    createGroup: vi.fn(),
    updateMemberSettings: vi.fn(),
    listMembers: vi.fn(),
    putDraft: vi.fn(),
  };
  const items = { toItem: vi.fn() };
  const txRunner = { run: vi.fn((cb: (tx: string) => unknown) => cb(TX)) };
  const eventBus = { emit: vi.fn() };
  const userProfiles = { findRefs: vi.fn(), searchByDisplayName: vi.fn() };

  let service: ConversationsService;

  beforeEach(() => {
    vi.clearAllMocks();
    items.toItem.mockImplementation(async (row: { id: string }) => ({ id: row.id }));
    repo.listMembers.mockResolvedValue([]);
    repo.findListItem.mockImplementation(async (conversationId: string) =>
      makeListRow({ id: conversationId }),
    );
    userProfiles.findRefs.mockResolvedValue([]);
    service = new ConversationsService(
      repo as never,
      items as never,
      txRunner as never,
      eventBus as never,
      userProfiles as never,
    );
  });

  describe('list', () => {
    it('без курсора и поиска → cursor/search undefined в репозитории, nextCursor null', async () => {
      repo.listForUser.mockResolvedValue([makeListRow()]);

      const page = await service.list('me-1', { limit: 50 });

      expect(repo.listForUser).toHaveBeenCalledWith(
        'me-1',
        expect.objectContaining({
          limit: 50,
          cursor: undefined,
          searchTitle: undefined,
          searchUserIds: undefined,
        }),
      );
      expect(userProfiles.searchByDisplayName).not.toHaveBeenCalled();
      expect(page.items).toEqual([{ id: 'conv-1' }]);
      expect(page.nextCursor).toBeNull();
    });

    it('валидный курсор декодируется по схеме и уходит в репозиторий', async () => {
      repo.listForUser.mockResolvedValue([]);
      const cursor = encodeCursor({
        at: '2026-09-24T10:00:00.000Z',
        id: '11111111-1111-4111-8111-111111111111',
      });

      await service.list('me-1', { limit: 50, cursor });

      expect(repo.listForUser).toHaveBeenCalledWith(
        'me-1',
        expect.objectContaining({
          cursor: { at: '2026-09-24T10:00:00.000Z', id: '11111111-1111-4111-8111-111111111111' },
        }),
      );
    });

    it('поиск → searchByDisplayName(query, 100), ids переданы в репозиторий', async () => {
      repo.listForUser.mockResolvedValue([]);
      userProfiles.searchByDisplayName.mockResolvedValue([
        { id: 'u-2', displayName: 'Петров Пётр', avatarUrl: null },
        { id: 'u-3', displayName: 'Сидоров Пётр', avatarUrl: null },
      ]);

      await service.list('me-1', { limit: 50, search: 'Петров' });

      expect(userProfiles.searchByDisplayName).toHaveBeenCalledWith('Петров', 100);
      expect(repo.listForUser).toHaveBeenCalledWith(
        'me-1',
        expect.objectContaining({ searchTitle: 'Петров', searchUserIds: ['u-2', 'u-3'] }),
      );
    });

    it('hasMore (limit+1) → items ровно limit, nextCursor по последней строке страницы', async () => {
      repo.listForUser.mockResolvedValue([
        makeListRow({ id: 'c1' }),
        makeListRow({ id: 'c2', last_message_at: new Date('2026-09-24T09:00:00Z') }),
        makeListRow({ id: 'c3', last_message_at: new Date('2026-09-24T08:00:00Z') }),
      ]);

      const page = await service.list('me-1', { limit: 2 } as ListConversationsQuery);

      expect(page.items.map((item) => item.id)).toEqual(['c1', 'c2']);
      expect(page.nextCursor).toBe(encodeCursor({ at: '2026-09-24T09:00:00.000Z', id: 'c2' }));
    });
  });

  describe('create', () => {
    const body: CreateConversationBody = {
      type: 'group',
      title: 'Проект',
      memberIds: ['u-1', 'u-1', 'me-1', 'ghost-id'],
      permissions: { post: 'admin' },
    };

    it('дедуп участников, создатель и неизвестные исключены', async () => {
      repo.createGroup.mockResolvedValue('conv-new');
      userProfiles.findRefs.mockResolvedValue([
        { id: 'u-1', displayName: 'Один', avatarUrl: null },
      ]);

      const item = await service.create('me-1', body);

      expect(userProfiles.findRefs).toHaveBeenCalledWith(['u-1', 'u-1', 'me-1', 'ghost-id']);
      expect(repo.createGroup).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'group',
          title: 'Проект',
          createdBy: 'me-1',
          memberIds: ['u-1'],
          permissions: { ...DEFAULT_CONVERSATION_PERMISSIONS, post: 'admin' },
        }),
        TX,
      );
      expect(item).toEqual({ id: 'conv-new' });
    });

    it('события CONVERSATION_CREATED и MEMBER_ADDED — в той же транзакции', async () => {
      repo.createGroup.mockResolvedValue('conv-new');
      userProfiles.findRefs.mockResolvedValue([
        { id: 'u-1', displayName: 'Один', avatarUrl: null },
      ]);

      await service.create('me-1', body);

      expect(eventBus.emit).toHaveBeenNthCalledWith(
        1,
        TX,
        CHAT_EVENTS.CONVERSATION_CREATED,
        {
          conversationId: 'conv-new',
          type: 'group',
          title: 'Проект',
          createdBy: 'me-1',
          memberIds: ['me-1', 'u-1'],
        },
        expect.objectContaining({
          actorId: 'me-1',
          aggregateType: 'conversation',
          aggregateId: 'conv-new',
        }),
      );
      expect(eventBus.emit).toHaveBeenNthCalledWith(
        2,
        TX,
        CHAT_EVENTS.MEMBER_ADDED,
        { conversationId: 'conv-new', userIds: ['u-1'], role: 'member' },
        expect.anything(),
      );
    });

    it('без участников → MEMBER_ADDED не эмитится', async () => {
      repo.createGroup.mockResolvedValue('conv-new');

      await service.create('me-1', { type: 'project_channel', title: 'Канал' });

      expect(repo.createGroup).toHaveBeenCalledWith(expect.objectContaining({ memberIds: [] }), TX);
      expect(eventBus.emit).toHaveBeenCalledTimes(1);
      expect(eventBus.emit).toHaveBeenCalledWith(
        TX,
        CHAT_EVENTS.CONVERSATION_CREATED,
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('findOrCreateDirect', () => {
    it('порт не нашёл peer → NOT_FOUND "User not found", транзакции нет', async () => {
      userProfiles.findRefs.mockResolvedValue([]);

      await expect(service.findOrCreateDirect('me-1', 'ghost-id')).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
        message: 'User not found',
      });
      expect(txRunner.run).not.toHaveBeenCalled();
    });

    it('пара существует (created: false) → событие НЕ эмитится', async () => {
      userProfiles.findRefs.mockResolvedValue([{ id: 'u-2', displayName: 'Два', avatarUrl: null }]);
      repo.findOrCreateDirect.mockResolvedValue({ id: 'conv-d', created: false });

      const result = await service.findOrCreateDirect('me-1', 'u-2');

      expect(result.created).toBe(false);
      expect(result.item).toEqual({ id: 'conv-d' });
      expect(repo.findOrCreateDirect).toHaveBeenCalledWith('me-1', 'u-2', TX);
      expect(eventBus.emit).not.toHaveBeenCalled();
    });

    it('создан direct → CONVERSATION_CREATED с дедупом [создатель, peer]', async () => {
      userProfiles.findRefs.mockResolvedValue([{ id: 'me-1', displayName: 'Я', avatarUrl: null }]);
      repo.findOrCreateDirect.mockResolvedValue({ id: 'conv-n', created: true });

      await service.findOrCreateDirect('me-1', 'me-1'); // «Заметки»: peer = сам

      expect(eventBus.emit).toHaveBeenCalledWith(
        TX,
        CHAT_EVENTS.CONVERSATION_CREATED,
        expect.objectContaining({ memberIds: ['me-1'] }),
        expect.anything(),
      );
    });
  });

  describe('patch / putDraft', () => {
    it('patch: не член → NOT_FOUND, настройки не трогаются', async () => {
      repo.findMembership.mockResolvedValue(null);

      await expect(service.patch('me-1', 'conv-1', { pinned: true })).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
        message: 'Conversation not found',
      });
      expect(repo.updateMemberSettings).not.toHaveBeenCalled();
    });

    it('patch: член → настройки прокинуты в репозиторий', async () => {
      repo.findMembership.mockResolvedValue({ conversationId: 'conv-1', userId: 'me-1' });

      const item = await service.patch('me-1', 'conv-1', { pinned: true, muted: true });

      expect(repo.updateMemberSettings).toHaveBeenCalledWith('conv-1', 'me-1', {
        pinned: true,
        muted: true,
      });
      expect(item).toEqual({ id: 'conv-1' });
    });

    it('putDraft: не член → NOT_FOUND', async () => {
      repo.findMembership.mockResolvedValue(null);

      await expect(service.putDraft('me-1', 'conv-1', 'Черновик')).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
      expect(repo.putDraft).not.toHaveBeenCalled();
    });

    it('putDraft: черновик замаплен (updatedAt → ISO); пустой ответ → null', async () => {
      repo.findMembership.mockResolvedValue({ conversationId: 'conv-1', userId: 'me-1' });
      repo.putDraft.mockResolvedValue({
        text: 'Черновик',
        revision: 3,
        updatedAt: new Date('2026-09-24T12:00:00Z'),
      });

      const draft = await service.putDraft('me-1', 'conv-1', 'Черновик');

      expect(repo.putDraft).toHaveBeenCalledWith('conv-1', 'me-1', 'Черновик');
      expect(draft).toEqual({
        text: 'Черновик',
        revision: 3,
        updatedAt: '2026-09-24T12:00:00.000Z',
      });

      repo.putDraft.mockResolvedValue(null);
      expect(await service.putDraft('me-1', 'conv-1', '')).toBeNull();
    });
  });
});
