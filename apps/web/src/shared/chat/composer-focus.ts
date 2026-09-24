/**
 * «Вечный курсор» композера (канон Телеграм, вердикт владельца 14.09.2026):
 * пока открыт чат/канал/тред — мигающий курсор живёт в его композере; обычные
 * клики по UI (карточки, кнопки, пустое место, пункты меню) возвращают фокус
 * в активный композер. Фокус ПЕРЕДАЁТСЯ только вручную: клик по другому
 * редактируемому полю (другой композер, поиск, палитра) делает его активным
 * владельцем курсора либо временно (не-композер: следующий обычный клик
 * вернёт курсор в композер).
 *
 * Правила безопасности (иначе «вечный фокус» ломает продукт):
 * - клавиатура (Tab) фокус НЕ возвращает — иначе ловушка фокуса для
 *   клавиатурной навигации (модальность отслеживается pointerdown/keydown);
 * - несвёрнутая селекция текста фокус НЕ возвращает — выделение и копирование
 *   текста сообщения важнее мигающего курсора;
 * - открытый оверлей-слой (диалог, поповер, меню, селект — role на контенте
 *   Radix) владеет фокусом: пока `activeElement` внутри слоя, курсор НЕ
 *   возвращается — иначе DismissableLayer закроет панель по focusOutside
 *   (баг #71: пикер даты в карточке регистрации вспыхивал и пропадал).
 *   Канон сохраняется: после закрытия слоя автофокус Radix возвращает фокус
 *   на триггер, focusin-гард планирует steal уже вне слоя;
 * - фокус возвращается с preventScroll — лента не прыгает при возврате;
 * - анрегистр активного композера (закрыли тред) передаёт курсор ранее
 *   зарегистрированному (ленте канала) — «закрыл тред → мигает канал».
 */
const registry = new Map<string, HTMLTextAreaElement>();
let activeId: string | null = null;
let modality: 'pointer' | 'key' | 'other' = 'other';
let installed = false;

/** Роли Radix-контента оверлей-слоёв (dialog/popover → role=dialog,
 *  dropdown/context-menu → role=menu, select → role=listbox; DOM-проба #71). */
const OVERLAY_LAYER_SELECTOR =
  '[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"]';

function isEditable(el: Element | null): el is HTMLElement {
  return (
    el instanceof HTMLElement &&
    (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
  );
}

function insideOverlayLayer(el: Element | null): boolean {
  return el instanceof Element && el.closest(OVERLAY_LAYER_SELECTOR) !== null;
}

function stealFocus(): void {
  const el = activeId ? registry.get(activeId) : undefined;
  if (!el || document.activeElement === el) return;
  if (isEditable(document.activeElement)) return;
  if (insideOverlayLayer(document.activeElement)) return;
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed) return;
  el.focus({ preventScroll: true });
}

function install(): void {
  installed = true;
  // Модальность ввода: возвращаем фокус ТОЛЬКО после мышиных кликов левой
  // кнопкой (правая — контекстное меню Radix: его фокус не трогаем).
  document.addEventListener(
    'pointerdown',
    (e) => {
      modality = e.button === 0 ? 'pointer' : 'other';
    },
    true,
  );
  document.addEventListener(
    'keydown',
    () => {
      modality = 'key';
    },
    true,
  );
  document.addEventListener('focusin', (e) => {
    const target = e.target as Element | null;
    if (isEditable(target)) {
      for (const [id, el] of registry) {
        if (el === target) activeId = id;
      }
      return;
    }
    // Клик по кнопке фокусирует её — возвращаем курсор сразу (селекции на
    // кнопках не бывает; пустое место и карточки обрабатывает click ниже).
    if (modality !== 'pointer') return;
    if (target instanceof HTMLElement && target.closest('button')) {
      requestAnimationFrame(stealFocus);
    }
  });
  document.addEventListener('click', () => {
    if (modality !== 'pointer') return;
    // click приходит ПОСЛЕ mouseup: если пользователь тянул выделение текста,
    // селекция несвёрнута — stealFocus её уважит и не тронет фокус.
    requestAnimationFrame(stealFocus);
  });
}

/** Композер монтируется: становится активным владельцем курсора и ЗАБИРАЕТ
 *  его сразу (autoFocus в commit-фазе переживает StrictMode-цикл
 *  mount→cleanup→mount только вместе с этим фокусом: cleanup промежуточной
 *  итерации возвращает курсор ранее зарегистрированному, повторный register
 *  без focus оставил бы курсор не там — трассировка focus/focusin, 14.09.2026). */
export function registerComposer(id: string, el: HTMLTextAreaElement): void {
  registry.set(id, el);
  activeId = id;
  if (!installed) install();
  el.focus({ preventScroll: true });
}

/** Композер размонтируется; активный передаёт курсор следующему по регистрации. */
export function unregisterComposer(id: string, el: HTMLTextAreaElement): void {
  if (registry.get(id) !== el) return;
  registry.delete(id);
  if (activeId !== id) return;
  activeId = registry.keys().next().value ?? null;
  const next = activeId ? registry.get(activeId) : undefined;
  if (next) next.focus({ preventScroll: true });
}

/** Явная передача курсора конкретному композеру (действия «Ответить»/
 *  «Редактировать» из контекстного меню — канон Telegram: фокус в поле). */
export function focusComposer(id: string): void {
  registry.get(id)?.focus({ preventScroll: true });
}

/** Композер scope смонтирован сейчас (диалог пересылки решает: фокусировать
 *  открытый чат-приёмник или открывать его маршрутом/карточкой). */
export function hasComposer(id: string): boolean {
  return registry.has(id);
}

/** Фокус в композер ПОСЛЕ закрытия оверлей-слоя (пункты контекстного меню
 *  «Ответить»/«Редактировать»): Radix возвращает фокус триггеру на размонтаже
 *  контента (после exit-анимации) — немедленный focus перетирается (баг-
 *  вердикт 24.09: «после Редактировать курсор не в поле»). Ждём кадров, пока
 *  activeElement вне редактируемых и вне оверлей-слоёв, тогда фокусим. */
export function focusComposerWhenFree(id: string, deadlineMs = 600): void {
  const started = performance.now();
  function tick() {
    const el = registry.get(id);
    if (!el || document.activeElement === el) return;
    if (isEditable(document.activeElement) || insideOverlayLayer(document.activeElement)) {
      if (performance.now() - started < deadlineMs) requestAnimationFrame(tick);
      return;
    }
    el.focus({ preventScroll: true });
  }
  requestAnimationFrame(tick);
}
