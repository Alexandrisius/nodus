import type { EventDispatcher } from '../../src/core/events/event-dispatcher.js';
import type { PrismaService } from '../../src/core/database/prisma.service.js';

/** Сколько проходов диспетчера крутить, прежде чем признать событие недоставленным. */
const MAX_PASSES = 40;

/**
 * Доставка СОБСТВЕННОГО события теста (#486).
 *
 * `EventDispatcher.dispatchPending()` — один проход по глобальному outbox,
 * не более `BATCH_SIZE` (50) событий за раз и в порядке `seq`: общая тестовая
 * БД копит неопубликованные события соседних наборов, и один проход легко
 * выбирает чужие, оставляя своё. Тест обязан ждать СВОЁ событие, а не факт
 * «один проход отработал»: крутим проходы, пока нужная строка не опубликована.
 *
 * Детерминированно: без sleep, без угадывания количества событий; исчерпание
 * лимита проходов — явная ошибка с состоянием события (а не таймаут ассерта).
 */
export async function dispatchOwnEvent(
  dispatcher: EventDispatcher,
  prisma: PrismaService,
  eventId: string,
): Promise<void> {
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { publishedAt: true },
    });
    if (event?.publishedAt) return;
    await dispatcher.dispatchPending();
  }
  const state = await prisma.event.findUnique({
    where: { id: eventId },
    select: { type: true, aggregateId: true, publishedAt: true },
  });
  throw new Error(
    `Событие ${eventId} не доставлено за ${MAX_PASSES} проходов диспетчера: ${JSON.stringify(state)}`,
  );
}

/** id события агрегата по типу — что именно ждать в `dispatchOwnEvent`. */
export async function eventIdOf(
  prisma: PrismaService,
  input: { type: string; aggregateId: string },
): Promise<string> {
  const row = await prisma.event.findFirstOrThrow({
    where: input,
    select: { id: true },
    orderBy: { seq: 'desc' },
  });
  return row.id;
}
