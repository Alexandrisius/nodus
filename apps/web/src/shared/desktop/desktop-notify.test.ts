// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QueryClient } from '@tanstack/react-query';

import { useAuthStore } from '../auth-store.js';
import { setOpenConversation } from '../chat/notifications.js';
import { setShellVisibleFromShell } from './desktop-bridge.js';
import { notifyDesktopMessage } from './desktop-notify.js';

/**
 * Гейты попапов оболочки (#254, ADR-0019): свои молчат; обычное сообщение —
 * тишина в muted/snoozed/видимой открытой беседе; важное пробивается
 * (зеркало B6 журнала). Опти-ин браузерных уведомлений не участвует.
 */

const ME = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const CONV = '00000000-0000-4000-8000-0000000000c1';

function installBridge() {
  const bridge = {
    shellVersion: '1.0.0',
    platform: 'windows',
    showPopup: vi.fn(async () => undefined),
    setUnreadBadge: vi.fn(async () => undefined),
    flashTaskbar: vi.fn(async () => undefined),
    openExternal: vi.fn(async () => undefined),
    getShellInfo: vi.fn(async () => ({ version: '1.0.0', platform: 'windows' })),
    shellReady: vi.fn(async () => undefined),
    onEvent: vi.fn(() => () => undefined),
  };
  window.nodusDesktop = bridge;
  return bridge;
}

function messagePayload(overrides: Record<string, unknown> = {}) {
  return {
    conversationId: CONV,
    messageId: '00000000-0000-4000-8000-0000000000ff',
    seq: 1,
    authorId: OTHER,
    threadRootId: null,
    forwarded: false,
    urgent: false,
    mentionedUserIds: [],
    message: {
      id: '00000000-0000-4000-8000-0000000000ff',
      conversationId: CONV,
      seq: 1,
      clientMessageId: 'cli-1',
      author: { id: OTHER, displayName: 'Иван Петрович Смирнов', avatarUrl: null },
      text: 'Доброе утро',
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
      readAt: null,
      readBy: [],
      urgent: false,
      mentionedUserIds: [],
      linkPreview: null,
      createdAt: new Date().toISOString(),
    },
    ...overrides,
  };
}

function queryClientWith(flags: { muted?: boolean; snoozed?: boolean } | null): QueryClient {
  return {
    getQueryData: () =>
      flags === null
        ? undefined
        : { items: [{ id: CONV, muted: flags.muted ?? false, snoozed: flags.snoozed ?? false }] },
  } as unknown as QueryClient;
}

beforeEach(() => {
  installBridge();
  setOpenConversation(null);
  setShellVisibleFromShell(true);
  useAuthStore.setState({ user: { id: ME, displayName: 'Я', avatarUrl: null } } as never);
});

describe('notifyDesktopMessage', () => {
  it('чужое сообщение в фоне → попап с именем без отчества и миганием', () => {
    setShellVisibleFromShell(false);
    notifyDesktopMessage(messagePayload(), queryClientWith({}));
    expect(window.nodusDesktop?.showPopup).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Иван Петрович',
        preview: 'Доброе утро',
        urgent: false,
        canReply: true,
        conversationId: CONV,
      }),
    );
    expect(window.nodusDesktop?.flashTaskbar).toHaveBeenCalledWith(false);
  });

  it('своё сообщение — тишина', () => {
    setShellVisibleFromShell(false);
    notifyDesktopMessage(
      messagePayload({
        authorId: ME,
        message: {
          ...messagePayload().message,
          author: { id: ME, displayName: 'Я', avatarUrl: null },
        },
      }),
      queryClientWith({}),
    );
    expect(window.nodusDesktop?.showPopup).not.toHaveBeenCalled();
  });

  it('обычное молчит в заглушённой беседе', () => {
    setShellVisibleFromShell(false);
    notifyDesktopMessage(messagePayload(), queryClientWith({ muted: true }));
    expect(window.nodusDesktop?.showPopup).not.toHaveBeenCalled();
  });

  it('обычное молчит в «Посмотреть позже»', () => {
    setShellVisibleFromShell(false);
    notifyDesktopMessage(messagePayload(), queryClientWith({ snoozed: true }));
    expect(window.nodusDesktop?.showPopup).not.toHaveBeenCalled();
  });

  it('обычное молчит, когда пользователь смотрит в портал (окно в фокусе)', () => {
    // jsdom: hasFocus() по умолчанию false — мокаем «смотрит» явно.
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    try {
      notifyDesktopMessage(messagePayload(), queryClientWith({}));
      expect(window.nodusDesktop?.showPopup).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('обычное звонит, когда окно видимо, но без фокуса (другое приложение)', () => {
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    try {
      notifyDesktopMessage(messagePayload(), queryClientWith({}));
      expect(window.nodusDesktop?.showPopup).toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('важное пробивает mute, snooze и открытую беседу; мигание критичное', () => {
    setOpenConversation(CONV);
    const urgent = messagePayload({
      urgent: true,
      message: { ...messagePayload().message, urgent: true },
    });
    notifyDesktopMessage(urgent, queryClientWith({ muted: true, snoozed: true }));
    expect(window.nodusDesktop?.showPopup).toHaveBeenCalledWith(
      expect.objectContaining({ urgent: true }),
    );
    expect(window.nodusDesktop?.flashTaskbar).toHaveBeenCalledWith(true);
  });

  it('пустой текст заменяется заглушкой вложения', () => {
    setShellVisibleFromShell(false);
    const withAttachment = messagePayload({
      message: { ...messagePayload().message, text: '' },
    });
    notifyDesktopMessage(withAttachment, queryClientWith({}));
    expect(window.nodusDesktop?.showPopup).toHaveBeenCalledWith(
      expect.objectContaining({ preview: expect.any(String) }),
    );
  });
});

describe('в браузере без моста', () => {
  it('гейты даже не вычисляются — вызов тихий', () => {
    delete window.nodusDesktop;
    expect(() => notifyDesktopMessage(messagePayload(), queryClientWith({}))).not.toThrow();
  });
});
