// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LetterDetail } from '@nodus/contracts';

import { initialTabs, type LetterTabsState } from '../../lib/letter-tabs.js';
import { LetterSideTabs } from './letter-side-tabs.js';

/** Чат и просмотр документа в этом тесте не рендерим: проверяем полосу и тоггл. */
vi.mock('../../../../shared/chat/chat-queries.js', () => ({
  useLetterConversation: () => ({ data: { id: 'conv-1', unreadCount: 0 } }),
}));
vi.mock('../../../../shared/chat/conversation-pane.js', () => ({
  ConversationPane: () => <div>лента</div>,
}));
vi.mock('../letter-body-view.js', () => ({
  LetterBodyView: () => <div>документ</div>,
}));

const LETTER = {
  id: 'letter-1',
  typeId: 'type-1',
  direction: 'incoming',
  attachments: [],
  body: { kind: 'none' },
  access: { isParticipant: true, canJoin: false },
} as unknown as LetterDetail;

const tabs: LetterTabsState = { ...initialTabs('chat'), visited: ['body', 'chat'] };

afterEach(cleanup);

describe('карточка письма — панель беседы как в мессенджере (#55)', () => {
  it('на вкладке «Чат» есть тоггл панели, на «Письме» — нет', () => {
    const { rerender } = render(
      <LetterSideTabs
        letter={LETTER}
        tabs={tabs}
        joining={false}
        panelOpen={false}
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onJoin={vi.fn()}
        onPanelToggle={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Панель беседы' })).not.toBeNull();

    rerender(
      <LetterSideTabs
        letter={LETTER}
        tabs={{ ...tabs, active: 'body' }}
        joining={false}
        panelOpen={false}
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onJoin={vi.fn()}
        onPanelToggle={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Панель беседы' })).toBeNull();
  });

  it('клик по тогглу открывает панель (состояние у карточки)', () => {
    const onPanelToggle = vi.fn();
    render(
      <LetterSideTabs
        letter={LETTER}
        tabs={tabs}
        joining={false}
        panelOpen={false}
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onJoin={vi.fn()}
        onPanelToggle={onPanelToggle}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Панель беседы' }));
    expect(onPanelToggle).toHaveBeenCalledTimes(1);
  });
});
