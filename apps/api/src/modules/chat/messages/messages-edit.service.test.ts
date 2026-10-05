// Правка сообщений (#188): текст + состав вложений — выделено из общего
// контракта сервиса (I5: файл тестов > 500 строк недопустим).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAT_EVENTS, ErrorCode } from '@nodus/contracts';

import { MessagesService } from './messages.service.js';
import type { MemberRow } from '../conversations/conversations.repository.js';
import type { MessageRow } from './messages.repository.js';

const CONV = 'conv-1';
const ME = 'me-1';
const PEER = 'peer-1';
const TX = 'tx-handle';

function makeMessage(overrides: Partial<MessageRow> = {}): MessageRow {
  const now = new Date('2026-09-24T09:00:00Z');
  return {
    id: 'msg-1',
    conversationId: CONV,
    seq: 3n,
    authorId: ME,
    clientMessageId: 'key-1',
    text: 'Текст',
    replyToId: null,
    replySnapshot: null,
    threadRootId: null,
    fwdConversationId: null,
    fwdMessageId: null,
    fwdAuthorId: null,
    fwdThreadRootId: null,
    editedAt: null,
    deletedAt: null,
    obliterated: false,
    urgent: false,
    mentionedUserIds: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeMember(overrides: Partial<MemberRow> = {}): MemberRow {
  return {
    conversationId: CONV,
    userId: PEER,
    role: 'member',
    lastReadSeq: 0n,
    lastReadAt: null,
    joinedAt: new Date('2026-09-24T09:00:00Z'),
    pinned: false,
    muted: false,
    snoozed: false,
    hidden: false,
    ...overrides,
  };
}

function attachmentRow(overrides: Record<string, unknown> = {}) {
  return {
    messageId: 'msg-1',
    id: 'att-1',
    name: 'a.png',
    kind: 'file',
    // mime в БД NOT NULL — витринная классификация (#211) читает его.
    mime: 'application/pdf',
    sortOrder: 0,
    ...overrides,
  };
}

describe('MessagesService.edit (#188: текст + состав вложений)', () => {
  const repo = {
    findByIdInConversation: vi.fn(),
    attachmentsFor: vi.fn(),
    updateEditText: vi.fn(),
    listPage: vi.fn(),
  };
  const attachmentsRepo = {
    syncMessageAttachments: vi.fn(),
    renameMessageAttachments: vi.fn(),
  };
  const conversations = {
    findMembership: vi.fn(),
    listMembers: vi.fn(),
  };
  const mapper = { toDtos: vi.fn(), toFreshDto: vi.fn() };
  const threadParticipants = { upsert: vi.fn(), delete: vi.fn() };
  const stickersRepo = { findSticker: vi.fn() };
  const txRunner = { run: vi.fn((cb: (tx: string) => unknown) => cb(TX)) };
  const eventBus = { emit: vi.fn() };
  const userProfiles = { findRefs: vi.fn() };
  let service: MessagesService;

  beforeEach(() => {
    vi.clearAllMocks();
    conversations.findMembership.mockResolvedValue(makeMember({ userId: ME, role: 'owner' }));
    conversations.listMembers.mockResolvedValue([]);
    service = new MessagesService(
      repo as never,
      attachmentsRepo as never,
      conversations as never,
      mapper as never,
      txRunner as never,
      eventBus as never,
      userProfiles as never,
      threadParticipants as never,
      stickersRepo as never,
      { deleteByMessage: vi.fn().mockResolvedValue([]) } as never,
      {
        applyMessageSent: vi.fn(async () => {}),
        applyMessageEdited: vi.fn(async () => {}),
        applyMessageDeleted: vi.fn(async () => {}),
        applyForwardCopies: vi.fn(async () => {}),
      } as never,
    );
  });

  it('сообщение не найдено / не автор → NOT_FOUND / FORBIDDEN без UPDATE', async () => {
    repo.findByIdInConversation.mockResolvedValue(null);
    await expect(service.edit(ME, CONV, 'msg-1', { text: 'Новый' })).rejects.toMatchObject({
      code: ErrorCode.NOT_FOUND,
      message: 'Message not found',
    });
    repo.findByIdInConversation.mockResolvedValue(makeMessage({ authorId: PEER }));
    await expect(service.edit(ME, CONV, 'msg-1', { text: 'Новый' })).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN,
      message: 'Only author can modify this message',
    });
    expect(repo.updateEditText).not.toHaveBeenCalled();
  });

  it('пересланную копию не правит даже переславший (#111)', async () => {
    repo.findByIdInConversation.mockResolvedValue(
      makeMessage({ fwdMessageId: 'src-msg', fwdConversationId: 'src-conv', fwdAuthorId: PEER }),
    );
    await expect(
      service.edit(ME, CONV, 'msg-1', { text: 'переписанное чужое' }),
    ).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN,
      message: 'Forwarded messages cannot be edited',
    });
    expect(repo.updateEditText).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it('тот же текст → без UPDATE и без события', async () => {
    const message = makeMessage({ text: 'Привет' });
    repo.findByIdInConversation.mockResolvedValue(message);

    const result = await service.edit(ME, CONV, 'msg-1', { text: 'Привет' });

    expect(repo.updateEditText).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalled();
    expect(result.message).toEqual(message);
  });

  it('другой текст → updateEditText + MESSAGE_EDITED с editedAt', async () => {
    repo.findByIdInConversation.mockResolvedValue(makeMessage({ text: 'Привет' }));
    repo.updateEditText.mockResolvedValue(
      makeMessage({ text: 'Новый', editedAt: new Date('2026-09-24T13:00:00Z') }),
    );

    const result = await service.edit(ME, CONV, 'msg-1', { text: 'Новый' });

    expect(repo.updateEditText).toHaveBeenCalledWith(CONV, 'msg-1', ME, 'Новый', TX);
    expect(result.message.text).toBe('Новый');
    expect(eventBus.emit).toHaveBeenCalledWith(
      TX,
      CHAT_EVENTS.MESSAGE_EDITED,
      expect.objectContaining({
        editedAt: '2026-09-24T13:00:00.000Z',
        authorId: ME,
        text: 'Новый',
        seq: 3,
      }),
      expect.anything(),
    );
  });

  it('правка только текста: состав не трогается (attachmentIds отсутствует)', async () => {
    repo.findByIdInConversation.mockResolvedValue(makeMessage({ text: 'Привет' }));
    repo.updateEditText.mockResolvedValue(
      makeMessage({ text: 'Новый', editedAt: new Date('2026-10-04T12:02:00Z') }),
    );

    await service.edit(ME, CONV, 'msg-1', { text: 'Новый' });

    expect(repo.attachmentsFor).not.toHaveBeenCalled();
    expect(attachmentsRepo.syncMessageAttachments).not.toHaveBeenCalled();
  });

  it('смена состава: sync вызван, реальная смена → editedAt + событие', async () => {
    repo.findByIdInConversation.mockResolvedValue(makeMessage({ text: 'Файлы' }));
    repo.attachmentsFor
      .mockResolvedValueOnce([attachmentRow({ id: 'att-1', name: 'старое.png' })])
      .mockResolvedValueOnce([attachmentRow({ id: 'att-2', name: 'новое.png' })]);
    repo.updateEditText.mockResolvedValue(
      makeMessage({ text: 'Файлы', editedAt: new Date('2026-10-04T12:00:00Z') }),
    );

    await service.edit(ME, CONV, 'msg-1', { text: 'Файлы', attachmentIds: ['att-2'] });

    expect(attachmentsRepo.syncMessageAttachments).toHaveBeenCalledWith('msg-1', ['att-2'], ME, TX);
    expect(attachmentsRepo.renameMessageAttachments).not.toHaveBeenCalled();
    expect(repo.updateEditText).toHaveBeenCalledWith(CONV, 'msg-1', ME, 'Файлы', TX);
    expect(eventBus.emit).toHaveBeenCalledTimes(1);
  });

  it('идентичный состав без переименований → без события (идемпотентность)', async () => {
    const rows = [attachmentRow(), attachmentRow({ id: 'att-2', name: 'b.png', sortOrder: 1 })];
    repo.findByIdInConversation.mockResolvedValue(makeMessage({ text: 'Файлы' }));
    repo.attachmentsFor.mockResolvedValue(rows);

    await service.edit(ME, CONV, 'msg-1', { text: 'Файлы', attachmentIds: ['att-1', 'att-2'] });

    expect(attachmentsRepo.syncMessageAttachments).toHaveBeenCalledWith(
      'msg-1',
      ['att-1', 'att-2'],
      ME,
      TX,
    );
    expect(repo.updateEditText).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it('переименование: имена применены, editedAt + событие при реальной смене', async () => {
    repo.findByIdInConversation.mockResolvedValue(makeMessage({ text: 'Файлы' }));
    repo.attachmentsFor
      .mockResolvedValueOnce([attachmentRow({ name: 'старое.png' })])
      .mockResolvedValueOnce([attachmentRow({ name: 'новое имя.png' })]);
    repo.updateEditText.mockResolvedValue(
      makeMessage({ text: 'Файлы', editedAt: new Date('2026-10-04T12:01:00Z') }),
    );

    await service.edit(ME, CONV, 'msg-1', {
      text: 'Файлы',
      attachmentRenames: [{ id: 'att-1', name: 'новое имя.png' }],
    });

    expect(attachmentsRepo.renameMessageAttachments).toHaveBeenCalledWith(
      'msg-1',
      [{ id: 'att-1', name: 'новое имя.png' }],
      TX,
    );
    expect(attachmentsRepo.syncMessageAttachments).not.toHaveBeenCalled();
    expect(eventBus.emit).toHaveBeenCalledTimes(1);
  });

  it('переименование без смены имени → без события', async () => {
    repo.findByIdInConversation.mockResolvedValue(makeMessage({ text: 'Файлы' }));
    repo.attachmentsFor.mockResolvedValue([attachmentRow({ name: 'то же.png' })]);

    await service.edit(ME, CONV, 'msg-1', {
      text: 'Файлы',
      attachmentRenames: [{ id: 'att-1', name: 'то же.png' }],
    });

    expect(repo.updateEditText).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it('стикер-сообщение составом не правится (стикер неделим, #143)', async () => {
    repo.findByIdInConversation.mockResolvedValue(makeMessage({ text: '' }));
    repo.attachmentsFor.mockResolvedValue([attachmentRow({ kind: 'sticker' })]);

    await expect(
      service.edit(ME, CONV, 'msg-1', { text: '', attachmentIds: [] }),
    ).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN,
      message: 'Sticker messages cannot be edited',
    });
    expect(attachmentsRepo.syncMessageAttachments).not.toHaveBeenCalled();
  });

  it('стикер не переименовывается (гвард на attachmentRenames, #143)', async () => {
    repo.findByIdInConversation.mockResolvedValue(makeMessage({ text: '' }));
    repo.attachmentsFor.mockResolvedValue([attachmentRow({ kind: 'sticker' })]);

    await expect(
      service.edit(ME, CONV, 'msg-1', {
        text: '',
        attachmentRenames: [{ id: 'att-1', name: 'переименованный стикер' }],
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.FORBIDDEN,
      message: 'Sticker messages cannot be edited',
    });
    expect(attachmentsRepo.renameMessageAttachments).not.toHaveBeenCalled();
  });

  it('непустота (security #188): мусорный id не оставляет сообщение пустым', async () => {
    repo.findByIdInConversation.mockResolvedValue(makeMessage({ text: '' }));
    // До правки — одно вложение; после синхронизации список пуст (id не
    // клеймится) → валидационная ошибка, транзакция откатится.
    repo.attachmentsFor
      .mockResolvedValueOnce([attachmentRow({ name: 'файл.png' })])
      .mockResolvedValueOnce([]);

    await expect(
      service.edit(ME, CONV, 'msg-1', { text: '', attachmentIds: ['unknown-uuid'] }),
    ).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_FAILED,
      message: 'Message must have text or attachments',
    });
    expect(repo.updateEditText).not.toHaveBeenCalled();
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  it('текст с обрезкой до пустого не проходит непустоту', async () => {
    repo.findByIdInConversation.mockResolvedValue(makeMessage({ text: 'старый текст' }));
    repo.attachmentsFor.mockResolvedValue([]);

    await expect(
      service.edit(ME, CONV, 'msg-1', { text: '   ', attachmentIds: [] }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED });
  });
});
