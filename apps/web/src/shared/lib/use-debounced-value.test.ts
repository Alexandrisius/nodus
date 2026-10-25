// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useDebouncedValue } from './use-debounced-value.js';

/** Задержка серверного поиска (#460): первое значение — сразу, изменения —
 *  после паузы, быстрый ввод не плодит запросов. */
describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('первое значение отдаётся сразу', () => {
    const { result } = renderHook(() => useDebouncedValue('галургия', 250));
    expect(result.current).toBe('галургия');
  });

  it('изменение применяется после паузы, а не мгновенно', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 250), {
      initialProps: { value: 'г' },
    });
    rerender({ value: 'галургия' });
    expect(result.current).toBe('г');

    act(() => {
      vi.advanceTimersByTime(249);
    });
    expect(result.current).toBe('г');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe('галургия');
  });

  it('быстрый ввод: промежуточные значения не проходят (один запрос на паузу)', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 250), {
      initialProps: { value: '' },
    });
    for (const value of ['г', 'га', 'гал', 'галур']) {
      rerender({ value });
      act(() => {
        vi.advanceTimersByTime(100);
      });
    }
    expect(result.current).toBe('');

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current).toBe('галур');
  });
});
