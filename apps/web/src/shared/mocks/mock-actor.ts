import type { UserRef } from '@nodus/contracts';

import { isDomainMocked } from '../api/api-mock-config.js';
import { useAuthStore } from '../auth-store.js';
import { currentAuthUser, demoUserListItems } from './data/users.js';

/**
 * Актёр мок-доменов (#48, фаза 2). В покомпонентном режиме (живой логин +
 * моки остальных доменов) «кто я» берётся из живого auth-стора, а не из
 * статического currentAuthUser — иначе приёмка видит несуществующего
 * демо-пользователя (А. Климович вместо живого админа).
 *
 * ОСОЗНАННЫЙ СКОУП (#48): актёр применяется только к точкам ПОВЕДЕНЧЕСКОЙ
 * идентификации мок-хендлеров («только автор», прочтения, ответы от имени
 * «меня») — пока только в домене chat. ДЕМО-ДАННЫЕ остаются статичными:
 * чужие авторы сообщений/задач/писем не подменяются живым юзером, а домены
 * tasks/letters продолжают рисовать демо-актёра (их userRef() бросает на
 * незнакомых id — перевод потребует actorRef в данных, не нужно до приёмки
 * этих треков). При живом auth сам auth-домен выключен, его хендлеры
 * статичного актёра не выполняются.
 */

/** Минимальный «кто я»: живой профиль может не иметь полей мок-юзера. */
export interface MockActor {
  id: string;
  displayName: string;
  email: string;
}

/** Текущий актёр моков: живой юзер из auth-стора (когда auth НЕ мокается),
 *  иначе — демо-текущий пользователь. Читается на каждый вызов: актёр
 *  меняется при входе/выходе без пересборки хендлеров. */
export function getMockActor(): MockActor {
  if (!isDomainMocked('auth')) {
    const user = useAuthStore.getState().user;
    if (user) return user; // AuthUser структурно ⊇ MockActor
    // Живой auth ещё не подгрузил карточку me (bootstrap в полёте):
    // демо-актёр лучше падения хендлера, моки до логина не вызываются.
  }
  return currentAuthUser;
}

/** UserRef актёра для ответов мок-хендлеров: демо-пользователь — полный ref
 *  из справочника (с аватаром-заглушкой), живой — минимальный (его аватара
 *  вне демо-справочника). */
export function actorUserRef(): UserRef {
  const actor = getMockActor();
  const demo = demoUserListItems.find((u) => u.id === actor.id);
  if (demo) return { id: demo.id, displayName: demo.displayName, avatarUrl: demo.avatarUrl };
  return { id: actor.id, displayName: actor.displayName, avatarUrl: null };
}
