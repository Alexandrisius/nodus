// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock('../api-client.js', () => ({ api: apiMock }));

import { flushDraftSync } from './draft-sync.js';
import { EMPTY_DRAFT, useChatDrafts } from './chat-drafts.js';

/** Политика черновика — ТОЛЬКО на уходе (вердикт 25.09): набор текста сервер
 *  не видит вовсе; PUT — при уходе из беседы (переключение/размонтирование
 *  композера); правка черновик не пишет; тредовые scope — только локально;
 *  дедуп неизменного текста; пустой текст после непустого черновика —
 *  PUT '' (удаление серверного черновика, снятие метки). */
describe('draft-sync — фиксация черновика на уходе', () => {
  beforeEach(() => {
    apiMock.mockReset();
    apiMock.mockResolvedValue(undefined);
    useChatDrafts.setState({ drafts: {} });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Уникальная беседа на тест: lastSent модуля живёт между тестами. */
  const conv = (n: number) => `1111111${n}-1111-4111-8111-${`${n}`.padStart(12, '0')}`;
  const key = (n: number) => `conversation:${conv(n)}`;

  it('набор текста НЕ шлёт ничего (online-трансляции нет, debounce удалён)', async () => {
    useChatDrafts.getState().setText(key(1), 'привет');
    await vi.waitFor(() => expect(useChatDrafts.getState().drafts[key(1)]?.text).toBe('привет'));
    await new Promise((r) => setTimeout(r, 20));
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('уход из беседы (flushDraftSync) — PUT текущего текста композера', async () => {
    useChatDrafts.getState().setText(key(2), 'черновик на уходе');
    await expect(flushDraftSync(key(2))).resolves.toBe(true);
    expect(apiMock).toHaveBeenCalledWith(
      `/chat/conversations/${conv(2)}/draft`,
      expect.objectContaining({ method: 'PUT', body: { text: 'черновик на уходе' } }),
    );
  });

  it('уход с пустым полем и без отправленного — PUT нет', async () => {
    await expect(flushDraftSync(key(3))).resolves.toBe(false);
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('очистка текста после отправленного черновика — PUT с пустым (удаление) ровно один раз', async () => {
    useChatDrafts.getState().setText(key(4), 'привет');
    await expect(flushDraftSync(key(4))).resolves.toBe(true);
    // Поле очищено — пустой черновик удаляется из стора; уход шлёт PUT ''.
    useChatDrafts.getState().setText(key(4), '');
    expect(useChatDrafts.getState().drafts[key(4)]).toBeUndefined();
    await expect(flushDraftSync(key(4))).resolves.toBe(true);
    expect(apiMock.mock.calls.map((c) => c[1].body.text)).toEqual(['привет', '']);
    // Повторный уход без текста — дедуп: PUT '' больше не уходит.
    await expect(flushDraftSync(key(4))).resolves.toBe(false);
    expect(apiMock).toHaveBeenCalledTimes(2);
  });

  it('режим ПРАВКИ черновик не пишет (текст правки не уходит на сервер)', async () => {
    useChatDrafts.setState({
      drafts: {
        [key(5)]: {
          ...EMPTY_DRAFT,
          text: 'текст правки',
          edit: { messageId: 'm1', originalText: 'оригинал' },
        },
      },
    });
    await expect(flushDraftSync(key(5))).resolves.toBe(false);
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('тредовые черновики — только локально: PUT нет', async () => {
    useChatDrafts.setState({
      drafts: { ['thread:root1']: { ...EMPTY_DRAFT, text: 'текст треда' } },
    });
    await expect(flushDraftSync('thread:root1')).resolves.toBe(false);
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('повторный уход с тем же текстом не шлёт (дедуп по отправленному)', async () => {
    useChatDrafts.getState().setText(key(7), 'тот же');
    await expect(flushDraftSync(key(7))).resolves.toBe(true);
    await expect(flushDraftSync(key(7))).resolves.toBe(false);
    await new Promise((r) => setTimeout(r, 10));
    expect(apiMock).toHaveBeenCalledTimes(1);
  });

  it('уход после отправки (draft очищен) — «воскрешения» черновика нет', async () => {
    useChatDrafts.getState().setText(key(8), 'уйдёт с сообщением');
    useChatDrafts.getState().clear(key(8));
    await expect(flushDraftSync(key(8))).resolves.toBe(false);
    expect(apiMock).not.toHaveBeenCalled();
  });

  it('скрытие вкладки (visibilitychange hidden) шлёт PUT без предварительного flush — слушатели установлены при инициализации модуля', async () => {
    useChatDrafts.setState({
      drafts: {
        [key(9)]: { ...EMPTY_DRAFT, text: 'скрыли вкладку' },
        [key(10)]: { ...EMPTY_DRAFT, text: 'вторая беседа' },
      },
    });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    // Слушатель flushAll шлёт и очистки (PUT '') ранее отправленных бесед
    // прошлых тестов — поэтому >= 2 и arrayContaining, не строгий счёт.
    await vi.waitFor(() => expect(apiMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(apiMock.mock.calls.map((c) => c[1].body.text)).toEqual(
      expect.arrayContaining(['скрыли вкладку', 'вторая беседа']),
    );
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });
});
