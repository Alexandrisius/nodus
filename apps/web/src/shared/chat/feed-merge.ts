import type { ChatMessage, Paginated } from '@nodus/contracts';

/**
 * Мердж серверной страницы ленты/треда в кэш (#243 + #307). Кэш сообщений —
 * ПЛОСКИЙ Paginated (форма не меняется: его читают ws-apply, оптимистичные
 * отправки, реакции, прочтения); поверх nextCursor живёт маркер истории
 * oldestLoadedSeq — seq самого старого сообщения догруженной истории.
 *
 * Правила (#243, «шквальная отправка» + e2e «удаление хвоста»):
 * - серверный снимок — истина для СВОЕГО диапазона seq (новейшее окно):
 *   подтверждённая запись, отсутствующая в снимке внутри окна, НЕ
 *   возвращается призраком (удалена/ушла из окна);
 * - летящие темпы (seq=0) переносятся в хвост — снимок о них не знает.
 *
 * Правила (#307, автопрогрузка истории):
 * - догруженная история (seq ∈ [oldestLoadedSeq, границы окна) СТАРШЕ
 *   свежего окна и в снимок не попадает просто потому, что окно новее —
 *   она ПЕРЕЖИВАЕТ рефеч (иначе первый же поллинг-рефеч стирал историю);
 * - маркер oldestLoadedSeq существует ⟺ в кэше есть история: без бэкфилла
 *   мердж ведёт себя ровно как прежний mergePendingIntoPage.
 * - nextCursor — граница «самое старое загруженное»: при выжившей истории
 *   держим прежний (окно могло уехать вперёд, но история в кэше по-прежнему
 *   доходит до старой границы), без истории — берём у снимка.
 */

/** Кэш страницы сообщений: Paginated + маркер догруженной истории (#307). */
export type HistoryPage = Paginated<ChatMessage> & {
  /** seq самого старого сообщения догруженной истории; нет бэкфилла — нет поля. */
  oldestLoadedSeq?: number;
};

export function mergeHistoryPage(
  prev: HistoryPage | undefined,
  server: Paginated<ChatMessage>,
): HistoryPage {
  if (!prev || prev.items.length === 0) return server;
  const serverOldest =
    server.items.length > 0 ? (server.items[0]?.seq as number) : Number.POSITIVE_INFINITY;
  const marker = prev.oldestLoadedSeq;
  const history: ChatMessage[] = [];
  for (const item of prev.items) {
    // История — только между маркером бэкфилла и границей свежего окна.
    if (marker !== undefined && item.seq >= marker && item.seq < serverOldest) {
      history.push(item);
    }
  }
  const serverIds = new Set(server.items.map((m) => m.id));
  const serverAuthorKeys = new Set(server.items.map((m) => `${m.author.id}|${m.clientMessageId}`));
  const carry = prev.items.filter(
    (m) =>
      m.seq === 0 &&
      !serverIds.has(m.id) &&
      !serverAuthorKeys.has(`${m.author.id}|${m.clientMessageId}`),
  );
  const items = [...history, ...server.items, ...carry];
  const hasHistory = history.length > 0;
  return {
    items,
    nextCursor: hasHistory ? prev.nextCursor : server.nextCursor,
    ...(hasHistory ? { oldestLoadedSeq: marker } : {}),
  };
}
