import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UiPreferences } from '@nodus/contracts';

/**
 * Персонализация навигации (концепт «Персональный порядок», #4): ЛИЧНЫЙ и
 * ОБЩИЙ (компания, «Применить порядок для всех» админа) скоупы одним DTO
 * contracts (uiPreferencesSchema) — формат зеркалит будущее API
 * персонализации, замена localStorage → API коснётся только этого стора
 * (I13). Пустой скоуп = слой не задан (разрешение: личный ?? общий ??
 * системный). Верхние вкладки кастомизации не подлежат (вердикт #4).
 */
interface UiPrefsState {
  personal: UiPreferences;
  company: UiPreferences;
  /** Порядок и скрытые модули рейки: forAll — пишем в общий скоуп (админ). */
  applyNav: (order: string[], hidden: string[], forAll: boolean) => void;
  /** Сброс ЛИЧНОГО слоя — «Вернуть по умолчанию». */
  resetPersonal: () => void;
}

export const useUiPrefsStore = create<UiPrefsState>()(
  persist(
    (set) => ({
      personal: {},
      company: {},
      applyNav: (order, hidden, forAll) =>
        set((s) =>
          forAll
            ? { company: { ...s.company, navOrder: order, navHidden: hidden } }
            : { personal: { ...s.personal, navOrder: order, navHidden: hidden } },
        ),
      resetPersonal: () => set({ personal: {} }),
    }),
    { name: 'nodus-ui-prefs-v1' },
  ),
);
