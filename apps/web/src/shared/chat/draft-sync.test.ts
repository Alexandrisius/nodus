// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../api-client.js', () => ({ api: apiMock }));

import { dropDraftSync, flushDraftSync, scheduleDraftSync } from './draft-sync.js';

/** Синхронизация черновиков (#91): debounce 1000 мс после паузы набора,
 *  flush при переключении беседы, дедуп неизменного текста, drop на отправке,
 *  тредовые scope — только локально. */
describe('draft-sync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiMock.mockReset();
    apiMock.mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('до паузы не шлёт, после 1000 мс — PUT черновика', async () => {
    scheduleDraftSync('conversation:c1', 'привет');
    await vi.advanceTimersByTimeAsync(999);
    expect(apiMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(apiMock).toHaveBeenCalledWith(
      '/chat/conversations/c1/draft',
      expect.objectContaining({ method: 'PUT', body: { text: 'привет' } }),
    );
  });

  it('набор продлевает паузу: уходит только последний текст', async () => {
    scheduleDraftSync('conversation:c2', 'а');
    await vi.advanceTimersByTimeAsync(600);
    scheduleDraftSync('conversation:c2', 'аб');
    await vi.advanceTimersByTimeAsync(1000);
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(apiMock).toHaveBeenCalledWith(
      '/chat/conversations/c2/draft',
      expect.objectContaining({ body: { text: 'аб' } }),
    );
  });

  it('flush при переключении шлёт сразу и отменяет таймер', async () => {
    scheduleDraftSync('conversation:c3', 'переключение');
    flushDraftSync('conversation:c3');
    await vi.advanceTimersByTimeAsync(0);
    expect(apiMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  it('неизменный текст повторно не шлётся (дедуп по отправленному)', async () => {
    scheduleDraftSync('conversation:c4', 'тот же');
    await vi.advanceTimersByTimeAsync(1000);
    expect(apiMock).toHaveBeenCalledTimes(1);
    scheduleDraftSync('conversation:c4', 'тот же');
    await vi.advanceTimersByTimeAsync(2000);
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  it('drop при отправке снимает запланированный PUT', async () => {
    scheduleDraftSync('conversation:c5', 'уйдёт с сообщением');
    dropDraftSync('conversation:c5');
    await vi.advanceTimersByTimeAsync(2000);
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('тредовые черновики — только локально: PUT нет', async () => {
    scheduleDraftSync('thread:root1', 'текст треда');
    await vi.advanceTimersByTimeAsync(2000);
    expect(apiMock).not.toHaveBeenCalled();
  });
});
