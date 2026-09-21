import { cn } from '@nodus/ui/lib/utils';
import { describe, expect, it } from 'vitest';

/* Регрессия раунда 2 #60: кастомные text-* токены лестницы (text-label*,
 * text-body-*) — РАЗМЕР, а не цвет: tailwind-merge без extend-конфига
 * (packages/ui/lib/utils.ts) считал их цветом и ронял кегль до body,
 * когда тон шёл следом в той же строке. */
describe('cn: кастомные токены размера текста', () => {
  it('размер не вытесняется цветом тона в той же строке', () => {
    expect(cn('text-label font-semibold text-muted-foreground uppercase')).toBe(
      'text-label font-semibold text-muted-foreground uppercase',
    );
  });

  it('размер чипа выживает при тоне вторым аргументом', () => {
    const merged = cn(
      'text-label-sm font-semibold tracking-wide uppercase',
      'text-secondary-foreground',
    );
    expect(merged).toContain('text-label-sm');
    expect(merged).toContain('text-secondary-foreground');
  });

  it('все ступени лестницы распознаются как размер', () => {
    for (const t of [
      'text-label-xs',
      'text-label-sm',
      'text-label',
      'text-label-lg',
      'text-badge',
      'text-body-xs',
      'text-body-lg',
      'text-stat',
    ]) {
      expect(cn(t, 'text-muted-foreground')).toContain(t);
    }
  });

  it('конфликт размеров по-прежнему разрешается последним', () => {
    expect(cn('text-label', 'text-label-lg')).toBe('text-label-lg');
    expect(cn('text-sm', 'text-base')).toBe('text-base');
  });
});
