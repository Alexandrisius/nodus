/**
 * Решение «видно/не видно» для прыжка к сообщению (вердикт владельца
 * 25.09, п.1: переход по цитатам/закрепам НЕ отрывает низ ленты):
 * - цель ПОЛНОСТЬЮ видна в контейнере прокрутки → только вспышка-подсветка,
 *   скролла НЕТ (ноль движения при клике по видимой цитате);
 * - цель не видна (или видна частично) → плавный скролл ВНУТРИ контейнера
 *   ленты с выравниванием по центру, ЗАЖАТЫЙ диапазоном [0, maxScroll]:
 *   центр никогда не требует прокрутки за пределы контента, поэтому низ
 *   ленты остаётся прижат к низу области — «дыры» снизу и пустых зон нет.
 *
 * Почему не scrollIntoView и не scrollToMessage примитива MessageScroller:
 * нативный scrollIntoView скроллит ВСЕ прокручиваемые предки (лента может
 * уехать вместе со страницей), а примитив при align:'center' ДОРАЩИВАЕТ
 * спейсер снизу, чтобы дотянуться до центра — именно так возникала «дыра».
 */

export type RevealOutcome = 'visible' | 'scrolled';

/** Допуск на субпиксельные расхождения getBoundingClientRect. */
const EPSILON = 1;

/** Цель полностью в области прокрутки (без обрезки сверху/снизу). */
export function isMessageFullyVisible(el: HTMLElement, container: HTMLElement): boolean {
  const c = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return r.top >= c.top - EPSILON && r.bottom <= c.bottom + EPSILON;
}

/**
 * Показать цель: 'visible' — уже видна целиком (скролл не трогаем);
 * 'scrolled' — плавный центрирующий скролл внутри контейнера с клампом.
 * Возвращает исход, чтобы вызывающий не решил «скролл = всегда».
 */
export function revealMessage(el: HTMLElement, container: HTMLElement): RevealOutcome {
  if (isMessageFullyVisible(el, container)) return 'visible';
  const c = container.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const targetTop = r.top - c.top + container.scrollTop;
  // Центрирование: верх цели на (высота области − высота цели) / 2 сверху.
  const desired = targetTop - (container.clientHeight - r.height) / 2;
  const max = Math.max(0, container.scrollHeight - container.clientHeight);
  const top = Math.min(Math.max(desired, 0), max);
  container.scrollTo({ top, behavior: 'smooth' });
  return 'scrolled';
}
