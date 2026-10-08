// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '../auth-store.js';
import {
  disableNotifications,
  enableNotifications,
  notificationsEnabled,
  setOpenConversation,
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
  setOpenConversation(null);
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
      setOpenConversation(CONV);
      expect(dismissPopups).toHaveBeenCalledWith(CONV);
      // Уход из беседы (null) мост не дёргает.
      dismissPopups.mockClear();
      setOpenConversation(null);
      expect(dismissPopups).not.toHaveBeenCalled();
    } finally {
      delete (window as { nodusDesktop?: unknown }).nodusDesktop;
    }
  });

  it('своё сообщение и открытая беседа в активной вкладке — тишина', async () => {
    await enableNotifications();
    expect(shouldNotify(ME, CONV)).toBe(false);
    setOpenConversation(CONV);
    expect(shouldNotify(OTHER, CONV)).toBe(false);
    // Другая беседа открыта — уведомляем.
    expect(shouldNotify(OTHER, 'another-conv')).toBe(true);
    // Фоновая вкладка — уведомляем даже в открытой беседе.
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    expect(shouldNotify(OTHER, CONV)).toBe(true);
  });
});
