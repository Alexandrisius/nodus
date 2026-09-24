/**
 * Маршрутизация результата пересылки (вердикт владельца 25.09, п.4):
 * выбор цели и результат должны быть ВИДНЫ пользователю — никаких действий
 * «за спиной» под слайдером. Приоритет хозяев:
 * 1. replace-messenger — верхняя карточка стека мессенджер: замена её
 *    содержимого (результат виден в слайдере);
 * 2. navigate-chat — страница /chat и стек пуст (ничего не накрывает);
 * 3. focus-composer — композер приёмника уже смонтирован и ВИДИМ (чат
 *    верхней карточки сущности) — бар пересылки появляется в нём;
 * 4. open-card — карточка мессенджера поверх сущности (легитимная роль
 *    слайдера: чат ПОВЕРХ карточек).
 * Пробы стека читают search напрямую (на момент решения это точное
 * состояние URL; shared не импортирует каркас — I6).
 */

export type ForwardRoute = 'replace-messenger' | 'navigate-chat' | 'focus-composer' | 'open-card';

export function resolveForwardRoute(input: {
  /** Верхняя карточка стека — мессенджер. */
  topCardIsMessenger: boolean;
  /** Стек карточек непуст (страница накрыта). */
  hasCards: boolean;
  /** Текущий маршрут — страница мессенджера /chat. */
  onChatPage: boolean;
  /** Композер беседы-приёмника смонтирован и виден. */
  composerVisible: boolean;
}): ForwardRoute {
  if (input.topCardIsMessenger) return 'replace-messenger';
  if (!input.hasCards && input.onChatPage) return 'navigate-chat';
  if (input.composerVisible) return 'focus-composer';
  return 'open-card';
}

/** Стек из search «task:<id>,messenger:<id>» — непустой. */
export function hasCardsInSearch(search: string): boolean {
  return parseKinds(search).length > 0;
}

/** Верхняя карточка стека — мессенджер (последняя пара kind:id). */
export function topCardIsMessengerInSearch(search: string): boolean {
  const kinds = parseKinds(search);
  return kinds[kinds.length - 1] === 'messenger';
}

function parseKinds(search: string): string[] {
  const raw = new URLSearchParams(search).get('cards') ?? '';
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.includes(':'))
    .map((part) => part.slice(0, part.indexOf(':')));
}
