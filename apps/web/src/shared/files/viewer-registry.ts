import { fileExtension, officeFormat, type OfficeFormatInfo } from '@nodus/contracts';

/**
 * Реестр просмотрщика вложений (#138) — ЕДИНАЯ точка решений «чем открывать»
 * (урок одной точки решений: маршрутиция вложения не зависит от хоста
 * рендера — чип чата, панель беседы, дровер задачи). Таблица форматов —
 * contracts/files/office-formats; здесь только маршрутизация по kind/mime.
 */

export type ViewerKind =
  /** ONLYOFFICE Docs (офисные форматы, живая сессия). */
  | 'office'
  /** pdf.js — без сессии (спека #138). */
  | 'pdf'
  /** Нативные <video>/<audio>/<img>. */
  | 'media'
  /** Карточка скачивания (архивы, DWG, неизвестное, офис выключен/велик). */
  | 'download';

export interface ViewerRoute {
  kind: ViewerKind;
  /** Для office: тип документа DS; для media: подтип. */
  office: OfficeFormatInfo | null;
  /** Ограничение для download-карточки (текст-причина). */
  reason: 'unsupported' | 'too_large' | 'office_disabled' | null;
}

export interface ViewerRoutingOptions {
  /** Движок ONLYOFFICE доступен (GET /files/office-config). */
  officeEnabled: boolean;
  /** Потолок открытия в редакторе (байт). */
  maxViewBytes: number;
}

/**
 * Маршрут вложения. Порядок: офисная таблица по расширению имени (mime от
 * клиента не доверяем) → PDF → медиа по mime → скачивание. kind==='image'
 * из DTO маршрутизируется вызывающим (существующий лайтбокс), сюда не
 * попадает — но image-хосты (панель/дровер) могут открыть media-вьюер.
 */
export function resolveViewerRoute(
  name: string,
  mime: string,
  size: number,
  options: ViewerRoutingOptions,
): ViewerRoute {
  const office = officeFormat(name);
  if (office) {
    if (size > options.maxViewBytes) {
      return { kind: 'download', office, reason: 'too_large' };
    }
    if (!options.officeEnabled) {
      return { kind: 'download', office, reason: 'office_disabled' };
    }
    return { kind: 'office', office, reason: null };
  }
  if (fileExtension(name) === 'pdf' || mime === 'application/pdf') {
    return { kind: 'pdf', office: null, reason: null };
  }
  if (mime.startsWith('video/') || mime.startsWith('audio/') || mime.startsWith('image/')) {
    return { kind: 'media', office: null, reason: null };
  }
  return { kind: 'download', office: null, reason: 'unsupported' };
}
