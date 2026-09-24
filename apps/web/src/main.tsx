import '@nodus/ui/globals.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/app';
import { getApiMockConfig } from './shared/api/api-mock-config.js';

/** MSW (ADR-0001, #48): воркер стартует ДО рендера, только если есть
 *  мокаемые домены: VITE_API_MOCK=true — демо целиком, список —
 *  покомпонентный режим, false/пусто — живой API без воркера. */
async function enableMocking(): Promise<void> {
  if (!getApiMockConfig().enabled) return;
  const { worker } = await import('./app/msw-browser.js');
  // Шумим только по нашим /api/*: посторонние запросы (антивирус, devtools)
  // молча пропускаем — иначе консоль засорена предупреждениями «нет хендлера».
  await worker.start({
    onUnhandledRequest: (req, print) => {
      if (new URL(req.url).pathname.startsWith('/api/')) print.warning();
    },
  });
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Точка монтирования #root не найдена');
}

void enableMocking().then(() => {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
