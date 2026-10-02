import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import {
  notificationTabsEnvelopeSchema,
  zodPersistMerge,
} from '../../../shared/lib/persist-zod.js';
import type { CustomFeedTab, SystemTabId } from './feed-tabs.js';

/**
 * Персональные вкладки-фильтры ленты уведомлений (#189): кастомные вкладки и
 * скрытые системные — ЛИЧНАЯ настройка браузера (persist `zodPersistMerge`,
 * канон persist-сторов); переезд на API-персонализацию затронет только этот
 * стор (I13). Активная вкладка — сессионное состояние ленты, не персистится.
 */
interface NotificationTabsState {
  custom: CustomFeedTab[];
  hiddenSystem: SystemTabId[];
  addTab: (
    name: string,
    kinds: CustomFeedTab['kinds'],
    priorities: CustomFeedTab['priorities'],
  ) => void;
  updateTab: (
    id: string,
    patch: { name: string; kinds: CustomFeedTab['kinds']; priorities: CustomFeedTab['priorities'] },
  ) => void;
  removeTab: (id: string) => void;
  hideSystemTab: (id: SystemTabId) => void;
  showSystemTab: (id: SystemTabId) => void;
}

export const useNotificationTabsStore = create<NotificationTabsState>()(
  persist(
    (set) => ({
      custom: [],
      hiddenSystem: [],
      addTab: (name, kinds, priorities) =>
        set((s) => ({
          custom: [...s.custom, { id: crypto.randomUUID(), name: name.trim(), kinds, priorities }],
        })),
      updateTab: (id, patch) =>
        set((s) => ({
          custom: s.custom.map((t) =>
            t.id === id
              ? { ...t, name: patch.name.trim(), kinds: patch.kinds, priorities: patch.priorities }
              : t,
          ),
        })),
      removeTab: (id) => set((s) => ({ custom: s.custom.filter((t) => t.id !== id) })),
      hideSystemTab: (id) =>
        set((s) => (s.hiddenSystem.includes(id) ? s : { hiddenSystem: [...s.hiddenSystem, id] })),
      showSystemTab: (id) => set((s) => ({ hiddenSystem: s.hiddenSystem.filter((h) => h !== id) })),
    }),
    {
      name: 'nodus-notification-tabs-v1',
      version: 1,
      partialize: (s) => ({ custom: s.custom, hiddenSystem: s.hiddenSystem }),
      merge: zodPersistMerge<NotificationTabsState>(notificationTabsEnvelopeSchema),
    },
  ),
);
