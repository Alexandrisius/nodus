import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTypingStore } from './typing-store.js';

describe('typing-store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useTypingStore.getState().reset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('touch создаёт запись и гасит её по TTL', () => {
    useTypingStore.getState().touch('conv-1', 'user-1');
    expect(useTypingStore.getState().entries['conv-1']?.userId).toBe('user-1');

    vi.advanceTimersByTime(4_050);
    expect(useTypingStore.getState().entries['conv-1']).toBeUndefined();
  });

  it('повторный touch продлевает запись; старый таймер не гасит новую', () => {
    useTypingStore.getState().touch('conv-1', 'user-1');
    vi.advanceTimersByTime(2_000);
    useTypingStore.getState().touch('conv-1', 'user-1'); // новая expiry
    vi.advanceTimersByTime(2_100); // истёк срок ПЕРВОЙ записи
    expect(useTypingStore.getState().entries['conv-1']?.userId).toBe('user-1');
    vi.advanceTimersByTime(2_000); // истёк срок второй
    expect(useTypingStore.getState().entries['conv-1']).toBeUndefined();
  });

  it('записи независимы по беседам', () => {
    useTypingStore.getState().touch('conv-1', 'user-1');
    useTypingStore.getState().touch('conv-2', 'user-2');
    vi.advanceTimersByTime(4_050);
    expect(Object.keys(useTypingStore.getState().entries)).toHaveLength(0);
  });
});
