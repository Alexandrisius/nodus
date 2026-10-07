import type { ChatMessage, Paginated } from '@nodus/contracts';

/**
 * Мердж летящих отправок в серверную страницу ленты/треда (#243,
 * «шквальная отправка»). Рефеч (WS-батчер, fallback-поллинг 60 с) приносит
 * снимок страницы, в котором нет ещё неподтверждённых темпов (seq=0) и
 * сообщений, применённых локально ПОСЛЕ снимка (onSuccess/эхо) — наивная
 * замена кэша удаляла их с экрана до следующего события. Из текущего кэша
 * в хвост страницы переносятся записи, которых серверная страница не знает:
 * темпы (seq=0, дедуп по clientMessageId) и локальные записи с seq новее
 * последнего серверного (рефеч-ответ устарел относительно локальных
 * применений). Порядок: серверная страница + хвост летящих — темпы всегда
 * в конце, подтверждение заменяет темп на месте.
 */
export function mergePendingIntoPage(
  prevItems: readonly ChatMessage[] | undefined,
  server: Paginated<ChatMessage>,
): Paginated<ChatMessage> {
  if (!prevItems || prevItems.length === 0) return server;

  const serverIds = new Set(server.items.map((m) => m.id));
  // Связка (автор + ключ отправки): ключ уникален в рамках автора (БД) —
  // чужая запись с тем же ключом темп не «подтверждает».
  const serverAuthorKeys = new Set(server.items.map((m) => `${m.author.id}|${m.clientMessageId}`));
  let serverLastSeq = 0;
  for (const m of server.items) if (m.seq > serverLastSeq) serverLastSeq = m.seq;

  const carry = prevItems.filter(
    (m) =>
      (m.seq === 0 || m.seq > serverLastSeq) &&
      !serverIds.has(m.id) &&
      !serverAuthorKeys.has(`${m.author.id}|${m.clientMessageId}`),
  );
  if (carry.length === 0) return server;
  return { ...server, items: [...server.items, ...carry] };
}
