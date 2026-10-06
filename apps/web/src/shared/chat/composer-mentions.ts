/**
 * Логика @упоминаний композера (#176): детектор запроса у каретки, слияние
 * кандидатов (участники первыми, затем серверный поиск справочника),
 * вставка/правка/удаление токена `@[текст](user:id)`. Всё чистыми
 * функциями — unit-тесты без React; клавиатура и данные — в хуке панели.
 */

import type { UserListItem, UserRef } from '@nodus/contracts';
import { buildMentionToken, MENTION_ALL_ID, parseMentionSegments, ui } from '@nodus/contracts';

/** Кандидат автокомплита: участник беседы, сотрудник справочника или
 *  спец-кандидат «Все» (#224). */
export interface MentionCandidate {
  id: string;
  displayName: string;
  positionName: string | null;
  departmentName: string | null;
  avatarUrl: string | null;
  /** Участник этой беседы — пингуется; прочие — с пометкой «не в беседе». */
  inConversation: boolean;
  /** «Все» (#224): пинг всем участникам, иконка вместо аватара. */
  isAll?: boolean;
}

/** Активный запрос автокомплита: `@` на границе слова + набранные буквы
 *  до каретки. null — автокомплит закрыт. */
export interface MentionQuery {
  /** Введённый после @ текст (может быть пустым — панель показывает участников). */
  query: string;
  /** Смещение '@' в тексте. */
  start: number;
  /** Конец запроса = позиция каретки. */
  end: number;
}

const QUERY_MAX = 32;

/** @запрос у каретки: '@' стоит в начале строки/после пробела или знака
 *  (email `a@b.by` панелью не становится), запрос — буквы/цифры/точки/
 *  дефисы без пробелов до каретки. */
export function detectMentionQuery(text: string, caret: number): MentionQuery | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at === -1) return null;
  const query = before.slice(at + 1);
  if (query.length > QUERY_MAX) return null;
  if (/[\s(]/.test(query)) return null; // пробел/скобка закрыли запрос
  const prev = at > 0 ? text[at - 1] : '';
  if (prev && /[\p{L}\p{M}\p{N}@]/u.test(prev)) return null; // середина слова/email
  return { query, start: at, end: caret };
}

/** Слияние кандидатов: «Все» закреплено первой строкой (показ при пустом
 *  запросе или вводе «все»), затем участники беседы (по подстроке query,
 *  без регистра), затем сотрудники поиска справочника, не-участники — с
 *  пометкой; дедуп по id, лимит списка. Справочник обогащает участников
 *  должностью/отделом (общий кэш usersList). Себя не предлагаем: сервер
 *  пингует только ≠ автора (упомянуть себя нельзя, канон Slack). */
export function mergeMentionCandidates(
  members: UserRef[],
  directory: UserListItem[],
  query: string,
  meId: string | undefined,
): MentionCandidate[] {
  const byId = new Map<string, MentionCandidate>();
  const lower = query.toLowerCase();
  const matches = (name: string) => name.toLowerCase().includes(lower);

  // «Все» (#224): первая строка панели — канал Slack @channel.
  const allLabel = ui.chat.mentionAllLabel.toLowerCase();
  if (lower.length === 0 || allLabel.startsWith(lower)) {
    byId.set(MENTION_ALL_ID, {
      id: MENTION_ALL_ID,
      displayName: ui.chat.mentionAllLabel,
      positionName: ui.chat.mentionAllNote,
      departmentName: null,
      avatarUrl: null,
      inConversation: true,
      isAll: true,
    });
  }

  for (const member of members) {
    if (member.id === meId) continue;
    if (!matches(member.displayName)) continue;
    byId.set(member.id, {
      id: member.id,
      displayName: member.displayName,
      positionName: null,
      departmentName: null,
      avatarUrl: member.avatarUrl,
      inConversation: true,
    });
  }
  for (const person of directory) {
    const existing = byId.get(person.id);
    if (existing) {
      existing.positionName = person.positionName;
      existing.departmentName = person.departmentName;
      continue;
    }
    if (byId.size >= MENTION_CANDIDATES_MAX) continue;
    if (person.id === meId) continue;
    if (!matches(person.displayName) && !matches(person.email)) continue;
    byId.set(person.id, {
      id: person.id,
      displayName: person.displayName,
      positionName: person.positionName,
      departmentName: person.departmentName,
      avatarUrl: person.avatarUrl,
      inConversation: false,
    });
  }
  return [...byId.values()].slice(0, MENTION_CANDIDATES_MAX);
}

/** Лимит панели автокомплита (канон пикеров — фикс-высота, без прокрутки
 *  вселенной). */
export const MENTION_CANDIDATES_MAX = 8;

/** Вставка токена выбранного кандидата: заменяет «@запрос» на токен с полным
 *  ФИО + пробел, каретка — после пробела. */
export function insertMentionToken(
  text: string,
  query: MentionQuery,
  user: { id: string; displayName: string },
): { text: string; caret: number } {
  const token = buildMentionToken(user.displayName, user.id) + ' ';
  return {
    text: text.slice(0, query.start) + token + text.slice(query.end),
    caret: query.start + token.length,
  };
}

/** Токен под смещением каретки (клик по чипу): label-часть = видимая
 *  ширина чипа, хвост (user:id) — невидим. */
export interface CaretMention {
  index: number;
  id: string;
  label: string;
  start: number;
  end: number;
}

function lengthOfToken(label: string, id: string): number {
  return `@[${label}](user:${id})`.length;
}

/** Все токены текста (правка поповером, оверлей). */
export function mentionTokens(text: string): CaretMention[] {
  let cursor = 0;
  let index = 0;
  const tokens: CaretMention[] = [];
  for (const segment of parseMentionSegments(text)) {
    if (segment.kind === 'mention') {
      tokens.push({
        index,
        id: segment.id,
        label: segment.label,
        start: cursor,
        end: cursor + lengthOfToken(segment.label, segment.id),
      });
      cursor = tokens[tokens.length - 1]!.end;
      index += 1;
    } else {
      cursor += segment.value.length;
    }
  }
  return tokens;
}

/** Замена отображаемого текста N-го токена (поповер правки): привязка по id
 *  не меняется — редактируется только label. Пустой label не применяется. */
export function replaceMentionLabel(text: string, index: number, label: string): string {
  const token = mentionTokens(text)[index];
  if (!token || label.trim().length === 0) return text;
  return text.slice(0, token.start) + buildMentionToken(label, token.id) + text.slice(token.end);
}

/** Удаление N-го токена целиком (корзина поповера): с токеном уходит и
 *  хвост-разметка, соседний текст склеивается (пробел между — руками). */
export function removeMentionToken(text: string, index: number): string {
  const token = mentionTokens(text)[index];
  if (!token) return text;
  return text.slice(0, token.start) + text.slice(token.end);
}

/** Клик в НЕВИДИМУЮ часть токена (хвост `](user:uuid)`): каретке место не
 *  внутри разметки — вернуть позицию ЗА токен (правка label — только через
 *  поповер по видимой части чипа). null — смещение вне токенов. */
export function caretBeyondToken(text: string, offset: number): number | null {
  for (const token of mentionTokens(text)) {
    if (offset > token.start + 2 + token.label.length && offset < token.end) return token.end;
  }
  return null;
}

/** Кламп каретки для стрелок ←/→: позиция строго внутри токена ведёт к
 *  ближней границе ПО НАПРАВЛЕНИЮ (влево → start, вправо → end) — каретка
 *  не живёт в разметке токена, тупика ArrowLeft у токена нет. null — вне
 *  токенов, позиция не трогается. */
export function clampCaretByArrow(
  text: string,
  pos: number,
  direction: 'left' | 'right',
): number | null {
  for (const token of mentionTokens(text)) {
    if (pos > token.start && pos < token.end) {
      return direction === 'left' ? token.start : token.end;
    }
  }
  return null;
}

/** Атомарное удаление токена (#224): Backspace у КОНЦА токена (или внутри
 *  него) и Delete у НАЧАЛА (или внутри) сносят токен ЦЕЛИКОМ — чип никогда
 *  не разбирается в сырую разметку `@[…](user:…)` посимвольно. null —
 *  обычное поведение браузера (каретка вне токенов). */
export function deleteTokenKey(
  text: string,
  caret: number,
  key: 'Backspace' | 'Delete',
): { text: string; caret: number } | null {
  for (const token of mentionTokens(text)) {
    const inside = caret > token.start && caret < token.end;
    const atEdge = key === 'Backspace' ? caret === token.end : caret === token.start;
    if (!inside && !atEdge) continue;
    return {
      text: text.slice(0, token.start) + text.slice(token.end),
      caret: token.start,
    };
  }
  return null;
}

/** Отображаемое смещение каретки (#224): позиции в невидимом хвосте токена
 *  (label-конец..token-конец) И сразу за токеном (+1 — хвостовой пробел
 *  вставки автокомплита) показываются у ПРАВОГО КРАЯ чипа — каретка
 *  визуально «сразу за чипом», а не за 45 символами прозрачного хвоста
 *  `](user:uuid)` (и не строкой ниже при переносе хвоста). Хвост рисует
 *  кастомная каретка композера (сырые глифы прозрачны). */
export function displayCaretOffset(text: string, offset: number): number {
  for (const token of mentionTokens(text)) {
    const labelEnd = token.start + 2 + token.label.length; // после `@[label`
    if (offset > labelEnd && offset <= token.end + 1) return labelEnd;
  }
  return offset;
}
