import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

import '@nodus/ui/globals.css';
import { HideAllBar } from './popup/hide-all-bar.js';
import { PopupView } from './popup/popup-view.js';
import { SetupScreen } from './setup/setup-screen.js';

/**
 * Мини-фронтенд оболочки (ADR-0019): роль окна определяет его label —
 * `popup-hide-all` рендерит плашку «Скрыть все» над стеком, прочие
 * `popup-*` — попап уведомления, всё остальное — экран подключения.
 * Главное окно после подключения навигируется на портал поверх локального
 * контента (`navigate` из Rust), этот бандл в тот момент не активен.
 */
const label = getCurrentWebviewWindow().label;
const kind =
  label === 'popup-hide-all' ? 'hide-all' : label.startsWith('popup-') ? 'popup' : 'setup';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      {kind === 'hide-all' ? <HideAllBar /> : kind === 'popup' ? <PopupView /> : <SetupScreen />}
    </StrictMode>,
  );
}
