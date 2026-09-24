// >300 строк — обоснование (I5): полный контракт send/edit/delete/batch сервиса одного агрегата.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_EVENTS, ErrorCode, type SendMessageBody } from '@nodus/contracts';

import { DEFAULT_CONVERSATION_PERMISSIONS } from '../permissions.js';
import { MessagesService } from './messages.service.js';
import type { MemberRow } from '../conversations/conversations.repository.js';
import type { MessageRow } from './messages.repository.js';

const CONV = 'conv-1';
const ME = 'me-1';
const PEER = 'peer-1';
const TX = 'tx-handle';

function makeMessage(overrides: Partial<MessageRow> = {}): MessageRow {
  const now = new Date('2026-09-24T09:00:00Z');
  return {
    id: 'msg-1',
    conversationId: CONV,
    seq: 3n,
    authorId: ME,
    clientMessageId: 'key-1',
    text: 'Текст',
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
    userId: PEER,
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

describe('MessagesService', () => {
  const repo = {
    findExisting: vi.fn(),
    findByIdInConversation: vi.fn(),
    allocateSeqs: vi.fn(),
    insertMessage: vi.fn(),
    claimAttachments: vi.fn(),
    touchLastMessageAt: vi.fn(),
    upsertThreadParticipant: vi.fn(),
    countThreadReplies: vi.fn(),
    attachmentsFor: vi.fn(),
    updateEditText: vi.fn(),
    tombstone: vi.fn(),
    deletePinByMessage: vi.fn(),
    markRepliesDeleted: vi.fn(),
  };
  const conversations = {
    findMembership: vi.fn(),
    findTypeAndPermissions: vi.fn(),
    listMembers: vi.fn(),
    clearDraft: vi.fn(),
    unsnooze: vi.fn(),
  };
  const mapper = { toDtos: vi.fn() };
  const txRunner = { run: vi.fn((cb: (tx: string) => unknown) => cb(TX)) };
  const eventBus = { emit: vi.fn() };
  let service: MessagesService;

  beforeEach(() => {
    vi.clearAllMocks();
    conversations.findMembership.mockResolvedValue(makeMember({ userId: ME, role: 'owner' }));
    conversations.findTypeAndPermissions.mockResolvedValue({
      id: CONV,
      type: 'group',
      permissions: { ...DEFAULT_CONVERSATION_PERMISSIONS },
    });
    conversations.listMembers.mockResolvedValue([]);
    repo.findExisting.mockResolvedValue(null);
    repo.findByIdInConversation.mockResolvedValue(null);
    repo.allocateSeqs.mockResolvedValue(7n);
    repo.insertMessage.mockResolvedValue(makeMessage({ id: 'msg-new', seq: 7n }));
    repo.tombstone.mockImplementation(async (_c: string, id: string, obliterated: boolean) =>
      makeMessage({ id, obliterated, deletedAt: new Date('2026-09-24T14:00:00Z') }),
    );
    service = new MessagesService(
      repo as never,
      conversations as never,
      mapper as never,
      txRunner as never,
      eventBus as never,
    );
  });

  describe('send', () => {
    it('не член беседы → NOT_FOUND, до транзакции не доходит', async () => {
      conversations.findMembership.mockResolvedValue(null);
      await expect(service.send(ME, CONV, { text: 'Привет' }, 'key-1')).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
        message: 'Conversation not found',
      });
      expect(repo.findExisting).not.toHaveBeenCalled();
    });

    it('replay того же ключа в этой беседе → replayed:true, БЕЗ side-effects', async () => {
      const existing = makeMessage({ id: 'msg-old', seq: 3n });
      repo.findExisting.mockResolvedValue(existing);

      const result = await service.send(ME, CONV, { text: 'Повтор' }, 'key-1');

      expect(repo.findExisting).toHaveBeenCalledWith(ME, 'key-1', TX);
      expect(result).toMatchObject({ replayed: true, message: existing });
      expect(repo.insertMessage).not.toHaveBeenCalled();
      expect(repo.claimAttachments).not.toHaveBeenCalled();
      expect(repo.touchLastMessageAt).not.toHaveBeenCalled();
      expect(conversations.clearDraft).not.toHaveBeenCalled();
      expect(conversations.unsnooze).not.toHaveBeenCalled();
      expect(eventBus.emit).not.toHaveBeenCalled();
    });

    it('replay в ДРУГОЙ беседе → CONFLICT', async () => {
      repo.findExisting.mockResolvedValue(makeMessage({ conversationId: 'conv-other' }));
      await expect(service.send(ME, CONV, { text: 'Повтор' }, 'key-1')).rejects.toMatchObject({
        code: ErrorCode.CONFLICT,
        message: 'Idempotency-Key already used for another message',
      });
    });

    it('member при post=admin на корень ленты → FORBIDDEN; в тред — можно', async () => {
      conversations.findMembership.mockResolvedValue(makeMember({ userId: ME, role: 'member' }));
      conversations.findTypeAndPermissions.mockResolvedValue({
        id: CONV,
        type: 'group',
        permissions: { ...DEFAULT_CONVERSATION_PERMISSIONS, post: 'admin' },
      });
      await expect(service.send(ME, CONV, { text: 'Пост' }, 'key-1')).rejects.toMatchObject({
        code: ErrorCode.FORBIDDEN,
        message: 'Posting in this conversation requires permission',
      });
      expect(repo.insertMessage).not.toHaveBeenCalled();

      repo.findByIdInConversation.mockImplementation(async (_c: string, id: string) =>
        id === 'root-1' ? makeMessage({ id: 'root-1', seq: 1n, authorId: PEER }) : null,
      );
      repo.insertMessage.mockResolvedValue(
        makeMessage({ id: 'msg-t', seq: 7n, threadRootId: 'root-1' }),
      );
      repo.countThreadReplies.mockResolvedValue(1);

      const ok = await service.send(ME, CONV, { text: 'Ответ', threadRootId: 'root-1' }, 'key-2');

      expect(ok.replayed).toBe(false);
      expect(repo.touchLastMessageAt).not.toHaveBeenCalled();
      // Автор корня (PEER) — участник 'author' с первого ответа; отвечающий — 'replier'.
      expect(repo.upsertThreadParticipant).toHaveBeenCalledWith('root-1', PEER, 'author', TX);
      expect(repo.upsertThreadParticipant).toHaveBeenCalledWith('root-1', ME, 'replier', TX);
      expect(eventBus.emit).toHaveBeenCalledTimes(1); // только MESSAGE_SENT, без THREAD_CREATED
      expect(eventBus.emit).toHaveBeenCalledWith(
        TX,
        CHAT_EVENTS.MESSAGE_SENT,
        expect.objectContaining({ messageId: 'msg-t', seq: 7, threadRootId: 'root-1' }),
        expect.anything(),
      );
    });

    it('threadRoot не существует или сам является ответом → NOT_FOUND "Thread root not found"', async () => {
      repo.findByIdInConversation.mockResolvedValue(
        makeMessage({ id: 'r', threadRootId: 'root-0' }),
      );
      await expect(
        service.send(ME, CONV, { text: 'Ответ', threadRootId: 'r' }, 'k1'),
      ).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
        message: 'Thread root not found',
      });
      await expect(
        service.send(ME, CONV, { text: 'Ответ', threadRootId: 'ghost' }, 'k2'),
      ).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
        message: 'Thread root not found',
      });
      expect(repo.insertMessage).not.toHaveBeenCalled();
    });

    it('цитата: удалённый оригинал → снапшот-надгробие; живой → усечённый текст и вид вложения', async () => {
      repo.findByIdInConversation.mockResolvedValue(
        makeMessage({ id: 'orig-1', authorId: PEER, text: 'Было', deletedAt: new Date() }),
      );
      repo.insertMessage.mockResolvedValue(
        makeMessage({ id: 'msg-r', seq: 7n, replyToId: 'orig-1' }),
      );

      await service.send(
        ME,
        CONV,
        { text: 'Ответ', replyToId: 'orig-1', quoteText: 'цитата' },
        'key-3',
      );

      expect(repo.attachmentsFor).not.toHaveBeenCalled(); // у надгробия вложения не читаются
      expect(repo.insertMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          replyToId: 'orig-1',
          replySnapshot: { authorId: PEER, text: '', quoteText: null, attachmentKind: null },
        }),
        TX,
      );

      repo.findByIdInConversation.mockResolvedValue(
        makeMessage({ id: 'orig-2', authorId: PEER, text: 'х'.repeat(200) }),
      );
      repo.attachmentsFor.mockResolvedValue([
        {
          messageId: 'orig-2',
          id: 'a1',
          name: 'фото.png',
          size: 1,
          mime: 'image/png',
          kind: 'image',
          width: null,
          height: null,
          sortOrder: 0,
        },
      ]);
      repo.insertMessage.mockResolvedValue(
        makeMessage({ id: 'msg-r2', seq: 7n, replyToId: 'orig-2' }),
      );

      await service.send(ME, CONV, { text: 'Ответ', replyToId: 'orig-2' }, 'key-4');

      expect(repo.insertMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          replySnapshot: {
            authorId: PEER,
            text: 'х'.repeat(160),
            quoteText: null,
            attachmentKind: 'image',
          },
        }),
        TX,
      );
    });

    it('обычная отправка: seq, вложения, гашение черновика/снуза, активность, MESSAGE_SENT', async () => {
      const body: SendMessageBody = { text: 'Привет', attachmentIds: ['att-1'] };

      const result = await service.send(ME, CONV, body, 'key-5');

      expect(result).toMatchObject({ replayed: false, message: { id: 'msg-new' } });
      expect(repo.insertMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: CONV,
          authorId: ME,
          clientMessageId: 'key-5',
          text: 'Привет',
          seq: 7n,
          threadRootId: null,
          replySnapshot: null,
        }),
        TX,
      );
      expect(repo.claimAttachments).toHaveBeenCalledWith('msg-new', ['att-1'], ME, TX);
      expect(conversations.clearDraft).toHaveBeenCalledWith(CONV, ME, TX);
      expect(conversations.unsnooze).toHaveBeenCalledWith(CONV, ME, TX);
      expect(repo.touchLastMessageAt).toHaveBeenCalledWith(CONV, TX);
      expect(repo.upsertThreadParticipant).not.toHaveBeenCalled();
      expect(eventBus.emit).toHaveBeenCalledWith(
        TX,
        CHAT_EVENTS.MESSAGE_SENT,
        {
          conversationId: CONV,
          messageId: 'msg-new',
          seq: 7,
          authorId: ME,
          threadRootId: null,
          forwarded: false,
        },
        expect.objectContaining({ actorId: ME, aggregateType: 'conversation', aggregateId: CONV }),
      );
    });
  });

  describe('edit', () => {
    it('сообщение не найдено / не автор → NOT_FOUND / FORBIDDEN без UPDATE', async () => {
      repo.findByIdInConversation.mockResolvedValue(null);
      await expect(service.edit(ME, CONV, 'msg-1', 'Новый')).rejects.toMatchObject({
        code: ErrorCode.NOT_FOUND,
        message: 'Message not found',
      });
      repo.findByIdInConversation.mockResolvedValue(makeMessage({ authorId: PEER }));
      await expect(service.edit(ME, CONV, 'msg-1', 'Новый')).rejects.toMatchObject({
        code: ErrorCode.FORBIDDEN,
        message: 'Only author can modify this message',
      });
      expect(repo.updateEditText).not.toHaveBeenCalled();
    });

    it('пересланную копию не правит даже переславший (#111)', async () => {
      conversations.findMembership.mockResolvedValue(makeMember({ userId: ME }));
      repo.findByIdInConversation.mockResolvedValue(
        makeMessage({
          id: 'msg-fwd',
          authorId: ME,
          fwdMessageId: 'src-msg',
          fwdConversationId: 'src-conv',
          fwdAuthorId: PEER,
        }),
      );
      await expect(service.edit(ME, CONV, 'msg-fwd', 'переписанное чужое')).rejects.toMatchObject({
        code: ErrorCode.FORBIDDEN,
        message: 'Forwarded messages cannot be edited',
      });
      expect(repo.updateEditText).not.toHaveBeenCalled();
      expect(eventBus.emit).not.toHaveBeenCalled();
    });

    it('тот же текст → без UPDATE и без события', async () => {
      const message = makeMessage({ text: 'Привет' });
      repo.findByIdInConversation.mockResolvedValue(message);

      const result = await service.edit(ME, CONV, 'msg-1', 'Привет');

      expect(repo.updateEditText).not.toHaveBeenCalled();
      expect(eventBus.emit).not.toHaveBeenCalled();
      expect(result.message).toEqual(message);
    });

    it('другой текст → updateEditText + MESSAGE_EDITED с editedAt', async () => {
      repo.findByIdInConversation.mockResolvedValue(makeMessage({ text: 'Привет' }));
      repo.updateEditText.mockResolvedValue(
        makeMessage({ text: 'Новый', editedAt: new Date('2026-09-24T13:00:00Z') }),
      );

      const result = await service.edit(ME, CONV, 'msg-1', 'Новый');

      expect(repo.updateEditText).toHaveBeenCalledWith(CONV, 'msg-1', ME, 'Новый', TX);
      expect(result.message.text).toBe('Новый');
      expect(eventBus.emit).toHaveBeenCalledWith(
        TX,
        CHAT_EVENTS.MESSAGE_EDITED,
        { conversationId: CONV, messageId: 'msg-1', editedAt: '2026-09-24T13:00:00.000Z' },
        expect.anything(),
      );
    });
  });

  describe('delete', () => {
    it('никто не прочитал → obliterated=true; unpin и пометка цитат в обоих случаях', async () => {
      repo.findByIdInConversation.mockResolvedValue(makeMessage({ seq: 3n }));
      conversations.listMembers.mockResolvedValue([
        makeMember({ userId: ME }),
        makeMember({ lastReadSeq: 2n }),
      ]);

      const result = await service.delete(ME, CONV, 'msg-1');

      expect(result.obliterated).toBe(true);
      expect(repo.tombstone).toHaveBeenCalledWith(CONV, 'msg-1', true, TX);
      expect(repo.deletePinByMessage).toHaveBeenCalledWith('msg-1', TX);
      expect(repo.markRepliesDeleted).toHaveBeenCalledWith('msg-1', TX);
      expect(eventBus.emit).toHaveBeenCalledWith(
        TX,
        CHAT_EVENTS.MESSAGE_DELETED,
        { conversationId: CONV, messageId: 'msg-1', obliterated: true },
        expect.anything(),
      );
    });

    it('хоть один прочитал (курсор >= seq) → obliterated=false', async () => {
      repo.findByIdInConversation.mockResolvedValue(makeMessage({ seq: 3n }));
      conversations.listMembers.mockResolvedValue([
        makeMember({ userId: ME }),
        makeMember({ lastReadSeq: 3n }),
      ]);

      const result = await service.delete(ME, CONV, 'msg-1');

      expect(result.obliterated).toBe(false);
      expect(repo.tombstone).toHaveBeenCalledWith(CONV, 'msg-1', false, TX);
      expect(repo.deletePinByMessage).toHaveBeenCalledWith('msg-1', TX);
      expect(repo.markRepliesDeleted).toHaveBeenCalledWith('msg-1', TX);
    });
  });

  describe('batchDelete', () => {
    it('чужие/несуществующие/удалённые — молча; результат {removed, tombstones} по своим', async () => {
      const byId: Record<string, MessageRow | null> = {
        'own-unread': makeMessage({ id: 'own-unread', seq: 10n }),
        foreign: makeMessage({ id: 'foreign', authorId: PEER, seq: 11n }),
        ghost: null,
        'own-deleted': makeMessage({ id: 'own-deleted', seq: 12n, deletedAt: new Date() }),
        'own-read': makeMessage({ id: 'own-read', seq: 2n }),
      };
      repo.findByIdInConversation.mockImplementation(
        async (_c: string, id: string) => byId[id] ?? null,
      );
      conversations.listMembers.mockResolvedValue([
        makeMember({ userId: ME }),
        makeMember({ lastReadSeq: 5n }),
      ]);

      const result = await service.batchDelete(ME, CONV, [
        'own-unread',
        'foreign',
        'ghost',
        'own-deleted',
        'own-read',
      ]);

      expect(result.removed).toEqual(['own-unread']);
      expect(result.tombstones).toHaveLength(1);
      expect(result.tombstones[0]?.message.id).toBe('own-read');
      expect(repo.tombstone).toHaveBeenCalledTimes(2);
      expect(repo.tombstone).toHaveBeenCalledWith(CONV, 'own-unread', true, TX);
      expect(repo.tombstone).toHaveBeenCalledWith(CONV, 'own-read', false, TX);
      expect(repo.deletePinByMessage).toHaveBeenCalledTimes(2);
      expect(repo.markRepliesDeleted).toHaveBeenCalledTimes(2);
    });
  });
});
