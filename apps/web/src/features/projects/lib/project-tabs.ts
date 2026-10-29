import { useState } from 'react';

/** Вкладки рабочей зоны карточки проекта (вердикт владельца 07.11.2026):
 *  слева — панель «О проекте», справа — вкладки. «Чат проекта» появится
 *  вместе с пространством проекта (#456) — до него вкладки нет. */
export type ProjectTabId = 'tasks' | 'channel' | 'members' | 'history';

/** Порядок вкладок; «Задачи» — первичная и не скрывается (рабочая зона не
 *  может остаться пустой). Персональный порядок и DnD — следующий шаг. */
export const PROJECT_TAB_IDS: readonly ProjectTabId[] = ['tasks', 'channel', 'members', 'history'];

const STORAGE_KEY = 'nodus-project-tabs-v1';

function isTabId(value: unknown): value is ProjectTabId {
  return typeof value === 'string' && PROJECT_TAB_IDS.includes(value as ProjectTabId);
}

/** Скрытые пользователем вкладки из памяти (неизвестные ключи отбрасываются;
 *  «Задачи» скрыть нельзя). */
export function readHiddenTabs(raw: string | null): ProjectTabId[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is ProjectTabId => isTabId(id) && id !== 'tasks');
  } catch {
    return [];
  }
}

/** Видимые вкладки в порядке реестра. */
export function visibleTabs(hidden: readonly ProjectTabId[]): ProjectTabId[] {
  return PROJECT_TAB_IDS.filter((id) => id === 'tasks' || !hidden.includes(id));
}

/** Персональная видимость вкладок (память в localStorage, как у полей
 *  паспорта): «+» в полосе вкладок управляет набором. */
export function useProjectTabs() {
  const [hidden, setHidden] = useState<ProjectTabId[]>(() =>
    readHiddenTabs(localStorage.getItem(STORAGE_KEY)),
  );

  function toggle(id: ProjectTabId) {
    if (id === 'tasks') return;
    setHidden((prev) => {
      const next = prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  return { hidden, toggle, visible: visibleTabs(hidden) };
}
