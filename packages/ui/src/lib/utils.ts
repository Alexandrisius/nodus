import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/* cn с распознаванием кастомных text-* токенов Nodus (text-label*, text-body-*,
 * text-stat, text-badge): дефолтный tailwind-merge классифицирует НЕИЗВЕСТНЫЙ
 * text-* как ЦВЕТ, и при тоне следом в той же строке (text-muted-foreground,
 * tone.chip) выбрасывает размер — кегль молча «спадал» до body (баг раунда 2
 * #60: заголовки таблиц/секций и чипы колонок рендерились 14px вместо 11-12). */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        'text-label-xs',
        'text-label-sm',
        'text-label',
        'text-label-lg',
        'text-badge',
        'text-body-xs',
        'text-body-lg',
        'text-stat',
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
