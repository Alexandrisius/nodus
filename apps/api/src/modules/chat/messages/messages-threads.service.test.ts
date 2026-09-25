import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '@nodus/contracts';

import { MessagesService } from './messages.service.js';
import type { MemberRow } from '../conversations/conversations.repository.js';
import type { MessageRow } from './messages.repository.js';

/** Треды раунда 3 на сервисе сообщений: @упоминания → наблюдатели,
 *  квитанция из треда (watermark трэда), watch-toggle и состояния. */

const TX = 'tx-handle';
const CONV = '00000000-0000-4000-8000-0000000000c1';
const ME = '00000000-0000-4000-8000-0000000000a1';
const ROOT = '00000000-0000-4000-8000-0000000000r1';

const now = new Date('2026-09-25T10:00:00Z');

function makeMessage(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: 'msg-1',
    conversationId: CONV,
    seq: 7n,
    authorId: ME,
    clientMessageId: 'k',
    text: 'текст',
    replyToId: null,
    replySnapshot: null,
    threadRootId: null,
    fwdConversationId: null,
    fwdMessageId: null,
    fwdAuthorId: null,
    fwdThreadRootId: null,
    editedAt: null,
    deletedAt: null,
    obliterated: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeMember(overrides: Partial<MemberRow> = {}): MemberRow {
  return {
    conversationId: CONV,
    userId: 'peer',
    role: 'member',
    lastReadSeq: 0n,
    lastReadAt: null,
    pinned: false,
    muted: false,
    snoozed: false,
    hidden: false,
    ...overrides,
  };
}

describe('MessagesService: трэды раунда 3', () => {
  const repo = {
    findExisting: vi.fn(),
    findByIdInConversation: vi.fn(),
    allocateSeqs: vi.fn(),
    insertMessage: vi.fn(),
    claimAttachments: vi.fn(),
    touchLastMessageAt: vi.fn(),
    countThreadReplies: vi.fn(),
    attachmentsFor: vi.fn(),
    updateEditText: vi.fn(),
    tombstone: vi.fn(),
    deletePinByMessage: vi.fn(),
    markRepliesDeleted: vi.fn(),
    advanceReadCursor: vi.fn(),
  };
  const conversations = {
    findMembership: vi.fn(),
    findTypeAndPermissions: vi.fn(),
    findLastSeq: vi.fn(),
    listMembers: vi.fn(),
    clearDraft: vi.fn(),
    unsnooze: vi.fn(),
    revealHidden: vi.fn(),
  };
  const mapper = { toDtos: vi.fn(), toFreshDto: vi.fn() };
  const threadParticipants = {
    upsert: vi.fn(),
    delete: vi.fn(),
    findLastRead: vi.fn(),
    advanceReadCursor: vi.fn(),
    states: vi.fn(),
  };
  const txRunner = { run: vi.fn((cb: (tx: string) => unknown) => cb(TX)) };
  const eventBus = { emit: vi.fn() };
  const userProfiles = {
    findRefs: vi.fn(),
    searchByDisplayName: vi.fn(),
    findMentionMatches: vi.fn(),
  };
  let service: MessagesService;

  beforeEach(() => {
    vi.clearAllMocks();
    conversations.findMembership.mockResolvedValue(makeMember({ userId: ME, role: 'owner' }));
    conversations.findTypeAndPermissions.mockResolvedValue({
      id: CONV,
      type: 'group',
      permissions: { post: 'member' },
    });
    conversations.listMembers.mockResolvedValue([]);
    repo.findExisting.mockResolvedValue(null);
    repo.insertMessage.mockResolvedValue(makeMessage({ id: 'msg-new', seq: 7n }));
    service = new MessagesService(
      repo as never,
      conversations as never,
      mapper as never,
      txRunner as never,
      eventBus as never,
      userProfiles as never,
      threadParticipants as never,
    );
  });

  describe('send: @упоминания', () => {
    it('упомянутый точным именем становится наблюдателем трэда сообщения', async () => {
      userProfiles.findMentionMatches.mockResolvedValue([
        {
          ref: { id: 'user-anna', displayName: 'Анна Первая', avatarUrl: null },
          displayName: 'Анна Первая',
          firstName: 'Анна',
          lastName: 'Первая',
        },
        {
          ref: { id: 'user-boris', displayName: 'Борис Второй', avatarUrl: null },
          displayName: 'Борис Второй',
          firstName: 'Борис',
          lastName: 'Второй',
        },
      ]);
      await service.send(ME, CONV, { text: 'спросим @Анна' }, 'key-mention');
      expect(threadParticipants.upsert).toHaveBeenCalledWith(
        'msg-new',
        'user-anna',
        'mentioned',
        TX,
      );
      expect(threadParticipants.upsert).toHaveBeenCalledTimes(1);
    });

    it('ответ в трэд: реплайер — участник, watermark трэда доходит до своего ответа', async () => {
      repo.findByIdInConversation.mockImplementation(async (_c: string, id: string) =>
        id === ROOT ? makeMessage({ id: ROOT, seq: 2n, authorId: 'author' }) : null,
      );
      await service.send(ME, CONV, { text: 'мой ответ', threadRootId: ROOT }, 'key-reply');
      expect(threadParticipants.upsert).toHaveBeenCalledWith(ROOT, ME, 'replier', TX);
      expect(threadParticipants.upsert).toHaveBeenCalledWith(ROOT, 'author', 'author', TX);
      expect(threadParticipants.advanceReadCursor).toHaveBeenCalledWith(ROOT, ME, 7n, TX);
    });

    it('текст без @ — справочник не читается', async () => {
      await service.send(ME, CONV, { text: 'без упоминаний' }, 'key-plain');
      expect(userProfiles.findMentionMatches).not.toHaveBeenCalled();
      expect(threadParticipants.upsert).not.toHaveBeenCalled();
    });
  });

  describe('readConversation: квитанция из треда', () => {
    it('threadRootId двигает watermark трэда вместе с watermark беседы', async () => {
      conversations.findLastSeq.mockResolvedValue(10n);
      repo.advanceReadCursor.mockResolvedValue({ advanced: true, lastReadAt: null });
      repo.findByIdInConversation.mockResolvedValue(
        makeMessage({ id: ROOT, seq: 2n, threadRootId: null }),
      );
      await service.readConversation(ME, CONV, 8, ROOT);
      expect(threadParticipants.advanceReadCursor).toHaveBeenCalledWith(ROOT, ME, 8n, TX);
    });

    it('threadRootId не корень этой беседы → NOT_FOUND, watermark трэда не тронут', async () => {
      conversations.findLastSeq.mockResolvedValue(10n);
      repo.findByIdInConversation.mockResolvedValue(
        makeMessage({ id: 'reply-1', threadRootId: ROOT }),
      );
      await expect(service.readConversation(ME, CONV, 8, 'reply-1')).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
      expect(threadParticipants.advanceReadCursor).not.toHaveBeenCalled();
    });
  });

  describe('watchThread / threadStates', () => {
    it('toggle: нет строки → watcher вставлен (watching:true); есть → снят (false)', async () => {
      repo.findByIdInConversation.mockResolvedValue(makeMessage({ id: ROOT, threadRootId: null }));
      threadParticipants.findLastRead.mockResolvedValueOnce(null);
      await expect(service.watchThread(ME, CONV, ROOT)).resolves.toEqual({ watching: true });
      expect(threadParticipants.upsert).toHaveBeenCalledWith(ROOT, ME, 'watcher', TX);

      threadParticipants.findLastRead.mockResolvedValueOnce(5n);
      await expect(service.watchThread(ME, CONV, ROOT)).resolves.toEqual({ watching: false });
      expect(threadParticipants.delete).toHaveBeenCalledWith(ROOT, ME, TX);
    });

    it('не член беседы / не корень → NOT_FOUND', async () => {
      conversations.findMembership.mockResolvedValue(null);
      await expect(service.watchThread(ME, CONV, ROOT)).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
      conversations.findMembership.mockResolvedValue(makeMember({ userId: ME }));
      repo.findByIdInConversation.mockResolvedValue(null);
      await expect(service.watchThread(ME, CONV, ROOT)).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
      });
    });

    it('threadStates — снапшот из репозитория после проверки членства', async () => {
      threadParticipants.states.mockResolvedValue([
        { threadRootId: ROOT, watched: true, unreadCount: 2 },
      ]);
      await expect(service.threadStates(ME, CONV)).resolves.toEqual([
        { threadRootId: ROOT, watched: true, unreadCount: 2 },
      ]);
      expect(threadParticipants.states).toHaveBeenCalledWith(CONV, ME);
    });
  });
});
