import { describe, expect, it } from 'vitest';

import {
  createLetterFieldsSchema,
  letterBodySchema,
  letterDetailSchema,
  letterHistoryEntrySchema,
  letterRefSchema,
  listLettersQuerySchema,
  updateLetterBodySchema,
} from './letter.schemas.js';

const id = () => crypto.randomUUID();

const listItem = {
  id: id(),
  typeId: id(),
  direction: 'incoming',
  stage: { id: id(), name: 'Новое', order: 0, systemState: 'backlog', color: 'neutral' },
  regNumber: null,
  regDate: null,
  registeredAt: null,
  receivedAt: '2026-10-26T07:12:00.000Z',
  source: 'manual',
  subject: null,
  counterparty: null,
  theirNumber: null,
  theirDate: null,
  receiptMethod: null,
  project: null,
  addressee: null,
  responseDeadline: null,
  attachmentCount: 1,
};

describe('письмо v3 (#55)', () => {
  it('незарегистрированный бумажный скан: без темы, номера и корреспондента', () => {
    const fileId = id();
    const attachmentId = id();
    const detail = letterDetailSchema.parse({
      ...listItem,
      type: {
        id: listItem.typeId,
        code: 'letter-incoming',
        name: 'Входящее письмо',
        category: 'letter',
      },
      signer: null,
      registrar: null,
      attachments: [
        {
          id: attachmentId,
          fileId,
          role: 'main',
          name: 'скан.jpg',
          mime: 'image/jpeg',
          size: 120_000,
          url: '/api/v1/files/x/content?exp=1&sig=2',
          pdfUrl: null,
          previewKind: 'image',
        },
      ],
      body: { kind: 'document', attachmentId },
      customFields: {},
      customFieldRefs: [],
      access: { canEdit: false, canDeleteSpam: true, canJoin: true, isParticipant: false },
    });
    expect(detail.subject).toBeNull();
    expect(detail.body).toEqual({ kind: 'document', attachmentId });
  });

  it('тело — закрытый union; ссылка на письмо допускает пустую тему (чат)', () => {
    expect(letterBodySchema.parse({ kind: 'none' })).toEqual({ kind: 'none' });
    expect(() => letterBodySchema.parse({ kind: 'html' })).toThrow();
    expect(
      letterRefSchema.parse({ id: listItem.id, regNumber: null, subject: null }).subject,
    ).toBeNull();
  });

  it('правка одного поля не подставляет чужие ключи (gotcha Zod 4)', () => {
    expect(updateLetterBodySchema.parse({ subject: ' Новая тема ' })).toEqual({
      subject: 'Новая тема',
    });
    expect(updateLetterBodySchema.parse({ signerId: null })).toEqual({ signerId: null });
    expect(updateLetterBodySchema.safeParse({}).success).toBe(false);
    // Адресат и номер правкой не меняются (В3).
    expect(updateLetterBodySchema.safeParse({ addresseeId: id() }).success).toBe(false);
    expect(updateLetterBodySchema.safeParse({ regNumber: 'Вх-2026/1' }).success).toBe(false);
  });

  it('поля multipart ручного создания: главный — первый по умолчанию, строки приводятся', () => {
    const typeId = id();
    expect(createLetterFieldsSchema.parse({ typeId })).toEqual({ typeId, mainIndex: 0 });
    expect(createLetterFieldsSchema.parse({ typeId, mainIndex: '3' }).mainIndex).toBe(3);
    expect(createLetterFieldsSchema.safeParse({ typeId, mainIndex: '20' }).success).toBe(false);
  });

  it('запрос списка: вкладка, корреспондент, поиск 1–128', () => {
    expect(listLettersQuerySchema.parse({ box: 'new' }).box).toBe('new');
    expect(listLettersQuerySchema.safeParse({ box: 'registry' }).success).toBe(false);
    expect(listLettersQuerySchema.safeParse({ search: 'я'.repeat(129) }).success).toBe(false);
  });

  it('история — union по виду; правка несёт 1–20 изменений', () => {
    const base = { id: id(), at: '2026-10-26T08:00:00.000Z', actor: null };
    expect(
      letterHistoryEntrySchema.parse({ ...base, kind: 'registered', regNumber: 'Вх-2026/118' })
        .kind,
    ).toBe('registered');
    expect(
      letterHistoryEntrySchema.safeParse({ ...base, kind: 'updated', changes: [] }).success,
    ).toBe(false);
    expect(
      letterHistoryEntrySchema.parse({
        ...base,
        kind: 'updated',
        changes: [{ field: 'subject', from: 'Старая', to: 'Новая' }],
      }).kind,
    ).toBe('updated');
  });
});
