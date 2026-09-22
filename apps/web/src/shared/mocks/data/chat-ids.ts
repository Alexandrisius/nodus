/** Id-хелперы демо-бесед и сообщений: вынесены из chat.ts, чтобы наборы
 *  бесед/сообщений (chat.ts, chat-letters.ts) не образовывали цикл импортов. */
export const cid = (n: number): string => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const mid = (n: number): string => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
