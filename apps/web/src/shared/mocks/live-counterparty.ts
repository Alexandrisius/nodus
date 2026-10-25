import type { CounterpartyRef } from '@nodus/contracts';
import { bypass } from 'msw';

import { counterpartyRefById } from './data/counterparties.js';

/** До #55/#52: домены писем и проектов на моках, а справочник контрагентов —
 *  живой (CRM, #460). Демо-ссылка резолвится из мок-данных; живой
 *  контрагент — запросом к API через bypass (MSW его не перехватывает) с
 *  авторизацией исходного запроса: после перехода CRM на живой API
 *  регистрация письма на :5173 иначе падала бы 422 на живых контрагентах
 *  (находка Д7). Общий модуль — потребители letters- и projects-хендлеры. */
export async function resolveCounterpartyRef(
  counterpartyId: string,
  request: Request,
): Promise<CounterpartyRef | null> {
  const demo = counterpartyRefById(counterpartyId);
  if (demo) return demo;
  try {
    const res = await fetch(
      bypass(new URL(`/api/v1/counterparties/${counterpartyId}`, request.url), {
        headers: { authorization: request.headers.get('authorization') ?? '' },
      }),
    );
    if (!res.ok) return null;
    const card = (await res.json()) as { id?: string; shortName?: string };
    return card.id && card.shortName ? { id: card.id, name: card.shortName } : null;
  } catch {
    return null;
  }
}

/** Фильтр мок-связей по контрагенту из живого справочника: демо-письма и
 *  демо-проекты ссылаются на мок-id, а карточка открыта по живому — совпадение
 *  по id ИЛИ по названию (демо-справочник песочницы заведён с теми же
 *  названиями). Только для моков — в продукте связь строго по id. */
export async function counterpartyMatcher(
  counterpartyId: string,
  request: Request,
): Promise<(ref: CounterpartyRef | null) => boolean> {
  const live = await resolveCounterpartyRef(counterpartyId, request);
  return (ref) => ref !== null && (ref.id === counterpartyId || ref.name === live?.name);
}
