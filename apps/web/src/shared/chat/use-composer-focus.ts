import { useCallback, useEffect, useRef, type RefObject } from 'react';

import { useChatDrafts } from './chat-drafts.js';
import { registerComposer, unregisterComposer } from './composer-focus.js';

/**
 * «Вечный курсор» композера (chat-composer.tsx): регистрация поля реф-
 * колбэком и каретка в конце восстановленного черновика.
 */
export function useComposerFocus({
  focusId,
  inputRef,
  syncCaret,
}: {
  focusId: string;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  syncCaret: (el: HTMLTextAreaElement) => void;
}) {
  // «Вечный курсор»: монтаж — композер активный владелец; размонтаж (закрыли
  // тред) — курсор возвращается ранее зарегистрированному (ленте канала).
  // Черновик восстановлен при смене беседы → каретка в КОНЕЦ текста при
  // ближайшем фокусе (модель Telegram: продолжаешь писать с места остановки;
  // вердикт 25.09 — каретка «у начала» заставляла переставлять её руками).
  const caretToEndRef = useRef(false);
  // Свежий syncCaret для эффекта смены беседы (deps — только focusId:
  // перезапуск на каждый рендер ставил бы каретку в конец при наборе).
  const syncCaretRef = useRef(syncCaret);
  syncCaretRef.current = syncCaret;
  useEffect(() => {
    const restored = (useChatDrafts.getState().drafts[focusId]?.text ?? '').length;
    caretToEndRef.current = restored > 0;
    const el = inputRef.current;
    if (el && restored > 0) {
      el.setSelectionRange(restored, restored);
      // Синк каретки в стейт (#294): детекторы панелей (упоминания/стикеры)
      // живут по ней — черновик-соло-эмодзи раскрывает плашку сразу после
      // смены беседы, без ожидания первого ввода.
      syncCaretRef.current(el);
    }
  }, [focusId, inputRef]);

  // «Вечный курсор» — регистрация РЕФ-КОЛБЭКОМ, не эффектом на [focusId]
  // (#104 раунд 2, баг «супер-курсора»): селект-режим РАЗМОНТИРУЕТ textarea
  // (островок батч-команд), выход — монтирует НОВЫЙ элемент; эффект с deps
  // [focusId] не перезапускался, registry хранил отсоединённый узел, focus()
  // на нём молча не работал — после «Ответить»/«Редактировать» каретка
  // умирала до смены беседы (ремаунт композера). Реф-колбэк честно
  // пере-регистрирует КАЖДЫЙ монтаж textarea. (autoFocus нового элемента
  // маскировал баг сразу после выхода из селекта.)
  const registerInput = useCallback(
    (el: HTMLTextAreaElement | null) => {
      if (el) {
        inputRef.current = el;
        registerComposer(focusId, el);
        return;
      }
      const prev = inputRef.current;
      inputRef.current = null;
      if (prev) unregisterComposer(focusId, prev);
    },
    [focusId, inputRef],
  );

  /** Первый фокус после смены беседы — каретка в конец черновика. */
  function onInputFocus() {
    const el = inputRef.current;
    if (caretToEndRef.current && el) {
      el.setSelectionRange(el.value.length, el.value.length);
      syncCaret(el);
    }
    caretToEndRef.current = false;
  }

  return { registerInput, onInputFocus };
}
