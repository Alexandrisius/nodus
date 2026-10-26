import { Permission } from '@nodus/contracts';

/** Вкладка раздела «Корреспонденция» (#55, §7.4): `/letters?tab=…`. */
export type LettersTab = 'new' | 'incoming' | 'outgoing' | 'access';

/**
 * Вкладка по адресу и правам — одна функция для топбара (подсветка) и
 * страницы (что рисовать): явная валидная вкладка; «Новые» без права
 * регистрации — «Входящие» (по ссылке коллеги без 403-экрана); без
 * параметра — «Новые» канцелярии (её работа), остальным — «Входящие».
 */
export function resolveLettersTab(
  search: URLSearchParams | { tab?: unknown },
  permissions: readonly string[],
): LettersTab {
  const canRegister = permissions.includes(Permission.CORRESPONDENCE_REGISTER);
  const tab = search instanceof URLSearchParams ? search.get('tab') : search.tab;
  if (tab === 'incoming' || tab === 'outgoing' || tab === 'access') return tab;
  if (tab === 'new' && canRegister) return 'new';
  return canRegister && (tab === undefined || tab === null || tab === 'new') ? 'new' : 'incoming';
}
