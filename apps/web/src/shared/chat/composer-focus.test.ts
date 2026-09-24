// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { focusComposerWhenFree, registerComposer, unregisterComposer } from './composer-focus.js';

/** Кадр rAF — именно в нём stealFocus исполняется после focusin/click. */
function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** Левый pointerdown ставит модальность «pointer» (условие возврата курсора). */
function leftPointerDown(): void {
  document.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true }));
}

describe('composer-focus — «вечный курсор» и оверлей-слои (регрессия #71)', () => {
  let composer: HTMLTextAreaElement;

  beforeEach(() => {
    composer = document.createElement('textarea');
    document.body.append(composer);
    registerComposer('test-composer', composer);
  });

  afterEach(() => {
    unregisterComposer('test-composer', composer);
    composer.remove();
    document.body.innerHTML = '';
  });

  it('обычный клик по кнопке ВНЕ слоя — курсор возвращается в композер (канон)', async () => {
    const btn = document.createElement('button');
    document.body.append(btn);
    leftPointerDown();
    btn.focus();
    await frame();
    expect(document.activeElement).toBe(composer);
  });

  it.each(['dialog', 'alertdialog', 'menu', 'listbox'])(
    'фокус внутри role=%s — НЕ крадётся (иначе DismissableLayer закроет панель по focusOutside)',
    async (role) => {
      const layer = document.createElement('div');
      layer.setAttribute('role', role);
      const btn = document.createElement('button');
      layer.append(btn);
      document.body.append(layer);
      leftPointerDown();
      btn.focus();
      await frame();
      expect(document.activeElement).toBe(btn);
    },
  );

  it('bubbling-click при фокусе внутри слоя — тоже не крадёт', async () => {
    const layer = document.createElement('div');
    layer.setAttribute('role', 'dialog');
    const btn = document.createElement('button');
    layer.append(btn);
    document.body.append(layer);
    leftPointerDown();
    btn.focus();
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await frame();
    expect(document.activeElement).toBe(btn);
  });

  it('слой закрылся, фокус на триггере — курсор возвращается (канон сохранён)', async () => {
    const layer = document.createElement('div');
    layer.setAttribute('role', 'dialog');
    const inner = document.createElement('button');
    layer.append(inner);
    document.body.append(layer);
    const trigger = document.createElement('button');
    document.body.append(trigger);

    leftPointerDown();
    inner.focus();
    await frame();
    expect(document.activeElement).toBe(inner);

    // «Закрытие поповера»: Radix возвращает фокус на триггер (onCloseAutoFocus).
    layer.remove();
    trigger.focus();
    await frame();
    expect(document.activeElement).toBe(composer);
  });

  it('клавиатурный фокус (без pointerdown) — не крадётся (канон модальности)', async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    const btn = document.createElement('button');
    document.body.append(btn);
    btn.focus();
    await frame();
    expect(document.activeElement).toBe(btn);
  });

  it('карточка-слайдер (role=dialog) содержит композер — НЕ блокирует возврат курсора', async () => {
    // Слайдер — постоянное вместилище чата (вердикт 25.09): его role="dialog"
    // не «владеет» фокусом, курсор возвращается кликом в композер слайдера.
    const slider = document.createElement('section');
    slider.setAttribute('role', 'dialog');
    const sliderComposer = document.createElement('textarea');
    const railButton = document.createElement('button');
    slider.append(railButton, sliderComposer);
    document.body.append(slider);
    registerComposer('slider-composer', sliderComposer);
    try {
      leftPointerDown();
      railButton.focus();
      await frame();
      expect(document.activeElement).toBe(sliderComposer);
    } finally {
      unregisterComposer('slider-composer', sliderComposer);
      slider.remove();
    }
  });

  it('focusComposerWhenFree: курсор в композер слайдера, пока activeElement внутри её же role=dialog', async () => {
    const slider = document.createElement('section');
    slider.setAttribute('role', 'dialog');
    const sliderComposer = document.createElement('textarea');
    const messageButton = document.createElement('button');
    slider.append(messageButton, sliderComposer);
    document.body.append(slider);
    registerComposer('slider-composer-free', sliderComposer);
    messageButton.focus(); // как после закрытия контекстного меню
    try {
      focusComposerWhenFree('slider-composer-free', 300);
      await frame();
      expect(document.activeElement).toBe(sliderComposer);
    } finally {
      unregisterComposer('slider-composer-free', sliderComposer);
      slider.remove();
    }
  });

  it('чужой оверлей (role=menu портала, композер не внутри) по-прежнему держит фокус (#71)', async () => {
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    const item = document.createElement('div');
    item.setAttribute('role', 'menuitem');
    item.tabIndex = -1; // как Radix menuitem: фокусируемый, но не в tab-order
    menu.append(item);
    document.body.append(menu);
    leftPointerDown();
    item.focus();
    const trigger = document.createElement('button');
    document.body.append(trigger);
    try {
      await frame();
      // Слой открыт — фокус не крадётся, композер ждёт.
      expect(document.activeElement).toBe(item);
      // Слой закрылся: Radix возвращает фокус триггеру — курсор возвращается
      // в композер (канон сохранён).
      menu.remove();
      trigger.focus();
      await frame();
      expect(document.activeElement).toBe(composer);
    } finally {
      menu.remove();
      trigger.remove();
    }
  });

  it('focusComposerWhenFree дожидается закрытия чужого слоя, затем фокусит', async () => {
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const inner = document.createElement('button');
    dialog.append(inner);
    document.body.append(dialog);
    inner.focus();
    focusComposerWhenFree('test-composer', 300);
    await frame();
    expect(document.activeElement).toBe(inner); // ещё ждём
    dialog.remove();
    await frame();
    expect(document.activeElement).toBe(composer);
  });
});
