import { ui } from '@nodus/contracts';

/** Размер файла человеком (чип вложения): «367 КБ», «2,4 МБ».
 *  Единицы — из i18n (I15); ЕДИНЫЙ порог КБ/МБ на весь продукт (аудит #45:
 *  локальный formatSize письма делил по 1000 — один файл показывал разный
 *  размер в чате и в письме). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} ${ui.common.sizeB}`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} ${ui.common.sizeKb}`;
  return `${(kb / 1024).toFixed(1).replace('.', ',')} ${ui.common.sizeMb}`;
}

/** Часы:минуты для трудозатрат (I14): 95 → «1:35». */
export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** Дата/время в русской деловой форме: «3 сентября, 17:00». */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/** Компактная дата/время для таблиц (моно-колонки): «03.09.2026, 17:00». */
export function formatDateTimeShort(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Русская плюральная форма числа: plural(5, ['письмо','письма','писем']) → 'писем'.
 *  Формы передаются из i18n (I15), не хардкодом в компонентах. */
export function plural(n: number, forms: readonly [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const digit = abs % 10;
  if (abs > 10 && abs < 20) return forms[2] ?? '';
  if (digit > 1 && digit < 5) return forms[1] ?? '';
  if (digit === 1) return forms[0] ?? '';
  return forms[2] ?? '';
}

/** Короткое имя человека для компактных строк (просмотры чата, вердикт
 *  раунда 4: «имя фамилия, без отчества»). Полное имя в справочнике —
 * «Фамилия Имя Отчество»; здесь — «Имя Фамилия». Короткие формы (два токена
 * и менее) не трогаем («Администратор Системный»). */
export function shortPersonName(displayName: string): string {
  const parts = displayName.trim().split(/\s+/);
  if (parts.length < 3) return displayName;
  return `${parts[1]} ${parts[0]}`;
}
