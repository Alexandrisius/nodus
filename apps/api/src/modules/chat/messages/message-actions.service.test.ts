import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ForwardMessagesBody } from '@nodus/contracts';

import { MessageActionsService } from './message-actions.service.js';

/**
 * Пересылка минимальным хэппи-путем: проверяется побочный эффект revealHidden
 * (#103: активность раскрывает беседу скрывшим) в той же транзакции —
 * полный контракт пересылки покрыт integration-тестами чата.
 */

const ME = 'me-1';
const TARGET = 'conv-target';
const SOURCE = 'conv-source';
const TX = 'TX';

function makeService() {
  const messages = {
    allocateSeqs: vi.fn(async () => [8n, 9n, 10n]),
    // Возвращает вставленную строку (не true): payload читает clientMessageId (#239).
    insertMessage: vi.fn(async (draft: Record<string, unknown>) => ({ ...draft })),
    copyAttachments: vi.fn(),
    touchLastMessageAt: vi.fn(),
    countThreadReplies: vi.fn(),
    countAllThreadReplies: vi.fn(),
    attachmentsFor: vi.fn(async () => []),
    findByIdInConversation: vi.fn(),
    findForwardSources: vi.fn(async () => [
      { id: 'src-1', text: 'текст', deletedAt: null, authorId: 'a-1', threadRootId: null },
    ]),
  };
  const pins = { pinnedIds: vi.fn() };
  const threadParticipants = { upsert: vi.fn() };
  const conversations = {
    findMembership: vi.fn(async () => ({ role: 'owner' })),
    findTypeAndPermissions: vi.fn(async () => ({
      type: 'group',
      permissions: { post: 'member' },
    })),
    listMembers: vi.fn(async () => []),
    listMembersPage: vi.fn(async (_c: string, opts: { searchUserIds?: string[] }) =>
      (opts.searchUserIds ?? []).map((userId) => ({ userId, role: 'member' })),
    ),
    unsnooze: vi.fn(),
    revealHidden: vi.fn(),
  };
  const mapper = { toDtos: vi.fn(), toFreshDto: vi.fn() };
  const txRunner = { run: vi.fn((cb: (tx: string) => unknown) => cb(TX)) };
  const eventBus = { emit: vi.fn() };
  const userProfiles = {
    findRefs: vi.fn(async () => []),
    filterActiveUserIds: vi.fn(async (ids: string[]) => ids),
  };
  const service = new MessageActionsService(
    messages as never,
    pins as never,
    conversations as never,
    mapper as never,
    txRunner as never,
    eventBus as never,
    userProfiles as never,
    threadParticipants as never,
    {
      applyMessageSent: vi.fn(async () => {}),
      applyMessageEdited: vi.fn(async () => {}),
      applyMessageDeleted: vi.fn(async () => {}),
      applyForwardCopies: vi.fn(async () => {}),
    } as never,
  );
  return { service, conversations, messages, mapper, eventBus, userProfiles };
}

describe('MessageActionsService.forward — раскрытие скрытой беседы (#103)', () => {
  let conversations: ReturnType<typeof makeService>['conversations'];
  let service: MessageActionsService;

  beforeEach(() => {
    vi.clearAllMocks();
    ({ service, conversations } = makeService());
  });

  it('пересылка раскрывает беседу-приёмник в той же транзакции', async () => {
    const body: ForwardMessagesBody = {
      sourceConversationId: SOURCE,
      messageIds: ['src-1'],
      comment: 'вот это',
    };
    await service.forward(ME, TARGET, body, 'fwd-key');
    expect(conversations.unsnooze).toHaveBeenCalledWith(TARGET, ME, TX);
    expect(conversations.revealHidden).toHaveBeenCalledWith(TARGET, TX);
  });
});

describe('MessageActionsService.forward — payload DTO (раунд 3)', () => {
  it('профили читаются ПО соединению транзакции (tx), не общим пулом', async () => {
    const { service, messages, mapper } = makeService();
    messages.insertMessage.mockImplementation((async (input: { id: string; seq: bigint }) => ({
      id: input.id,
      conversationId: TARGET,
      seq: input.seq,
      authorId: ME,
      clientMessageId: 'k:0',
      text: 'текст',
      replyToId: null,
      replySnapshot: null,
      threadRootId: null,
      fwdConversationId: SOURCE,
      fwdMessageId: 'src-1',
      fwdAuthorId: 'a-1',
      fwdThreadRootId: null,
      editedAt: null,
      deletedAt: null,
      obliterated: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })) as never);
    mapper.toFreshDto.mockResolvedValue({} as never);
    await service.forward(
      ME,
      TARGET,
      { sourceConversationId: SOURCE, messageIds: ['src-1'] },
      'key-tx',
    );
    expect(mapper.toFreshDto).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tx: TX }),
    );
  });
});

describe('MessageActionsService.forward — упоминания комментария (#239)', () => {
  const ALICE = '33333333-3333-4333-8333-333333333333';
  it('токен комментария: снимок строки и payload несут упомянутых; копии — нет', async () => {
    const { service, messages, eventBus } = makeService();
    const body: ForwardMessagesBody = {
      sourceConversationId: SOURCE,
      messageIds: ['src-1'],
      comment: `Привет @[Алиса](user:${ALICE})`,
    };

    await service.forward(ME, TARGET, body, 'fwd-key');

    // Строка комментария (fwd=null) — снимок упомянутых; копия пересылки — [].
    const commentInsert = messages.insertMessage.mock.calls.find(([draft]) => draft.fwd === null)!;
    expect(commentInsert[0]!.mentionedUserIds).toEqual([ALICE]);
    const copyInsert = messages.insertMessage.mock.calls.find(([draft]) => draft.fwd !== null)!;
    expect(copyInsert[0]!.mentionedUserIds).toEqual([]);

    // Событие отправки комментария несёт mentionedUserIds (fanout #100).
    const sent = eventBus.emit.mock.calls.filter(([, type]) => type === 'chat.message_sent');
    const commentEvent = sent.find(([, , payload]) => payload.forwarded === false)!;
    expect(commentEvent[2]!.mentionedUserIds).toEqual([ALICE]);
  });
});
