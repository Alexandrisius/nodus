// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComposerSubmit } from './chat-composer.js';

import { AttachSendDialogHost } from './attach-send-dialog.js';
import { useChatDrafts, type PendingAttachment } from './chat-drafts.js';
import { useAttachSendDialog } from './dialog-stores.js';
import { registerScopeSubmit } from './submit-registry.js';

/**
 * Окно отправки вложений (#144): строки из черновика; отмена гасит вложения и
 * ОСТАВЛЯЕТ текст подписи в композере (семантика черновика Telegram);
 * отправка идёт через реестр submit-функций хостов payload'ом черновика и
 * закрывает окно, когда хост очистил черновик (onSuccess мутации); пока есть
 * загрузки — «Отправить» заблокирована.
 */

const CONV = '11111111-1111-4111-8111-111111111111';
const KEY = `conversation:${CONV}`;

const pending = (
  localId: string,
  status: 'uploading' | 'ready' | 'error' = 'ready',
): PendingAttachment => ({
  localId,
  fileName: `${localId}.csv`,
  mime: 'text/csv',
  size: 10,
  progress: status === 'ready' ? 1 : 0.4,
  status,
  attachment:
    status === 'ready'
      ? {
          id: `att-${localId}`,
          fileId: `file-${localId}`,
          name: `${localId}.csv`,
          size: 10,
          mime: 'text/csv',
          kind: 'file',
          url: null,
          thumbnailUrl: null,
          width: null,
          height: null,
        }
      : null,
  objectUrl: null,
});

function reset() {
  useChatDrafts.setState({ drafts: {} });
  useAttachSendDialog.setState({ scope: null, caption: '' });
}

describe('attach-send-dialog (#144)', () => {
  beforeEach(reset);
  afterEach(cleanup);

  it('отмена: вложения сняты, подпись ВОЗВРАЩАЕТСЯ черновиком в композер', () => {
    // Открытие (composer-files): текст композера переезжает в подпись окна,
    // поле чата пустое — онлайн-дублирования нет (канон Telegram).
    useChatDrafts.getState().setText(KEY, 'подпись к файлам');
    useAttachSendDialog.getState().open(KEY, 'подпись к файлам');
    useChatDrafts.getState().setText(KEY, '');
    useChatDrafts.getState().addAttachments(KEY, [pending('a', 'uploading')]);
    render(<AttachSendDialogHost />);

    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    const draft = useChatDrafts.getState().drafts[KEY];
    expect(draft?.attachments).toEqual([]);
    expect(draft?.text).toBe('подпись к файлам');
    expect(useAttachSendDialog.getState().scope).toBeNull();
    expect(useAttachSendDialog.getState().caption).toBe('');
  });

  it('отправка: payload черновика через реестр хостов; очистка черновика закрывает окно', async () => {
    const submitted = vi.fn<(payload: ComposerSubmit) => Promise<unknown>>();
    const payloads: ComposerSubmit[] = [];
    let resolveSend: (value: unknown) => void = () => undefined;
    submitted.mockImplementation(
      (payload) =>
        new Promise((resolve) => {
          payloads.push(payload);
          resolveSend = resolve;
        }),
    );
    const unregister = registerScopeSubmit(KEY, (payload) => submitted(payload));

    useChatDrafts.getState().addAttachments(KEY, [pending('a'), pending('b')]);
    useAttachSendDialog.getState().open(KEY, 'комментарий');
    render(<AttachSendDialogHost />);

    fireEvent.click(screen.getByRole('button', { name: 'Отправить' }));
    expect(submitted).toHaveBeenCalledTimes(1);
    expect(payloads[0]?.text).toBe('комментарий');
    expect(payloads[0]?.attachments.map((a) => a.localId)).toEqual(['a', 'b']);
    expect(payloads[0]?.edit).toBeNull();

    // Хост очистил черновик по onSuccess мутации — окно закрывается само.
    act(() => {
      resolveSend({});
      useChatDrafts.getState().clear(KEY);
    });
    await waitFor(() => expect(useAttachSendDialog.getState().scope).toBeNull());
    unregister();
  });

  it('пока есть загрузки — «Отправить» заблокирована', () => {
    useChatDrafts.getState().addAttachments(KEY, [pending('a', 'uploading')]);
    useAttachSendDialog.getState().open(KEY);
    render(<AttachSendDialogHost />);
    const send = screen.getByRole('button', { name: 'Отправить' });
    expect((send as HTMLButtonElement).disabled).toBe(true);
  });

  it('клавиатура как в чате: Enter отправляет, Shift+Enter — перенос', () => {
    const submitted = vi.fn<(payload: ComposerSubmit) => Promise<unknown>>(() =>
      Promise.resolve({}),
    );
    const unregister = registerScopeSubmit(KEY, (payload) => submitted(payload));
    useChatDrafts.getState().addAttachments(KEY, [pending('a')]);
    useAttachSendDialog.getState().open(KEY, 'текст');
    render(<AttachSendDialogHost />);

    const caption = screen.getByPlaceholderText('Добавить подпись');
    fireEvent.keyDown(caption, { key: 'Enter', shiftKey: true });
    expect(submitted).not.toHaveBeenCalled();
    fireEvent.keyDown(caption, { key: 'Enter' });
    expect(submitted).toHaveBeenCalledTimes(1);
    unregister();
  });

  it('снятие последней строки крестиком: окно закрывается, подпись возвращается черновиком', async () => {
    useChatDrafts.getState().addAttachments(KEY, [pending('a')]);
    useAttachSendDialog.getState().open(KEY, 'набранный текст');
    render(<AttachSendDialogHost />);

    fireEvent.click(screen.getByRole('button', { name: 'Убрать из сообщения' }));

    await waitFor(() => expect(useAttachSendDialog.getState().scope).toBeNull());
    // Автозакрытие = отмена: текст не теряется (валидатор #144).
    expect(useChatDrafts.getState().drafts[KEY]?.text).toBe('набранный текст');
    expect(useChatDrafts.getState().drafts[KEY]?.attachments).toEqual([]);
  });

  it('клик снаружи окна НЕ закрывает его и НЕ снимает вложения (#148)', () => {
    useChatDrafts.getState().addAttachments(KEY, [pending('a')]);
    useAttachSendDialog.getState().open(KEY, 'набранный текст');
    render(<AttachSendDialogHost />);

    // pointerdown по заднику (вне DialogContent) — dismissal подавлен.
    fireEvent.pointerDown(document.body);

    expect(useAttachSendDialog.getState().scope).toBe(KEY);
    expect(useChatDrafts.getState().drafts[KEY]?.attachments).toHaveLength(1);
    // А намеренная отмена — работает как раньше (текст — черновиком).
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    expect(useChatDrafts.getState().drafts[KEY]?.text).toBe('набранный текст');
    expect(useAttachSendDialog.getState().scope).toBeNull();
  });

  it('заголовок считает файлы русской плюрализацией', () => {
    useChatDrafts.getState().addAttachments(KEY, [pending('a'), pending('b')]);
    useAttachSendDialog.getState().open(KEY);
    render(<AttachSendDialogHost />);
    expect(screen.getByText('Выбрано: 2 файла')).toBeTruthy();
  });
});
