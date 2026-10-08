import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

import '@nodus/ui/globals.css';
import { PopupView } from './popup/popup-view.js';
import { SetupScreen } from './setup/setup-screen.js';

/**
 * Мини-фронтенд оболочки (ADR-0019): роль окна определяет его label —
 * `popup-*` рендерит попап уведомления, всё остальное — экран подключения.
 * Главное окно после подключения навигируется на портал поверх локального
 * контента (`navigate` из Rust), этот бандл в тот момент не активен.
 */
const isPopup = getCurrentWebviewWindow().label.startsWith('popup-');

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<StrictMode>{isPopup ? <PopupView /> : <SetupScreen />}</StrictMode>);
}
