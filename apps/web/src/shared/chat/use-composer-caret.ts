import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { deleteTokenKey } from './composer-mentions.js';

/**
 * Механика каретки композера упоминаний (#224, ревизия приёмки):
 * 1) КАСТОМНАЯ каретка — нативная скрыта (caret-transparent: сырые глифы
 *    поля прозрачны, каретка в хвосте `](user:uuid)` висела «в пустоте»
 *    далеко правее видимого чипа); слой composer-caret рисует её по
 *    зеркалу, этот хук владеет смещением и видимостью (фокус + свёрнутая
 *    селекция + не IME-композиция).
 * 2) АТОМАРНЫЕ Backspace/Delete у токена — чип удаляется целиком, никогда
 *    не разбираясь в сырую разметку (главный баг приёмки #224).
 */

export interface ComposerCaretMeta {
  offset: number;
  visible: boolean;
}

export function useComposerCaret(opts: {
  text: string;
  /** Запись нового текста черновика (атомарное удаление токена). */
  setText: (next: string) => void;
  inputRef: { current: HTMLTextAreaElement | null };
  /** Специфика композера в onFocus (каретка-в-конец черновика и пр.). */
  onFocusExtra?: (el: HTMLTextAreaElement) => void;
}): {
  caretMeta: ComposerCaretMeta | null;
  updateCaret: (el: HTMLTextAreaElement | null) => void;
  /** true — клавиша съедена (токен удалён), композер не реагирует. */
  handleCaretKeys: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean;
  /** Обработчики поля каретки — спредом в textarea. */
  fieldEvents: {
    onFocus: (e: { currentTarget: HTMLTextAreaElement }) => void;
    onBlur: () => void;
    onCompositionStart: () => void;
    onCompositionEnd: () => void;
    onSelect: (e: { currentTarget: HTMLTextAreaElement }) => void;
  };
} {
  const [caretMeta, setCaretMeta] = useState<ComposerCaretMeta | null>(null);
  const focusRef = useRef(false);
  const composingRef = useRef(false);
  const { text, setText, inputRef, onFocusExtra } = opts;
  const extraRef = useRef(onFocusExtra);
  extraRef.current = onFocusExtra;

  const updateCaret = useCallback(
    (el: HTMLTextAreaElement | null) => {
      if (!el) {
        setCaretMeta(null);
        return;
      }
      const collapsed = el.selectionStart === el.selectionEnd;
      setCaretMeta({
        offset: el.selectionStart ?? 0,
        visible: focusRef.current && collapsed && !composingRef.current,
      });
    },
    // Рефы стабильны — колбэк не пересоздаётся (безопасен в листенерах).
    [],
  );

  // Программные setSelectionRange (вставка автокомплита, поповер, клампы)
  // НЕ зажигают select-событие поля — слушим глобальный selectionchange.
  useEffect(() => {
    const onSelChange = () => {
      const el = inputRef.current;
      if (el && document.activeElement === el) updateCaret(el);
    };
    document.addEventListener('selectionchange', onSelChange);
    return () => document.removeEventListener('selectionchange', onSelChange);
  }, [inputRef, updateCaret]);

  function handleCaretKeys(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (
      (event.key !== 'Backspace' && event.key !== 'Delete') ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return false;
    }
    const el = event.currentTarget;
    if (el.selectionStart !== el.selectionEnd) return false;
    const del = deleteTokenKey(text, el.selectionStart ?? 0, event.key);
    if (!del) return false;
    event.preventDefault();
    setText(del.text);
    requestAnimationFrame(() => {
      const next = inputRef.current;
      if (next) {
        next.setSelectionRange(del.caret, del.caret);
        updateCaret(next);
      }
    });
    return true;
  }

  const fieldEvents = useMemo(
    () => ({
      onFocus: (e: { currentTarget: HTMLTextAreaElement }) => {
        extraRef.current?.(e.currentTarget);
        focusRef.current = true;
        updateCaret(e.currentTarget);
      },
      onBlur: () => {
        focusRef.current = false;
        updateCaret(inputRef.current);
      },
      onCompositionStart: () => {
        composingRef.current = true;
        updateCaret(inputRef.current);
      },
      onCompositionEnd: () => {
        composingRef.current = false;
        updateCaret(inputRef.current);
      },
      onSelect: (e: { currentTarget: HTMLTextAreaElement }) => updateCaret(e.currentTarget),
    }),
    [inputRef, updateCaret],
  );

  return { caretMeta, updateCaret, handleCaretKeys, fieldEvents };
}
