import { describe, expect, it } from 'vitest';

import {
  hasCardsInSearch,
  resolveForwardRoute,
  topCardIsMessengerInSearch,
} from './forward-navigation.js';

/** Маршрутизация результата пересылки (вердикт 25.09): результат всегда
 *  ВИДЕН — замена содержимого мессенджер-карточки, маршрут страницы /chat
 *  без накрытого стека, видимый композер приёмника или карточка поверх
 *  сущности. Никаких действий под слайдером. */
describe('forward-navigation', () => {
  it('верхняя карточка мессенджер — замена содержимого слайдера (высший приоритет)', () => {
    expect(
      resolveForwardRoute({
        topCardIsMessenger: true,
        hasCards: true,
        onChatPage: true,
        composerVisible: true,
      }),
    ).toBe('replace-messenger');
  });

  it('страница /chat без стека — маршрут страницы', () => {
    expect(
      resolveForwardRoute({
        topCardIsMessenger: false,
        hasCards: false,
        onChatPage: true,
        composerVisible: false,
      }),
    ).toBe('navigate-chat');
  });

  it('СТЕК НЕПУСТ + /chat — страницу НЕ навигируем (она накрыта карточкой)', () => {
    expect(
      resolveForwardRoute({
        topCardIsMessenger: false,
        hasCards: true,
        onChatPage: true,
        composerVisible: false,
      }),
    ).toBe('open-card');
  });

  it('видимый композер приёмника (чат верхней карточки сущности) — фокус в него', () => {
    expect(
      resolveForwardRoute({
        topCardIsMessenger: false,
        hasCards: true,
        onChatPage: false,
        composerVisible: true,
      }),
    ).toBe('focus-composer');
  });

  it('не видимый (dormant) композер под слайдером НЕ считается — иначе скрытое действие', () => {
    expect(
      resolveForwardRoute({
        topCardIsMessenger: true,
        hasCards: true,
        onChatPage: false,
        composerVisible: false,
      }),
    ).toBe('replace-messenger');
  });

  it('пробы search: пусто, мусор, стек с мессенджером на вершине и в середине', () => {
    expect(hasCardsInSearch('')).toBe(false);
    expect(hasCardsInSearch('?tab=chats')).toBe(false);
    expect(hasCardsInSearch('?cards=task:1')).toBe(true);
    expect(topCardIsMessengerInSearch('?cards=task:1,messenger:2')).toBe(true);
    expect(topCardIsMessengerInSearch('?cards=messenger:2,task:1')).toBe(false);
    expect(topCardIsMessengerInSearch('?cards=task:1')).toBe(false);
    expect(topCardIsMessengerInSearch('?tab=chats&cards=')).toBe(false);
  });
});
