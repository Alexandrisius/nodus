import { useEffect } from 'react';

import { useAuthStore } from '../../../shared/auth-store.js';
import { LATEST_RELEASE } from './releases.js';
import { isUnseen, useWhatsNewStore } from './whats-new-store.js';

/** Пауза перед автопоказом: сначала отрисовывается рабочее место, панель
 *  выезжает поверх уже осевшего экрана, а не в кадрах загрузки. */
export const AUTO_OPEN_DELAY_MS = 1200;

/**
 * Автопоказ «Что нового» (#386): после обновления прода (в бандле новый
 * последний выпуск) панель открывается сама ОДИН раз у каждого пользователя.
 * Монтируется в каркасе (AppShell) — только для вошедших.
 */
export function useWhatsNewAutoOpen(): void {
  const userId = useAuthStore((s) => s.user?.id);
  const unseen = useWhatsNewStore((s) => isUnseen(s.seen, userId, LATEST_RELEASE?.version));

  useEffect(() => {
    // Под автоматизацией браузера (Playwright/WebDriver: navigator.webdriver)
    // автопоказа нет — панель поверх рабочего места перехватывала фокус и
    // клики e2e критичных путей (репро #386: «супер-курсор» чата). Кнопка
    // топбара работает как обычно; автопоказ покрыт unit-тестом.
    if (!unseen || !userId || !LATEST_RELEASE || navigator.webdriver) return;
    const version = LATEST_RELEASE.version;
    const timer = window.setTimeout(
      () => useWhatsNewStore.getState().show(userId, version, 'auto'),
      AUTO_OPEN_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [unseen, userId]);
}
