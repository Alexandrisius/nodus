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
  /** Текст как есть (txt/log/csv/json…; вердикт владельца 28.10 — .txt
   *  из письма должен открываться до регистрации, а не только скачиваться). */
  | 'text'
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

/** Простой текст: читалка, а не ONLYOFFICE (в письмах .txt — это лог,
 *  подпись, выгрузка, а не документ для правки; source .eml не сюда).
 *  CSV/TSV намеренно НЕ здесь — это таблицы, их ведёт офисный движок. */
const PLAIN_TEXT_EXTENSIONS = new Set([
  'txt',
  'log',
  'md',
  'json',
  'xml',
  'yml',
  'yaml',
  'ini',
  'cfg',
  'conf',
  'sql',
  'js',
  'ts',
  'css',
  'html',
  'htm',
]);

const isPlainText = (name: string, mime: string): boolean =>
  mime === 'application/json' ||
  (mime.startsWith('text/') && mime !== 'text/csv' && mime !== 'text/tab-separated-values') ||
  PLAIN_TEXT_EXTENSIONS.has(fileExtension(name));

/**
 * Маршрут вложения. Порядок: простой текст (читалка; mime от клиента не
 * доверяем — решают и mime, и расширение) → офисная таблица по расширению →
 * PDF → медиа по mime → скачивание. kind==='image' из DTO маршрутизируется
 * вызывающим (существующий лайтбокс), сюда не попадает — но image-хосты
 * (панель/дровер) могут открыть media-вьюер.
 */
export function resolveViewerRoute(
  name: string,
  mime: string,
  size: number,
  options: ViewerRoutingOptions,
): ViewerRoute {
  if (isPlainText(name, mime)) return { kind: 'text', office: null, reason: null };
  const office = officeFormat(name);
  if (office) {
    if (size > options.maxViewBytes) {
      return { kind: 'download', office, reason: 'too_large' };
    }
    if (!options.officeEnabled) {
      // Таблица без редактора читается как текст (CSV — это те же строки).
      if (mime.startsWith('text/') || ['csv', 'tsv'].includes(fileExtension(name))) {
        return { kind: 'text', office: null, reason: null };
      }
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
