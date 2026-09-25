// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { TooltipProvider } from '@nodus/ui/components/tooltip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, ConversationListItem } from '@nodus/contracts';

import { MessageReaders } from './message-readers.js';

/** useConversations мокается: тип беседы решает, рисуется ли строка. */
vi.mock('./api.js', () => ({
  useConversations: vi.fn(() => ({ data: undefined })),
}));

import { useConversations } from './api.js';

const useConversationsMock = useConversations as unknown as ReturnType<typeof vi.fn>;

const reader = (id: string, name: string): ChatMessage['author'] => ({
  id,
  displayName: name,
  avatarUrl: null,
});

const message = (readBy: ChatMessage['readBy']): ChatMessage => ({
  id: 'm1',
  conversationId: 'conv-1',
  author: { id: 'author', displayName: 'Автор', avatarUrl: null },
  text: 'текст',
  replyToId: null,
  reply: null,
  deletedAt: null,
  pinned: false,
  forwardedFrom: null,
  threadRootId: null,
  threadRepliesCount: 0,
  reactions: [],
  attachments: [],
  editedAt: null,
  readAt: readBy.length > 0 ? '2026-09-24T10:00:00Z' : null,
  readBy,
  createdAt: '2026-09-24T09:00:00Z',
});

/** Стаб API-семантики membersPreview: участники, включая автора сообщения
 *  (живой API отдаёт «кроме зрителя»; для своих сообщений зритель=автор —
 *  формула M фильтрует по автору, устойчива к обоим форматам). */
function stubConversation(type: ConversationListItem['type'], members: number): void {
  const others = Array.from({ length: members - 1 }, (_, i) => reader(`u-${i}`, `Участник ${i}`));
  useConversationsMock.mockReturnValue({
    data: {
      items: [{ id: 'conv-1', type, membersPreview: [reader('author', 'Автор'), ...others] }],
    },
  });
}

describe('MessageReaders (#102)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    useConversationsMock.mockReturnValue({ data: undefined });
  });

  it('пустой readBy — ничего не рендерится', () => {
    stubConversation('group', 6);
    const { container } = render(
      <TooltipProvider>
        <MessageReaders message={message([])} />
      </TooltipProvider>,
    );
    expect(container.querySelector('[data-slot="message-readers"]')).toBeNull();
  });

  it('до 5 прочитавших: аватарки + «Прочитано N» (буквальный критерий #102)', () => {
    stubConversation('group', 6);
    const { getByText, container } = render(
      <TooltipProvider>
        <MessageReaders message={message([reader('u-1', 'Первый Читатель')])} />
      </TooltipProvider>,
    );
    expect(getByText('Прочитано 1')).toBeTruthy();
    expect(container.querySelector('[data-slot="message-readers"]')).toBeTruthy();
  });

  it('больше 5 — «Прочитано N из M» (M = участники без автора)', () => {
    stubConversation('group', 8); // 7 не-авторов
    const readers = Array.from({ length: 6 }, (_, i) => reader(`r-${i}`, `Читатель ${i}`));
    const { getByText } = render(
      <TooltipProvider>
        <MessageReaders message={message(readers)} />
      </TooltipProvider>,
    );
    expect(getByText('Прочитано 6 из 7')).toBeTruthy();
  });

  it('direct — строка не рисуется (только галочки меты)', () => {
    stubConversation('direct', 2);
    const { container } = render(
      <MessageReaders message={message([reader('u-1', 'Собеседник')])} />,
    );
    expect(container.querySelector('[data-slot="message-readers"]')).toBeNull();
  });
});
