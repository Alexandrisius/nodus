/**
 * Исходящая очередь беседы (#243, «шквальная отправка»): POST-отправки одной
 * беседы сериализуются. Сервер назначает seq в порядке приёма транзакций —
 * параллельные запросы обрабатываются в произвольном порядке, и лента после
 * рефечей переупорядочивалась («пляска» сообщений). Очередь даёт
 * seq = порядок кликов: серверный порядок совпадает с порядком темпов в кэше,
 * замена темпа серверной записью не двигает строки.
 *
 * Модель Telegram (I4): UI отрисовывает каждое сообщение мгновенно (темп —
 * onMutate мутации, очередь не участвует), сериализуется только сеть —
 * «сервер отправляет когда надо». Ошибка головы не рвёт хвост: задача
 * стартует независимо от исхода предыдущей. Ключ — беседа: независимые
 * разговоры не ждут друг друга. Очередь живёт в вкладке; вкладка закрыта —
 * несведённые темпы умирают вместе с кэшем (как и раньше).
 */
const chains = new Map<string, Promise<unknown>>();

const noop = (): void => undefined;

export function enqueueSend<T>(conversationId: string, task: () => Promise<T>): Promise<T> {
  const prev = chains.get(conversationId) ?? Promise.resolve();
  const run = prev.then(task, task);
  const tail = run.then(noop, noop);
  chains.set(conversationId, tail);
  void tail.then(() => {
    if (chains.get(conversationId) === tail) chains.delete(conversationId);
  });
  return run;
}
