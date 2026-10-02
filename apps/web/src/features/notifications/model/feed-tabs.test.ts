import { beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationTabsEnvelopeSchema } from '../../../shared/lib/persist-zod.js';

import {
  ensureActiveTab,
  isSystemTabId,
  isValidTabName,
  matchesCustomTab,
  resolveTabs,
  type CustomFeedTab,
} from './feed-tabs.js';
import { useNotificationTabsStore } from './tabs-prefs-store.js';
import type { Notification } from '@nodus/contracts';

function notif(kind: Notification['kind'], priority: Notification['priority']): Notification {
  return {
    id: `${kind}-${priority}`,
    seq: 1,
    priority,
    kind,
    sourceType: 'conversation',
    sourceId: '11111111-1111-1111-1111-111111111111',
    actor: null,
    preview: null,
    urgentText: null,
    conversationId: null,
    conversationTitle: null,
    messageId: null,
    threadRootId: null,
    createdAt: new Date().toISOString(),
    readAt: null,
    ackAt: null,
  };
}

const TAB_POSTS: CustomFeedTab = {
  id: 't1',
  name: 'Посты каналов',
  kinds: ['chat.channel_post'],
  priorities: [],
};
const TAB_IMPORTANT: CustomFeedTab = {
  id: 't2',
  name: 'Важное',
  kinds: [],
  priorities: ['urgent', 'high'],
};

describe('feed-tabs: кастомные фильтры', () => {
  it('фильтр по kind: пост канала матчится, правка — нет', () => {
    expect(matchesCustomTab(TAB_POSTS, notif('chat.channel_post', 'low'))).toBe(true);
    expect(matchesCustomTab(TAB_POSTS, notif('chat.message_edited', 'low'))).toBe(false);
  });

  it('фильтр по priority без kind', () => {
    expect(matchesCustomTab(TAB_IMPORTANT, notif('urgent.message', 'urgent'))).toBe(true);
    expect(matchesCustomTab(TAB_IMPORTANT, notif('chat.channel_post', 'low'))).toBe(false);
  });

  it('обе оси независимы: пересечение kind И priority', () => {
    const tab: CustomFeedTab = {
      id: 't3',
      name: 'X',
      kinds: ['chat.channel_post'],
      priorities: ['high'],
    };
    expect(matchesCustomTab(tab, notif('chat.channel_post', 'high'))).toBe(true);
    expect(matchesCustomTab(tab, notif('chat.channel_post', 'low'))).toBe(false);
    expect(matchesCustomTab(tab, notif('chat.mention', 'high'))).toBe(false);
  });

  it('пустые списки = «любой» (вкладка без фильтра)', () => {
    const tab: CustomFeedTab = { id: 't4', name: 'Всё-всё', kinds: [], priorities: [] };
    expect(matchesCustomTab(tab, notif('chat.channel_post', 'low'))).toBe(true);
    expect(matchesCustomTab(tab, notif('urgent.message', 'urgent'))).toBe(true);
  });
});

describe('feed-tabs: правила защиты и резолв', () => {
  it('«Все» нельзя скрыть: скрытые системные фильтруются только urgent/mentions', () => {
    const tabs = resolveTabs([], ['all', 'urgent']);
    expect(tabs.map((t) => t.id)).toEqual(['all', 'mentions']);
  });

  it('скрытые системные исчезают; кастомные идут после системных', () => {
    const tabs = resolveTabs([TAB_POSTS], ['mentions']);
    expect(tabs.map((t) => t.id)).toEqual(['all', 'urgent', 't1']);
  });

  it('ensureActiveTab: удалённая/скрытая активная → «Все»', () => {
    const tabs = resolveTabs([TAB_POSTS], []);
    expect(ensureActiveTab('t1', tabs)).toBe('t1');
    expect(ensureActiveTab('t1', resolveTabs([], []))).toBe('all');
    expect(ensureActiveTab('mentions', resolveTabs([], ['mentions']))).toBe('all');
  });

  it('isSystemTabId / isValidTabName', () => {
    expect(isSystemTabId('all')).toBe(true);
    expect(isSystemTabId('t1')).toBe(false);
    expect(isValidTabName('  ')).toBe(false);
    expect(isValidTabName('Посты каналов')).toBe(true);
    expect(isValidTabName('а'.repeat(41))).toBe(false);
  });
});

describe('tabs-prefs-store: CRUD + persist-валидация', () => {
  beforeEach(() => {
    useNotificationTabsStore.setState({ custom: [], hiddenSystem: [] });
    vi.clearAllMocks();
  });

  it('add/update/remove кастомной вкладки', () => {
    const s = useNotificationTabsStore.getState();
    s.addTab('Посты', ['chat.channel_post'], []);
    let state = useNotificationTabsStore.getState();
    expect(state.custom).toHaveLength(1);
    expect(state.custom[0]!.name).toBe('Посты');
    s.updateTab(state.custom[0]!.id, { name: 'Посты каналов', kinds: [], priorities: ['low'] });
    state = useNotificationTabsStore.getState();
    expect(state.custom[0]!.name).toBe('Посты каналов');
    expect(state.custom[0]!.priorities).toEqual(['low']);
    s.removeTab(state.custom[0]!.id);
    expect(useNotificationTabsStore.getState().custom).toHaveLength(0);
  });

  it('hide/show системной; повторное скрытие — no-op', () => {
    const s = useNotificationTabsStore.getState();
    s.hideSystemTab('mentions');
    expect(useNotificationTabsStore.getState().hiddenSystem).toEqual(['mentions']);
    s.hideSystemTab('mentions');
    expect(useNotificationTabsStore.getState().hiddenSystem).toEqual(['mentions']);
    s.showSystemTab('mentions');
    expect(useNotificationTabsStore.getState().hiddenSystem).toEqual([]);
  });

  it('envelope: сломанное состояние отбрасывается целиком, валидное читается', () => {
    expect(notificationTabsEnvelopeSchema.safeParse({ custom: 'мусор' }).success).toBe(true); // catch([]) — дефолт
    expect(notificationTabsEnvelopeSchema.parse({}).custom).toEqual([]);
    const parsed = notificationTabsEnvelopeSchema.safeParse({
      custom: [{ id: 't1', name: 'П', kinds: ['chat.mention'], priorities: ['high'] }],
      hiddenSystem: ['urgent'],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.custom[0]!.kinds).toEqual(['chat.mention']);
      expect(parsed.data.hiddenSystem).toEqual(['urgent']);
    }
  });

  it('envelope: «all» не проходит схему скрытых', () => {
    const parsed = notificationTabsEnvelopeSchema.safeParse({ custom: [], hiddenSystem: ['all'] });
    // catch([]) на hiddenSystem: невалидное значение → дефолт (Все всегда видна)
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.hiddenSystem).toEqual([]);
  });
});
