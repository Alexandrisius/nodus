import type { ChatMessage, Paginated } from '@nodus/contracts';

/**
 * Мердж летящих отправок в серверную страницу ленты/треда (#243,
 * «шквальная отправка»). Рефеч (WS-батчер, fallback-поллинг 60 с) приносит
 * снимок страницы, в котором нет ещё неподтверждённых темпов (seq=0) — наивная
 * замена кэша удаляла их с экрана до следующего события. Из текущего кэша в
 * хвост страницы переносятся ТОЛЬКО темпы: подтверждённые записи переносить
 * нельзя — absent-в-ответе подтверждённая запись означает «сервер её не
 * отдал» (удалена/ушла из окна), и перенос возвращал призрака (e2e «удаление
 * хвоста»: у получателя не исчезало последнее сообщение). Гонка «локальное
 * подтверждение опережает снимок» закрыта без переноса: WS-событие и
 * REST-ответ приходят ПОСЛЕ фиксации сервера, а любой рефеч, стартовавший
 * после фиксации, содержит запись в снимке; стартовавший раньше — успеет
 * примениться до onSuccess/эха, и темп (seq=0) перенесётся.
 */
export function mergePendingIntoPage(
  prevItems: readonly ChatMessage[] | undefined,
  server: Paginated<ChatMessage>,
): Paginated<ChatMessage> {
  if (!prevItems || prevItems.length === 0) return server;

  const serverIds = new Set(server.items.map((m) => m.id));
  const serverAuthorKeys = new Set(server.items.map((m) => `${m.author.id}|${m.clientMessageId}`));
  const carry = prevItems.filter(
    (m) =>
      m.seq === 0 &&
      !serverIds.has(m.id) &&
      !serverAuthorKeys.has(`${m.author.id}|${m.clientMessageId}`),
  );
  if (carry.length === 0) return server;
  return { ...server, items: [...server.items, ...carry] };
}
