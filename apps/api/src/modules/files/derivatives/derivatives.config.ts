import type { InjectionToken } from '@nestjs/common';
import { PDF_DERIVATIVE_EXTENSIONS } from '@nodus/contracts';

/** Конфигурация конвейера производных (#139) из окружения. */
export interface DerivativesConfig {
  /** Адрес Gotenberg (прод: docker-сеть http://gotenberg:3000; песочница
   * live-stack: хост-порт 127.0.0.1:3100). Пусто — конвейер выключен. */
  gotenbergUrl: string | null;
  /** Конвертация офисных в PDF только для этих расширений (спека #139:
   * таблицы НЕ конвертим — PDF-простынёй антипаттерн; единый список —
   * contracts/files/attachment-preview, его же читает DTO-маппер). */
  pdfExtensions: readonly string[];
}

export const DERIVATIVES_CONFIG: InjectionToken = 'DERIVATIVES_CONFIG';

export function getDerivativesConfig(env: NodeJS.ProcessEnv = process.env): DerivativesConfig {
  const url = env.GOTENBERG_URL?.trim() || null;
  return {
    gotenbergUrl: url && url.length > 0 ? url.replace(/\/$/, '') : null,
    pdfExtensions: PDF_DERIVATIVE_EXTENSIONS,
  };
}
