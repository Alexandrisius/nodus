import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { OfficeConfig, OfficeSession } from '@nodus/contracts';

import { api } from '../api-client.js';

/** Ключи запросов движка офисного просмотра (#138). */
export const officeKeys = {
  config: ['files', 'office-config'] as const,
  session: (fileId: string, mode: 'view' | 'edit') =>
    ['files', fileId, 'office-session', mode] as const,
};

const OFFICE_CONFIG_FALLBACK: OfficeConfig = {
  enabled: false,
  editEnabled: false,
  maxViewBytes: 52_428_800,
};

/**
 * Конфиг движка (GET /files/office-config). Любая ошибка = «движок
 * выключен» (старый api без эндпоинта, сеть, 5xx): реестр уходит в
 * фолбэки без ошибок UI (критерий приёмки #138 «деградация без ошибок»).
 */
export function useOfficeConfig(): UseQueryResult<OfficeConfig> {
  return useQuery({
    queryKey: officeKeys.config,
    queryFn: async () => {
      try {
        return await api<OfficeConfig>('/files/office-config');
      } catch {
        return OFFICE_CONFIG_FALLBACK;
      }
    },
    staleTime: 5 * 60_000,
  });
}

/** Сессия документа (GET /files/:id/office-session?mode=…). staleTime 0 —
 * документ-ключ сессии обязан строиться от АКТУАЛЬНОЙ версии сервера:
 * кэш после «тихого» сохранения при закрытии (колбэк в полёте ~1–2 с) выдал
 * бы редактору ключ прошлой версии → DS показывал «документ был изменён»
 * (репро владельца 02.10). Открытие модалки = один лёгкий GET. */
export function useOfficeSession(
  fileId: string | null,
  mode: 'view' | 'edit',
  enabled: boolean,
): UseQueryResult<OfficeSession> {
  return useQuery({
    queryKey: officeKeys.session(fileId ?? '', mode),
    queryFn: () => api<OfficeSession>(`/files/${fileId}/office-session?mode=${mode}`),
    enabled: enabled && fileId !== null,
    staleTime: 0,
    retry: false,
  });
}
