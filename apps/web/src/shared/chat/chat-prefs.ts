import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { chatPrefsEnvelopeSchema, zodPersistMerge } from '../lib/persist-zod.js';

/** Выравнивание сообщений ленты (вердикт владельца 14.09.2026, модель
 *  Телеграма/Битрикс24): 'one' — все сообщения с одной стороны (свои рядом
 *  с собеседником, дефолт: широкая лента с пузырями по разным краям
 *  неудобна чтению); 'both' — классика: свои справа. Настройка пользователя
 *  (мессенджер → «Настройка» → «Оформление»), персист локальный; персональные
 *  настройки на сервере — после MVP. Живёт в shared/chat: потребитель —
 *  ChatMessageItem (shared), редактор — страница настроек мессенджера
 *  (features/chat, импорт features→shared разрешён, I6). */
export type ChatAlign = 'one' | 'both';

interface ChatPrefsState {
  align: ChatAlign;
  setAlign: (align: ChatAlign) => void;
}

export const useChatPrefs = create<ChatPrefsState>()(
  persist(
    (set) => ({
      align: 'one',
      setAlign: (align) => set({ align }),
    }),
    {
      name: 'nodus-chat-prefs-v1',
      version: 1,
      merge: zodPersistMerge<ChatPrefsState>(chatPrefsEnvelopeSchema),
    },
  ),
);
