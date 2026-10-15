// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../auth-store.js';
import {
  acquireOpenConversation,
  disableNotifications,
  enableNotifications,
  getOpenConversation,
  notificationsEnabled,
  resetOpenConversationRegistry,
  shouldNotify,
} from './notifications.js';

/**
 * Гейт уведомлений фоновой вкладки (#124): opt-in, чужое сообщение, фоновая
 * вкладка ИЛИ неоткрытая беседа.
 */

import { isDesktopShell } from '../desktop/desktop-bridge.js';

const ME = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const CONV = '00000000-0000-4000-8000-0000000000c1';

class NotificationStub {
  static permission = 'granted';
  static requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
  constructor(
    public title: string,
    public options?: NotificationOptions,
  ) {}
}

beforeEach(() => {
  localStorage.clear();
  resetOpenConversationRegistry();
  Object.defineProperty(document, 'hidden', { value: false, configurable: true });
  vi.stubGlobal('Notification', NotificationStub);
  useAuthStore.setState({
    user: { id: ME, displayName: 'Я', email: 'me@nodus.by', permissions: [] },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useAuthStore.setState({ user: null });
});

describe('уведомления чата (#124)', () => {
  it('без opt-in — тишина даже в фоне', async () => {
    expect(notificationsEnabled()).toBe(false);
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    expect(shouldNotify(OTHER, CONV)).toBe(false);
    expect(await enableNotifications()).toBe(true);
    expect(notificationsEnabled()).toBe(true);
    expect(shouldNotify(OTHER, CONV)).toBe(true);
    disableNotifications();
    expect(shouldNotify(OTHER, CONV)).toBe(false);
  });

  it('в десктоп-оболочке браузерные уведомления выключены всегда (модель Telegram)', async () => {
    await enableNotifications();
    (window as { nodusDesktop?: unknown }).nodusDesktop = {
      shellVersion: '1.0.0',
      platform: 'windows',
      showPopup: () => Promise.resolve(),
      setUnreadBadge: () => Promise.resolve(),
      flashTaskbar: () => Promise.resolve(),
      openExternal: () => Promise.resolve(),
      dismissPopups: () => Promise.resolve(),
      getShellInfo: () => Promise.resolve(),
      shellReady: () => Promise.resolve(),
      onEvent: () => () => undefined,
    };
    try {
      expect(isDesktopShell()).toBe(true);
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      expect(shouldNotify(OTHER, CONV)).toBe(false);
    } finally {
      delete (window as { nodusDesktop?: unknown }).nodusDesktop;
    }
  });

  it('реестр хостов (#300): закрытие окна трэда не гасит открытую беседу', () => {
    const feed = acquireOpenConversation(CONV);
    const thread = acquireOpenConversation(CONV);
    expect(getOpenConversation()).toBe(CONV);
    // Анмаунт ОДНОГО хоста (окно трэда) — беседа всё ещё открыта лентой.
    thread();
    expect(getOpenConversation()).toBe(CONV);
    feed();
    expect(getOpenConversation()).toBe(null);
    // Карточка поверх страницы: текущая — последняя заявленная.
    const page = acquireOpenConversation('00000000-0000-4000-8000-0000000000aa');
    const card = acquireOpenConversation(CONV);
    expect(getOpenConversation()).toBe(CONV);
    card();
    expect(getOpenConversation()).toBe('00000000-0000-4000-8000-0000000000aa');
    page();
    expect(getOpenConversation()).toBe(null);
  });

  it('открыл беседу в оболочке — попапы этой беседы гаснут (Telegram-модель)', () => {
    const dismissPopups = vi.fn(() => Promise.resolve());
    (window as { nodusDesktop?: unknown }).nodusDesktop = {
      shellVersion: '1.0.0',
      platform: 'windows',
      showPopup: () => Promise.resolve(),
      setUnreadBadge: () => Promise.resolve(),
      flashTaskbar: () => Promise.resolve(),
      openExternal: () => Promise.resolve(),
      setUiTheme: () => Promise.resolve(),
      dismissPopups,
      getShellInfo: () => Promise.resolve(),
      shellReady: () => Promise.resolve(),
      onEvent: () => () => undefined,
    };
    try {
      const release = acquireOpenConversation(CONV);
      expect(dismissPopups).toHaveBeenCalledWith(CONV);
      // Release хоста мост не дёргает.
      dismissPopups.mockClear();
      release();
      expect(dismissPopups).not.toHaveBeenCalled();
    } finally {
      delete (window as { nodusDesktop?: unknown }).nodusDesktop;
    }
  });

  it('своё сообщение и открытая беседа в активной вкладке — тишина', async () => {
    await enableNotifications();
    expect(shouldNotify(ME, CONV)).toBe(false);
    const release = acquireOpenConversation(CONV);
    expect(shouldNotify(OTHER, CONV)).toBe(false);
    // Другая беседа открыта — уведомляем.
    expect(shouldNotify(OTHER, 'another-conv')).toBe(true);
    // Фоновая вкладка — уведомляем даже в открытой беседе.
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    expect(shouldNotify(OTHER, CONV)).toBe(true);
    release();
  });
});
