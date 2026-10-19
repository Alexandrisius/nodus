import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { whatsNewEnvelopeSchema, zodPersistMerge } from '../../../shared/lib/persist-zod.js';

/** Как открыта панель: сама после обновления (фокус не крадём у рабочего
 *  места) или кнопкой топбара (фокус — в панель, канон диалогов). */
export type OpenReason = 'auto' | 'manual';

interface WhatsNewState {
  /** Последний просмотренный выпуск по пользователю (userId → version):
   *  на общем компьютере у каждого сотрудника своя отметка. */
  seen: Record<string, string>;
  open: boolean;
  openReason: OpenReason;
  /** Открыть панель и отметить выпуск просмотренным (открытие = просмотр:
   *  повторно сама не появится, история — по кнопке). */
  show: (userId: string | undefined, version: string, reason: OpenReason) => void;
  close: () => void;
}

export const useWhatsNewStore = create<WhatsNewState>()(
  persist(
    (set) => ({
      seen: {},
      open: false,
      openReason: 'manual',
      show: (userId, version, openReason) =>
        set((s) => ({
          open: true,
          openReason,
          seen: userId ? { ...s.seen, [userId]: version } : s.seen,
        })),
      close: () => set({ open: false }),
    }),
    {
      name: 'nodus-whats-new-v1',
      version: 1,
      partialize: (state) => ({ seen: state.seen }),
      merge: zodPersistMerge<WhatsNewState>(whatsNewEnvelopeSchema),
    },
  ),
);

/** Выпуск ещё не просмотрен этим пользователем (точка на кнопке, автопоказ). */
export function isUnseen(
  seen: Record<string, string>,
  userId: string | undefined,
  version: string | undefined,
): boolean {
  return Boolean(userId && version && seen[userId] !== version);
}
