import { fileExtension, officeFormat } from './office-formats.js';

/**
 * Классификация вложения для маршрута просмотрщика (#139) — единая точка
 * решений «чем открывать» на сервере (клиентскому mime не доверяем):
 * office | pdf | image | video | file. Фронтовой реестр классифицирует по
 * той же таблице форматов локально; previewKind из DTO несёт серверную
 * классификацию потребителям (pdfUrl выдаётся только «офисным»), fallback
 * на PDF при выключенном движке идёт по pdfUrl.
 */
export type AttachmentPreviewKind = 'office' | 'pdf' | 'image' | 'video' | 'file';

export function attachmentPreviewKind(name: string, mime: string): AttachmentPreviewKind {
  if (officeFormat(name)) return 'office';
  if (fileExtension(name) === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('video/') || mime.startsWith('audio/')) return 'video';
  if (mime.startsWith('image/')) return 'image';
  return 'file';
}

/**
 * Офисные форматы, для которых конвейер производных строит PDF-копию (#139,
 * спека): word/presentation-семейства + rtf/txt. Таблицы (xlsx/ods/csv/tsv)
 * НАМЕРЕННО не конвертируются — PDF-простыня антипаттерн (вердикт владельца):
 * их просмотр только ONLYOFFICE, pdfUrl в DTO не выдаётся.
 */
export const PDF_DERIVATIVE_EXTENSIONS: readonly string[] = [
  'doc',
  'docx',
  'docm',
  'dot',
  'dotx',
  'dotm',
  'odt',
  'ott',
  'fodt',
  'rtf',
  'txt',
  'ppt',
  'pptx',
  'pptm',
  'ppsx',
  'odp',
  'otp',
];

export function isPdfDerivativeCandidate(name: string): boolean {
  return PDF_DERIVATIVE_EXTENSIONS.includes(fileExtension(name));
}
