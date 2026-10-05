/**
 * Извлечение URL из текста сообщения (витрина беседы #211): write-time
 * проекция message_links — извлечение при отправке/правке в той же
 * транзакции, списки и счётчики секции «Ссылки» без скана текстов на
 * чтении (модель Telegram/Bitrix24, «не для пилотных объёмов»).
 *
 * Эквивалентен SQL-извлечению миграции vault_backfill (зеркальные тесты):
 * `https?://\S+` + срез хвостовой пунктуации (точка/запятая/скобки/кавычки
 * обычно относятся к предложению, не к адресу).
 */

const URL_RE = /https?:\/\/\S+/g;

/** Хвостовые символы, НЕ являющиеся частью адреса в живом тексте. */
const TRAILING_PUNCTUATION = '.,;:!?)]}\'">';

/** Срез хвостовой пунктуации адреса (эквивалент SQL rtrim по множеству). */
function trimTrailing(url: string): string {
  let end = url.length;
  while (end > 0 && TRAILING_PUNCTUATION.includes(url[end - 1]!)) end -= 1;
  return url.slice(0, end);
}

/**
 * URL сообщения в порядке появления (позиция = индекс в массиве).
 * Потологическая защита: не более 50 ссылок (текст ≤ 4000 символов,
 * реальный максимум меньше; кап страхует проекцию от мусорных строк).
 */
export function extractMessageUrls(text: string): string[] {
  const urls: string[] = [];
  for (const match of text.matchAll(URL_RE)) {
    const url = trimTrailing(match[0]);
    if (url.length > 'https://'.length) urls.push(url);
    if (urls.length >= 50) break;
  }
  return urls;
}
