import { isOfficeTextFormat } from '@nodus/contracts';

/**
 * Нормализация текстовых вложений для движка ONLYOFFICE (#138): DS не умеет
 * автоопределять кодировку txt/csv/tsv (UTF-8 без BOM, Windows-1251) и
 * показывает диалог «Выбрать параметры TXT» — под оверлеем загрузки вьюера
 * он не виден, открытие зависает (репро 29.09; отключить диалог конфигом
 * нельзя — официальный ответ ONLYOFFICE, community 9910). Решение: DS
 * отдаётся UTF-8 С BOM — валидный UTF-8 определяется мгновенно, диалог не
 * появляется. Windows-1251 (реалии BY-офисов) перекодируется. Хранилище и
 * скачивание пользователем — байты как загружены.
 */
const MAX_NORMALIZE_BYTES = 5 * 1024 * 1024;
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf]);

/** Нужна ли нормализация этому файлу (текстовый формат и буферизуемый размер). */
export function needsTextNormalization(name: string, size: number): boolean {
  return isOfficeTextFormat(name) && size > 0 && size <= MAX_NORMALIZE_BYTES;
}

/** UTF-8 (с детектом Windows-1251) + BOM; невозможное — как есть. */
export function normalizeTextForOffice(bytes: Buffer): Buffer {
  if (bytes.subarray(0, 3).equals(UTF8_BOM)) return bytes;
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    try {
      text = new TextDecoder('windows-1251').decode(bytes);
    } catch {
      return bytes; // кодировка не распознана — DS покажет диалог (видимый)
    }
  }
  // Нулевые байты = бинарный контент под текстовым расширением — не трогаем.
  if (text.includes('\u0000')) return bytes;
  return Buffer.concat([UTF8_BOM, Buffer.from(text, 'utf-8')]);
}
