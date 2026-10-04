import type { ChatMessage, MessageAttachment } from '@nodus/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { EMPTY_DRAFT, useChatDrafts, type PendingAttachment } from './chat-drafts.js';
import { toEditVars } from './message-edit.js';

const attachment = (id: string, name: string): MessageAttachment => ({
  id,
  fileId: `file-${id}`,
  name,
  size: 100,
  mime: 'image/png',
  kind: 'image',
  url: null,
  thumbnailUrl: null,
  previewKind: 'image',
  pdfUrl: null,
  width: null,
  height: null,
});

/** Строка окна: fileName — имя в окне (пользователь мог переименовать),
 *  serverName — имя в DTO загруженного вложения (diff → attachmentRenames). */
const pending = (id: string, fileName: string, serverName = fileName): PendingAttachment => ({
  localId: id,
  fileName,
  mime: 'image/png',
  size: 100,
  progress: 1,
  status: 'ready',
  attachment: attachment(id, serverName),
  objectUrl: null,
});

describe('toEditVars (#188: сбор переменных правки из окна)', () => {
  it('без edit — null (окно не в режиме правки)', () => {
    expect(toEditVars({ text: 'текст', attachments: [], edit: null })).toBeNull();
  });

  it('инлайн-правка (без editComposition) — только текст, состав не трогаем', () => {
    const vars = toEditVars({
      text: 'новый текст',
      attachments: [],
      edit: { messageId: 'm1', originalText: 'старый', originalIds: [] },
    });
    expect(vars).toEqual({ messageId: 'm1', text: 'новый текст' });
  });

  it('окно: полный состав по порядку + переименования по diff имени', () => {
    const vars = toEditVars({
      text: '',
      attachments: [
        pending('b', 'второй.png'),
        pending('a', 'переименованный.png', 'исходный.png'),
      ],
      edit: { messageId: 'm1', originalText: '', originalIds: ['a'] },
      editComposition: true,
    });
    expect(vars).toEqual({
      messageId: 'm1',
      text: '',
      attachmentIds: ['b', 'a'],
      attachmentRenames: [{ id: 'a', name: 'переименованный.png' }],
      optimisticAttachments: [
        attachment('b', 'второй.png'),
        attachment('a', 'переименованный.png'),
      ],
    });
  });

  it('окно: пустой состав (все сняты) — attachmentIds: [] (текст обязателен)', () => {
    const vars = toEditVars({
      text: 'остался текст',
      attachments: [],
      edit: { messageId: 'm1', originalText: 'текст + файл', originalIds: ['a'] },
      editComposition: true,
    });
    expect(vars).toEqual({
      messageId: 'm1',
      text: 'остался текст',
      attachmentIds: [],
      optimisticAttachments: [],
    });
  });

  it('загрузка в полёте исключается из состава (только готовые строки)', () => {
    const uploading: PendingAttachment = {
      localId: 'c',
      fileName: 'грузится.png',
      mime: 'image/png',
      size: 100,
      progress: 0.4,
      status: 'uploading',
      attachment: null,
      objectUrl: 'blob:x',
    };
    const vars = toEditVars({
      text: 'текст',
      attachments: [pending('a', 'a.png'), uploading],
      edit: { messageId: 'm1', originalText: 'текст', originalIds: ['a'] },
      editComposition: true,
    });
    expect(vars?.attachmentIds).toEqual(['a']);
    expect(vars?.optimisticAttachments).toEqual([attachment('a', 'a.png')]);
  });

  it('пустое имя после обрезки не уходит в переименование (сервер бы отверг)', () => {
    const vars = toEditVars({
      text: 'текст',
      attachments: [pending('a', '   ', 'исходный.png')],
      edit: { messageId: 'm1', originalText: 'текст', originalIds: ['a'] },
      editComposition: true,
    });
    expect(vars?.attachmentRenames).toBeUndefined();
    // Оптимистичный список имя не ломает: фолбэк к серверному имени.
    expect(vars?.optimisticAttachments).toEqual([attachment('a', 'исходный.png')]);
  });
});

describe('chat-drafts (#188: правка с вложениями)', () => {
  beforeEach(() => {
    useChatDrafts.setState({ drafts: {} });
  });

  it('setEdit сеет строки вложений сообщения + originalIds', () => {
    const message = {
      id: 'm1',
      text: 'текст',
      attachments: [attachment('a', 'первый.png'), attachment('b', 'второй.png')],
    } as ChatMessage;
    useChatDrafts.getState().setEdit('conversation:c1', message);

    const draft = useChatDrafts.getState().drafts['conversation:c1'] ?? EMPTY_DRAFT;
    expect(draft.edit).toEqual({
      messageId: 'm1',
      originalText: 'текст',
      originalIds: ['a', 'b'],
    });
    expect(draft.text).toBe('текст');
    expect(draft.attachments.map((a) => a.localId)).toEqual(['a', 'b']);
    expect(draft.attachments.every((a) => a.status === 'ready' && a.attachment !== null)).toBe(
      true,
    );
  });

  it('finishEdit чистит вложения окна (состав съеден сообщением)', () => {
    const message = { id: 'm1', text: '', attachments: [attachment('a', 'a.png')] } as ChatMessage;
    useChatDrafts.getState().setEdit('conversation:c1', message);
    expect(useChatDrafts.getState().drafts['conversation:c1']?.attachments.length).toBe(1);

    useChatDrafts.getState().finishEdit('conversation:c1');

    const draft = useChatDrafts.getState().drafts['conversation:c1'];
    // Пустой черновик удаляется из стора целиком (prune).
    expect(draft ?? null).toBeNull();
  });

  it('insertAttachment ставит новую строку на позицию старой (замена на месте)', () => {
    useChatDrafts.getState().addAttachments('conversation:c1', [pending('a', 'a.png')]);
    useChatDrafts.getState().addAttachments('conversation:c1', [pending('b', 'b.png')]);
    useChatDrafts.getState().insertAttachment('conversation:c1', 0, pending('c', 'c.png'));

    const draft = useChatDrafts.getState().drafts['conversation:c1'] ?? EMPTY_DRAFT;
    expect(draft.attachments.map((a) => a.localId)).toEqual(['c', 'a', 'b']);
  });
});
