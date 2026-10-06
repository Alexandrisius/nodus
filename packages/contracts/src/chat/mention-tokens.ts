/**
 * Токены @упоминаний в тексте сообщения (#176, модель Slack `<@id|name>`):
 * inline-токен `@[отображаемый текст](user:uuid)` с привязкой по id и
 * свободным отображаемым текстом (склонения, подписи). Текст сообщения —
 * источник истины: токен переживает любые правки, привязка не меняется.
 *
 * Парсер живёт в contracts: он нужен api (mentionedUserIds при
 * отправке/правке), web (рендер чипов во всех хостах пузыря) и мокам —
 * одна грамматика на три потребителя (I3). Устойчив к обрыву: незакрытый
 * или невалидный токен — обычный текст, а не ошибка.
 */

/** Лимит токенов одного сообщения (защита от «@ всех подряд»); сервер
 *  урезает упоминания до этого количества, остальные — просто текст. */
export const MENTION_TOKENS_MAX = 20;

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

/** Полный токен: `@[label](user:uuid)`. Label — любые символы кроме `]` и
 *  перевода строки (первый `]` закрывает); id — строгий UUID либо сентинел
 *  `all` (упоминание «Все» #224 — пинг всем участникам беседы). */
const MENTION_TOKEN_RE = new RegExp(`@\\[([^\\]\\n]*)\\]\\(user:(${UUID}|all)\\)`, 'g');

/** Сентинел «Все» (#224): токен `@[Все](user:all)` сервер резолвит во всех
 *  активных участников беседы кроме автора. */
export const MENTION_ALL_ID = 'all';

/** Сегмент текста сообщения: обычный текст либо упоминание-чип (токен из
 *  текста убирается — его заменит чип с персональным цветом #180). */
export type MentionSegment =
  { kind: 'text'; value: string } | { kind: 'mention'; id: string; label: string };

/** Разбить текст на текстовые сегменты и упоминания. Пустых текстовых
 *  сегментов нет; токены без валидного UUID остаются текстом. */
export function parseMentionSegments(text: string): MentionSegment[] {
  if (!text.includes('@[')) return [{ kind: 'text', value: text }];
  const segments: MentionSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(MENTION_TOKEN_RE)) {
    const start = match.index ?? 0;
    if (start > cursor) segments.push({ kind: 'text', value: text.slice(cursor, start) });
    segments.push({ kind: 'mention', id: match[2]!.toLowerCase(), label: match[1]! });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) segments.push({ kind: 'text', value: text.slice(cursor) });
  return segments.filter((s) => s.kind !== 'text' || s.value.length > 0);
}

/** Уникальные userId упомянутых в порядке появления (дедуп, лимит
 *  MENTION_TOKENS_MAX) — серверный снапшот mentionedUserIds. Сентинел
 *  «все» не вытесняется лимитом: 20 индивидуальных токенов до него не
 *  обязаны гасить общий пинг (security-ревью #224). */
export function extractMentionIds(text: string): string[] {
  const all: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(MENTION_TOKEN_RE)) {
    const id = match[2]!.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    all.push(id);
  }
  // Сентинел первым, индивидуальные — капом; вход ограничен (текст ≤4000),
  // полный скан дешевле ветвления: сентинел в конце не вытесняется лимитом.
  const sentinel = all.filter((id) => id === MENTION_ALL_ID);
  const individual = all.filter((id) => id !== MENTION_ALL_ID).slice(0, MENTION_TOKENS_MAX);
  return [...sentinel, ...individual];
}

/** Обрезка текста с токенами упоминаний БЕЗ разрезания токена (#224):
 *  срез идёт по границам сегментов — цитата-ответ/снапшот никогда не
 *  хранят огрызок `@[Имя](user:4242-…`; текстовый кусок режется свободно
 *  (токенов внутри него нет по построению парсера). */
export function truncateMentionText(text: string, max: number): string {
  if (text.length <= max) return text;
  let out = '';
  for (const segment of parseMentionSegments(text)) {
    const raw =
      segment.kind === 'mention' ? buildMentionToken(segment.label, segment.id) : segment.value;
    if (out.length + raw.length > max) {
      if (segment.kind === 'text' && out.length < max)
        out += segment.value.slice(0, max - out.length);
      break;
    }
    out += raw;
  }
  return out;
}

/** Разворот токенов в отображаемый текст (копирование сообщения, сниппеты
 *  без чипов): `@[Артём](user:id)` → `Артём`. Пустой label → `@`. */
export function stripMentionTokens(text: string): string {
  return text.replace(new RegExp(MENTION_TOKEN_RE.source, 'g'), (_, label: string) => label || '@');
}

/** Сборка токена (автокомплит композера, правка чипа). `]` в label вырезается:
 *  первый `]` закрывает скобку грамматики — неподчищенный label молча
 *  деградировал бы токен до плоского текста (подозрение security-ревью). */
export function buildMentionToken(label: string, userId: string): string {
  return `@[${label.replace(/]/g, '')}](user:${userId})`;
}
