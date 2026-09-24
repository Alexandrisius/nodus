import { setupWorker } from 'msw/browser';

import { getApiMockConfig } from '../shared/api/api-mock-config.js';
import { buildMockHandlers } from './mocks-handlers.js';

/**
 * MSW-воркер (#48): собирается ТОЛЬКО из хендлеров мокаемых доменов
 * (VITE_API_MOCK). При 'false'/пустом флаге модуль не импортируется вовсе
 * (гейт в main.tsx) — воркер не стартует и msw не грузится.
 */
export const worker = setupWorker(...buildMockHandlers(getApiMockConfig().domains));
