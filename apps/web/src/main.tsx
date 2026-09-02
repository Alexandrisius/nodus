import '@nodus/ui/globals.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/app';

/** MSW (ADR-0001): воркер стартует ДО рендера, только при VITE_API_MOCK=true. */
async function enableMocking(): Promise<void> {
  if (import.meta.env.VITE_API_MOCK !== 'true') return;
  const { worker } = await import('./shared/mocks/browser.js');
  await worker.start({ onUnhandledRequest: 'warn' });
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
