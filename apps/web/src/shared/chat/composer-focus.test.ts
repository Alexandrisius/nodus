// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerComposer, unregisterComposer } from './composer-focus.js';

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
});
