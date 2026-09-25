import { wsDebugEnabled } from '../socket/ws-debug.js';

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
 *  зарегистрированному (ленте канала) — «закрыл тред → мигает канал».
 */
const registry = new Map<string, HTMLTextAreaElement>();
let activeId: string | null = null;
let modality: 'pointer' | 'key' | 'other' = 'other';
let installed = false;

/** Роли Radix-контента оверлей-слоёв (dialog/popover → role=dialog,
 *  dropdown/context-menu → role=menu, select → role=listbox; DOM-проба #71). */
const OVERLAY_LAYER_ROLES = new Set(['dialog', 'alertdialog', 'menu', 'listbox']);

function isEditable(el: Element | null): el is HTMLElement {
  return (
    el instanceof HTMLElement &&
    (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
  );
}

/** Диагностика «супер-курсора» (#104 раунд 2): при ?wsdebug=1 каждый ранний
 *  выход stealFocus объясняет себя — застрявший гард виден в console сразу. */
function debugSkip(guard: string): void {
  if (!wsDebugEnabled) return;
  const selection = window.getSelection();
  console.log(
    '[ws] stealFocus skip:',
    guard,
    '| activeElement:',
    document.activeElement?.constructor.name,
    document.activeElement?.tagName,
    document.activeElement?.getAttribute?.('data-slot') ?? '',
    '| selection collapsed:',
    selection?.isCollapsed ?? 'n/a',
    '| modality:',
    modality,
  );
}

/**
 * Активный элемент живёт в открытом оверлей-слое (диалог, поповер, меню,
 * селект), который владеет фокусом, пока слой открыт (#71: иначе
 * DismissableLayer закроет панель по focusOutside). Слои-ПРЕДКИ, содержащие
 * сам композер, слоем НЕ считаются (вердикт 25.09): карточка-слайдер — тоже
 * role="dialog", но это ПОСТОЯННОЕ вместилище чата, а не всплывающий слой —
 * её «владение» фокусом никогда не кончается, и без этой поправки возврат
 * курсора в композер слайдера («Ответить»/«Редактировать», обычные клики)
 * блокировался навсегда. Проверяется вся цепочка предков: первый слой,
 * НЕ содержащий композер, — конкурирующий владелец (портал Radix поверх
 * слайдера, диалог поверх страницы).
 */
function insideOverlayLayer(el: Element | null, composer: Element | null = null): boolean {
  let node: Element | null = el;
  while (node instanceof Element) {
    if (node.hasAttribute('role') && OVERLAY_LAYER_ROLES.has(node.getAttribute('role') ?? '')) {
      if (!(composer && node.contains(composer))) return true;
    }
    node = node.parentElement;
  }
  return false;
}

function stealFocus(): void {
  const el = activeId ? registry.get(activeId) : undefined;
  if (!el || document.activeElement === el) {
    if (!el) debugSkip('no-active-composer');
    return;
  }
  if (isEditable(document.activeElement)) {
    debugSkip('editable-active-element');
    return;
  }
  if (insideOverlayLayer(document.activeElement, el)) {
    debugSkip('overlay-layer');
    return;
  }
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed) {
    debugSkip('text-selection');
    return;
  }
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
    if (modality !== 'pointer') return;
    // Клик по кнопке фокусирует её — возвращаем курсор сразу (селекции на
    // кнопках не бывает; пустое место и карточки обрабатывает click ниже).
    // Страховка (#104 р.2): фокус может получить и НЕ-кнопочный кликабельный
    // контейнер с tabindex (скроллер ленты) — правило то же: оверлей-слой
    // и редактируемые поля выше не отдаём, остальное после мыши возвращаем.
    if (target instanceof HTMLElement && (target.closest('button') || target.tabIndex >= 0)) {
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

/** Композер scope смонтирован И ВИДЕН (вердикт 25.09: фокус/действия «за
 *  спиной» накрытых карточек запрещены — dormant-карточка под слайдером
 *  держит композер в DOM, но content-visibility:hidden выводит его из
 *  рендеринга; checkVisibility() это видит, старые движки — fallback «виден»). */
export function hasVisibleComposer(id: string): boolean {
  const el = registry.get(id);
  if (!el) return false;
  return typeof el.checkVisibility === 'function' ? el.checkVisibility() : true;
}

/** Курсор в композер БЕСЕДЫ после закрытия глобальных диалогов (пересылка,
 *  удаление, откреп — баг #91): диалог не знает scope ленты (feed/Conversation),
 *  пробуем оба ключа зарегистрированных композеров беседы. */
export function focusConversationComposerWhenFree(conversationId: string, deadlineMs = 600): void {
  for (const key of [`conversation:${conversationId}`, `feed:${conversationId}`]) {
    if (registry.has(key)) {
      focusComposerWhenFree(key, deadlineMs);
      return;
    }
  }
}

/** Фокус в композер ПОСЛЕ закрытия оверлей-слоя (пункты контекстного меню
 *  «Ответить»/«Редактировать»): Radix возвращает фокус триггеру на размонтаже
 *  контента (после exit-анимации) — немедленный focus перетирается (баг-
 *  вердикт 24.09: «после Редактировать курсор не в поле»). Ждём кадров, пока
 *  activeElement вне редактируемых и вне оверлей-слоёв, тогда фокусим.
 *  Постоянные вместилища композера (карточка-слайдер, role="dialog") ожидание
 *  не держат — см. insideOverlayLayer (вердикт 25.09). */
export function focusComposerWhenFree(id: string, deadlineMs = 600): void {
  const started = performance.now();
  function tick() {
    const el = registry.get(id);
    if (!el || document.activeElement === el) return;
    if (isEditable(document.activeElement) || insideOverlayLayer(document.activeElement, el)) {
      if (performance.now() - started < deadlineMs) requestAnimationFrame(tick);
      return;
    }
    el.focus({ preventScroll: true });
  }
  requestAnimationFrame(tick);
}
