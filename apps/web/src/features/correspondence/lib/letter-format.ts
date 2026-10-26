import { ui } from '@nodus/contracts';

/** Форматы писем (#55): тема с фолбэком, номер, ISO-даты ДД.ММ.ГГГГ без
 *  сдвига часового пояса (дата документа — календарный день, не момент). */

export function letterSubject(letter: { subject: string | null }): string {
  return letter.subject?.trim() || ui.letters.noSubject;
}

export function letterNumber(letter: { regNumber: string | null }): string {
  return letter.regNumber ?? ui.letters.noNumber;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Сегодня в часовом поясе браузера (сервер сверяет по поясу компании). */
export function todayIso(at = new Date()): string {
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/** «2026-10-25» → «25.10.2026»; null — пустая строка. */
export function formatIsoDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [year, month, day] = iso.slice(0, 10).split('-');
  return year && month && day ? `${day}.${month}.${year}` : '';
}

/** «25.10.2026», «25.10.26», «25/10/2026», «25102026», «251026» → ISO-дата;
 *  несуществующий день (31.02) и мусор — null. Двузначный год — 20ГГ. */
export function parseRuDate(text: string): string | null {
  const value = text.trim();
  let parts: string[] | null = null;
  const separated = /^(\d{1,2})[.\-/ ](\d{1,2})[.\-/ ](\d{2}|\d{4})$/.exec(value);
  if (separated) parts = separated.slice(1);
  const compact = /^(\d{2})(\d{2})(\d{2}|\d{4})$/.exec(value);
  if (!parts && compact) parts = compact.slice(1);
  if (!parts) return null;
  const day = Number(parts[0]);
  const month = Number(parts[1]);
  const yearPart = parts[2] ?? '';
  const year = yearPart.length === 2 ? 2000 + Number(yearPart) : Number(yearPart);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Подсказка номера до регистрации: «Вх-2026/…» — точный выдаст сервер. */
export function numberPreview(prefix: string, at = new Date()): string {
  return `${prefix}-${at.getFullYear()}/…`;
}

/** Время поступления в очереди: сегодня — «09:41», иначе — «24 окт, 16:40». */
export function receivedLabel(iso: string, now = new Date()): string {
  const at = new Date(iso);
  const sameDay =
    at.getFullYear() === now.getFullYear() &&
    at.getMonth() === now.getMonth() &&
    at.getDate() === now.getDate();
  if (sameDay) return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const day = at.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');
  return `${day}, ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}
