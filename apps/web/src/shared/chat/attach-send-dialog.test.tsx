// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, MessageAttachment } from '@nodus/contracts';
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
          previewKind: 'file',
          pdfUrl: null,
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

  it('открытие с готовым текстом: каретка В КОНЦЕ подписи (#241)', () => {
    // Текст композера переехал в подпись при открытии — продолжать писать
    // можно сразу, без ручного переноса курсора с начала строки.
    useChatDrafts.getState().addAttachments(KEY, [pending('a')]);
    useAttachSendDialog.getState().open(KEY, 'уже написанный текст сообщения');
    render(<AttachSendDialogHost />);

    const caption = screen.getByPlaceholderText('Добавить подпись') as HTMLTextAreaElement;
    const len = 'уже написанный текст сообщения'.length;
    expect(caption.selectionStart).toBe(len);
    expect(caption.selectionEnd).toBe(len);
    expect(document.activeElement).toBe(caption);
  });
});

describe('attach-send-dialog — режим правки (#188)', () => {
  beforeEach(reset);
  afterEach(cleanup);

  /** Сообщение с вложениями → setEdit (сеет строки) + окно (startMessageEdit). */
  function openEdit(withAttachments = true) {
    const attachments: MessageAttachment[] = withAttachments
      ? [
          {
            id: 'att-1',
            fileId: 'file-1',
            name: 'отчёт.png',
            size: 10,
            mime: 'image/png',
            kind: 'image',
            url: null,
            thumbnailUrl: 'blob:thumb-1',
            previewKind: 'image',
            pdfUrl: null,
            width: null,
            height: null,
          },
        ]
      : [];
    const message = { id: 'm1', text: 'исходный текст', attachments } as ChatMessage;
    useChatDrafts.getState().setText(KEY, 'черновик до правки');
    useChatDrafts.getState().setEdit(KEY, message);
    useAttachSendDialog.getState().open(KEY, message.text);
    useChatDrafts.getState().setText(KEY, '');
  }

  it('заголовок «Изменение сообщения», строки сообщения с серверным превью, «Сохранить»', () => {
    openEdit();
    render(<AttachSendDialogHost />);

    expect(screen.getByText('Изменение сообщения')).toBeTruthy();
    expect(screen.getByText('отчёт.png')).toBeTruthy();
    // Превью строки — кнопка просмотра с серверной миниатюрой внутри.
    expect(screen.getByRole('button', { name: 'Открыть изображение' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeTruthy();
  });

  it('снятие последней строки НЕ закрывает окно: пустой состав — легальная правка', () => {
    openEdit();
    render(<AttachSendDialogHost />);

    fireEvent.click(screen.getByRole('button', { name: 'Убрать из сообщения' }));

    expect(useAttachSendDialog.getState().scope).toBe(KEY);
    expect(useChatDrafts.getState().drafts[KEY]?.attachments).toEqual([]);
  });

  it('сохранение: payload несёт edit + editComposition + полный состав', async () => {
    const payloads: ComposerSubmit[] = [];
    let resolveSend: (value: unknown) => void = () => undefined;
    const unregister = registerScopeSubmit(
      KEY,
      (payload) =>
        new Promise((resolve) => {
          payloads.push(payload);
          resolveSend = resolve;
        }),
    );
    openEdit();
    render(<AttachSendDialogHost />);

    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(payloads[0]?.edit).toMatchObject({ messageId: 'm1' });
    expect(payloads[0]?.editComposition).toBe(true);
    expect(payloads[0]?.attachments.map((a) => a.localId)).toEqual(['att-1']);

    // Хост применяет правку → finishEdit чистит вложения → окно закрывается.
    act(() => {
      resolveSend({});
      useChatDrafts.getState().finishEdit(KEY);
    });
    await waitFor(() => expect(useAttachSendDialog.getState().scope).toBeNull());
    unregister();
  });

  it('отмена: сообщение не тронуто — исходные строки без DELETE на сервер, черновик восстановлен', () => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchSpy);
    openEdit();
    render(<AttachSendDialogHost />);

    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    const draft = useChatDrafts.getState().drafts[KEY];
    expect(useAttachSendDialog.getState().scope).toBeNull();
    // Правка снята, текст ДО правки восстановлен, вложения чисты.
    expect(draft?.edit ?? null).toBeNull();
    expect(draft?.text).toBe('черновик до правки');
    expect(draft?.attachments ?? []).toEqual([]);
    // Строки правимого сообщения серверу не отдавались (состав жив на сервере).
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('переименование: поле правит только базу — расширение суффиксом (вердикт 04.10)', async () => {
    openEdit();
    render(<AttachSendDialogHost />);

    // Radix-меню открывается pointerdown (не click) — так же в jsdom.
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Действия с вложением' }), {
      button: 0,
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Переименовать файл' }));

    const nameInput = await screen.findByLabelText('Имя файла');
    // Поле — только база имени; расширение — защищённый суффикс за полем.
    expect((nameInput as HTMLInputElement).value).toBe('отчёт');
    expect(screen.getByText('.png')).toBeTruthy();

    fireEvent.change(nameInput, { target: { value: 'переименованное-проба' } });
    fireEvent.keyDown(nameInput, { key: 'Enter' });
    await waitFor(() =>
      expect(useChatDrafts.getState().drafts[KEY]?.attachments[0]?.fileName).toBe(
        'переименованное-проба.png',
      ),
    );
  });

  it('переименование: Esc откатывает базу, окно живо', async () => {
    openEdit();
    render(<AttachSendDialogHost />);

    // Radix-меню открывается pointerdown (не click) — так же в jsdom.
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Действия с вложением' }), {
      button: 0,
    });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Переименовать файл' }));
    const nameInput = await screen.findByLabelText('Имя файла');
    fireEvent.change(nameInput, { target: { value: 'сломанное' } });
    fireEvent.keyDown(nameInput, { key: 'Escape' });

    // Esc погасил только правку имени — окно не закрылось, имя не тронуто.
    expect(useAttachSendDialog.getState().scope).toBe(KEY);
    expect(useChatDrafts.getState().drafts[KEY]?.attachments[0]?.fileName).toBe('отчёт.png');
  });

  it('Ctrl+V в подписи добавляет вложение, не отправляя сообщение', async () => {
    const pasteFile = new File(['x'], 'вставка.png', { type: 'image/png' });
    const submitted = vi.fn<(payload: ComposerSubmit) => Promise<unknown>>(() =>
      Promise.resolve({}),
    );
    const unregister = registerScopeSubmit(KEY, (payload) => submitted(payload));
    openEdit();
    render(<AttachSendDialogHost />);

    const caption = screen.getByPlaceholderText('Добавить подпись');
    fireEvent.paste(caption, { clipboardData: { files: [pasteFile] } });

    // Строка встала в список окна (загрузка стартовала), окно живо,
    // никакого submit не было — вставка ≠ отправка (#188).
    await waitFor(() => expect(useChatDrafts.getState().drafts[KEY]?.attachments).toHaveLength(2));
    expect(useAttachSendDialog.getState().scope).toBe(KEY);
    expect(submitted).not.toHaveBeenCalled();
    unregister();
  });
});
