import { HttpResponse, http } from 'msw';

/**
 * Моки домена files (#138): движок офисного просмотра в мок-контуре ВЫКЛЮЧЕН
 * (documentserver не поднимается рядом с MSW-демо) — реестр уводит офисные
 * вложения в карточку скачивания без ошибок UI. Мок ≠ контракту = баг:
 * office-config отвечает схеме officeConfigSchema.
 */
export const filesHandlers = [
  http.get('/api/v1/files/office-config', () =>
    HttpResponse.json({ enabled: false, editEnabled: false, maxViewBytes: 52_428_800 }),
  ),

  http.get('/api/v1/files/:id/office-session', () =>
    HttpResponse.json(
      { code: 'FILE_OFFICE_DISABLED', message: 'Office viewer is disabled', traceId: 'mock' },
      { status: 503 },
    ),
  ),

  http.get('/api/v1/files/:id/versions', () => HttpResponse.json({ items: [] })),
];
