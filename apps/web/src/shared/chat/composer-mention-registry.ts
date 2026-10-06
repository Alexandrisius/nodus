import {
  buildMentionToken,
  MENTION_ALL_ID,
  MENTION_TOKENS_MAX,
  parseMentionSegments,
} from '@nodus/contracts';

/**
 * Реестр упоминаний ЧЕРНОВИКА (#228, ревизии #176/#224 + dev-фидбек 06.10):
 * в поле композера лежит ВИДИМЫЙ текст — просто ИМЯ сотрудника (без `@`,
 * без разметки токена): каретка/клики/выделение нативны и совпадают с
 * картинкой. Чип в поле — подчёркнутый персональный тон (заливка-пилюля
 * только в пузыре после отправки, канон Slack/Telegram; dev-фидбек: пилюля
 * в поле «касалась» набираемого текста). Привязка id живёт ЗДЕСЬ —
 * диапазонами по display-тексту; wire-токены `@[имя](user:id)`
 * пересобираются на отправке (сервер не менялся).
 *
 * Всё чистые функции — unit-тесты без React; правки текста сводятся к
 * префикс/суффикс-диффу: диапазоны до правки стабильны, после — сдвиг,
 * пересечённые — инвалидация (чип исчезает явно, тихих потерь нет).
 */

/** Привязка упоминания в display-тексте: [start, end) накрывает `@label`. */
export interface DraftMention {
  start: number;
  end: number;
  /** userId либо сентинел «Все» (MENTION_ALL_ID). */
  id: string;
  label: string;
}

/** Label без `]` и переносов (грамматика wire-токена; buildMentionToken
 * вырезает то же — держим display и wire симметричными). */
export function cleanLabel(label: string): string {
  return label
    .replace(/]/g, '')
    .replace(/[\n\r]/g, ' ')
    .trim();
}

/** Сдвиг/инвалидация диапазонов после правки текста (префикс/суффикс-дифф):
 * диапазон целиком ДО вырезанного — как есть; целиком ПОСЛЕ — сдвиг на
 * дельту; пересечённый правкой (вкл. целиком вырезанный) — инвалид — чип
 * исчезает вместе с привязкой (правка label — поповером, вставка текста
 * ВНУТРЬ label рвёт чип явно, «тихой» потери упоминания нет). */
export function applyEditToMentions(
  mentions: DraftMention[],
  oldText: string,
  newText: string,
): DraftMention[] {
  if (oldText === newText) return mentions;
  let prefix = 0;
  while (
    prefix < oldText.length &&
    prefix < newText.length &&
    oldText[prefix] === newText[prefix]
  ) {
    prefix += 1;
  }
  // Жадный префикс заталкивал точку вставки ВНУТРЬ чипа (вставка текста
  // перед '@' убивала диапазон) — сдвигаем точку к границе чипа; суффикс
  // считается ПОСЛЕ: общий хвост дорастает, дифф остаётся точным.
  for (const m of mentions) {
    if (m.start < prefix && prefix < m.end) {
      prefix = m.start;
      break;
    }
  }
  let suffix = 0;
  while (
    suffix < oldText.length - prefix &&
    suffix < newText.length - prefix &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const removedStart = prefix;
  const removedEnd = oldText.length - suffix;
  const delta = newText.length - prefix - suffix - (removedEnd - removedStart);
  const out: DraftMention[] = [];
  for (const m of mentions) {
    if (m.end <= removedStart) {
      out.push(m);
    } else if (m.start >= removedEnd) {
      out.push({ ...m, start: m.start + delta, end: m.end + delta });
    }
    // пересечение с правкой — инвалид
  }
  return out;
}

/** Вставка чипа автокомплитом: заменяет «@запрос» на ИМЯ + пробел
 * (без «@» — dev-фидбек 06.10), регистрирует диапазон, прочие — по диффу.
 * Каретка — за пробелом (НАСТОЯЩАЯ позиция строки — нативная). */
export function insertMentionDraft(
  text: string,
  mentions: DraftMention[],
  atStart: number,
  atEnd: number,
  id: string,
  rawLabel: string,
): { text: string; mentions: DraftMention[]; caret: number } | null {
  const label = cleanLabel(rawLabel);
  if (label.length === 0) return null;
  if (mentions.length >= MENTION_TOKENS_MAX) return null;
  // Display = просто имя (без «@»: чип-подчёркивание сам сигналит тэг,
  // dev-фидбек 06.10) + пробел — честный зазор текста после чипа.
  const display = label;
  const next = `${text.slice(0, atStart)}${display} ${text.slice(atEnd)}`;
  const shifted = applyEditToMentions(mentions, text, next);
  return {
    text: next,
    mentions: [...shifted, { start: atStart, end: atStart + display.length, id, label }].sort(
      (a, b) => a.start - b.start,
    ),
    caret: atStart + display.length + 1,
  };
}

/** Правка label чипа поповером: привязка та же, текст диапазона меняется. */
export function replaceMentionLabelDraft(
  text: string,
  mentions: DraftMention[],
  index: number,
  rawLabel: string,
): { text: string; mentions: DraftMention[] } | null {
  const label = cleanLabel(rawLabel);
  const m = mentions[index];
  if (!m || label.length === 0) return null;
  const display = label;
  const next = `${text.slice(0, m.start)}${display}${text.slice(m.end)}`;
  const delta = display.length - (m.end - m.start);
  const others = mentions
    .filter((_, i) => i !== index)
    .map((x) => (x.start >= m.end ? { ...x, start: x.start + delta, end: x.end + delta } : x));
  return {
    text: next,
    mentions: [...others, { ...m, end: m.start + display.length, label }].sort(
      (a, b) => a.start - b.start,
    ),
  };
}

/** Удаление чипа целиком (корзина поповера, атомарные Backspace/Delete):
 * с диапазоном уходит и его текст, соседние диапазоны сдвигаются. */
export function removeMentionDraft(
  text: string,
  mentions: DraftMention[],
  index: number,
): { text: string; mentions: DraftMention[] } {
  const m = mentions[index];
  if (!m) return { text, mentions };
  return {
    text: text.slice(0, m.start) + text.slice(m.end),
    mentions: applyEditToMentions(mentions, text, text.slice(0, m.start) + text.slice(m.end)),
  };
}

/** Атомарное удаление клавишей (#224/#228): Backspace у КОНЦА чипа (или
 * внутри), Delete у НАЧАЛА (или внутри) — индекс чипа или null (нативная
 * обработка). Чип никогда не разбирается посимвольно. */
export function mentionIndexAtKey(
  mentions: DraftMention[],
  caret: number,
  key: 'Backspace' | 'Delete',
): number | null {
  for (let i = 0; i < mentions.length; i += 1) {
    const m = mentions[i]!;
    const inside = caret > m.start && caret < m.end;
    const atEdge = key === 'Backspace' ? caret === m.end : caret === m.start;
    if (inside || atEdge) return i;
  }
  return null;
}

/** Чип под смещением каретки (клик по видимой пилюле — поповер правки). */
export function mentionIndexAtOffset(mentions: DraftMention[], offset: number): number | null {
  for (let i = 0; i < mentions.length; i += 1) {
    const m = mentions[i]!;
    if (offset >= m.start && offset <= m.end) return i;
  }
  return null;
}

/** Пересборка wire-текста отправки: диапазоны → токены `@[label](user:id)`,
 * остальной текст как есть. Перекрывающиеся/ползущие диапазоны (не должны
 * возникать) молча пропускаются — отправка не падает о реестр. */
export function toWireText(text: string, mentions: DraftMention[]): string {
  let out = '';
  let cursor = 0;
  for (const m of [...mentions].sort((a, b) => a.start - b.start)) {
    if (m.start < cursor || m.end > text.length || m.start >= m.end) continue;
    out += text.slice(cursor, m.start) + buildMentionToken(m.label, m.id);
    cursor = m.end;
  }
  return out + text.slice(cursor);
}

/** Разбор wire-текста в display + реестр (правка сообщения, миграция
 * персиста, восстановление серверного черновика). Токены без валидного id
 * остаются текстом (парсер contracts устойчив к обрывам). */
export function fromWireText(text: string): { text: string; mentions: DraftMention[] } {
  if (!text.includes('@[')) return { text, mentions: [] };
  let display = '';
  const mentions: DraftMention[] = [];
  for (const segment of parseMentionSegments(text)) {
    if (segment.kind === 'text') {
      display += segment.value;
      continue;
    }
    mentions.push({
      start: display.length,
      end: display.length + segment.label.length,
      id: segment.id === MENTION_ALL_ID ? MENTION_ALL_ID : segment.id,
      label: segment.label,
    });
    display += segment.label;
  }
  return { text: display, mentions };
}
