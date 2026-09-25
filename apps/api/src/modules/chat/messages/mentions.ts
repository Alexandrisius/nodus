/**
 * @упоминания в тексте сообщения (раунд 3): «@Имя» — точное совпадение
 * ФИО/имени/фамилии сотрудника; упомянутый становится наблюдателем трэда
 * (точка «есть новые» + счётчик). Выпадающий список-подсказка — задел будущей
 * линии; здесь — только парсирование токенов, соответствие решает справочник
 * (порт USER_PROFILE_READER, ADR-0012).
 */

/** Токен упоминания: @ + буквы/цифры/точка/дефис/подчёркивание (без пробелов —
 *  ФИО из нескольких слов в v1 не парсится, только имя/фамилия/логин целиком).
 *  Lookbehind отсекает email (a@b.by) и «@» в середине слова: упоминание
 *  начинается с начала строки/пробела/знака. */
const MENTION_RE = /(?<![\p{L}\p{M}\p{N}._-])@([\p{L}\p{M}\p{N}._-]+)/gu;

/** Ограничение на токены одного сообщения (защита от «@ всех подряд»). */
export const MENTION_TOKENS_MAX = 20;

/** Уникальные токены упоминаний в порядке появления (без «@»). */
export function parseMentionTokens(text: string): string[] {
  const tokens: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(MENTION_RE)) {
    const token = match[1];
    if (!token || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
    if (tokens.length >= MENTION_TOKENS_MAX) break;
  }
  return tokens;
}
