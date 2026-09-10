import { useCallback, useMemo } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';

import { parseCardStack, sameCard, serializeCardStack, type CardRef } from './card-stack.js';
import { useShellStore } from './shell-store.js';
import type { SourceRect } from './slider-panel.js';

/** Стек карточек из URL (search `?cards=`): порядок массива = порядок наслоения
 *  (последний — верхний). Единственный источник истины — ADR-0009. */
export function useCardStack(): CardRef[] {
  const search = useSearch({ strict: false });
  return useMemo(() => parseCardStack(search.cards), [search.cards]);
}

/** Открыть карточку ПОВЕРХ стека (push + запись в истории: «назад» браузера
 *  закрывает верхнюю). rect источника — для shared-element раскрытия; повторный
 *  клик по уже верхней карточке не дублирует её. */
export function useOpenCard(): (ref: CardRef, sourceRect?: SourceRect) => void {
  const navigate = useNavigate();
  const setLastSource = useShellStore((s) => s.setLastSource);
  return useCallback(
    (ref: CardRef, sourceRect?: SourceRect) => {
      setLastSource(sourceRect ?? null);
      void navigate({
        to: '.',
        search: (prev) => {
          const stack = parseCardStack(prev.cards);
          const top = stack[stack.length - 1];
          if (top && sameCard(top, ref)) return prev;
          return { ...prev, cards: serializeCardStack([...stack, ref]) };
        },
      });
    },
    [navigate, setLastSource],
  );
}

/** Закрыть верхнюю карточку стека (replace: закрытие не плодит записи истории). */
export function useCloseCard(): () => void {
  const navigate = useNavigate();
  return useCallback(() => {
    void navigate({
      to: '.',
      replace: true,
      search: (prev) => ({
        ...prev,
        cards: serializeCardStack(parseCardStack(prev.cards).slice(0, -1)),
      }),
    });
  }, [navigate]);
}
