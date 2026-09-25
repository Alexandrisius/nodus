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
    insertMessage: vi.fn(async () => true),
    copyAttachments: vi.fn(),
    touchLastMessageAt: vi.fn(),
    countThreadReplies: vi.fn(),
    upsertThreadParticipant: vi.fn(),
    findForwardSources: vi.fn(async () => [
      { id: 'src-1', text: 'текст', deletedAt: null, authorId: 'a-1', threadRootId: null },
    ]),
  };
  const pins = { pinnedIds: vi.fn() };
  const conversations = {
    findMembership: vi.fn(async () => ({ role: 'owner' })),
    findTypeAndPermissions: vi.fn(async () => ({
      type: 'group',
      permissions: { post: 'member' },
    })),
    listMembers: vi.fn(async () => []),
    unsnooze: vi.fn(),
    revealHidden: vi.fn(),
  };
  const mapper = { toDtos: vi.fn() };
  const txRunner = { run: vi.fn((cb: (tx: string) => unknown) => cb(TX)) };
  const eventBus = { emit: vi.fn() };
  const userProfiles = { findRefs: vi.fn(async () => []) };
  const service = new MessageActionsService(
    messages as never,
    pins as never,
    conversations as never,
    mapper as never,
    txRunner as never,
    eventBus as never,
    userProfiles as never,
  );
  return { service, conversations };
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
