import { describe, expect, it } from 'vitest';
import type { LetterAttachment, LetterDetail } from '@nodus/contracts';

import {
  letterWithMainDocument,
  mainDocumentCandidates,
  mainDocumentMissing,
  mainDocumentOf,
} from './letter-main-document.js';

const file = (id: string, role: LetterAttachment['role']): LetterAttachment =>
  ({
    id,
    fileId: id,
    role,
    name: `${id}.${role === 'body_pdf' ? 'pdf' : 'bin'}`,
    mime: 'application/octet-stream',
    size: 10,
    contentId: null,
    inline: false,
    url: '/f',
    pdfUrl: null,
    previewKind: 'file',
  }) as LetterAttachment;

const letter = (attachments: LetterAttachment[], body: LetterDetail['body']): LetterDetail =>
  ({ attachments, body, registeredAt: null }) as unknown as LetterDetail;

describe('«Основной документ письма» (#56) — выбор звездой', () => {
  it('кандидаты — файлы: вложения, main и PDF-копия тела; текст и исходник — нет', () => {
    const files = [
      file('a', 'attachment'),
      file('m', 'main'),
      file('t', 'body'),
      file('p', 'body_pdf'),
      file('s', 'source'),
    ];
    expect(mainDocumentCandidates(letter(files, { kind: 'none' })).map((f) => f.id)).toEqual([
      'a',
      'm',
      'p',
    ]);
  });

  it('главный де-факто — main, иначе PDF-копия тела (умолчание приёма)', () => {
    const pdf = file('p', 'body_pdf');
    expect(mainDocumentOf(letter([pdf], { kind: 'document', attachmentId: 'p' }))?.id).toBe('p');
    const body = letter([file('t', 'body')], { kind: 'html', attachmentId: 't' });
    expect(mainDocumentOf(body)).toBeNull();
    expect(mainDocumentMissing(body)).toBe(false); // кандидатов нет — пропуска нет
  });

  it('пропуск: кандидаты есть, звезда не выбрана', () => {
    const only = letter([file('a', 'attachment')], { kind: 'none' });
    expect(mainDocumentMissing(only)).toBe(true);
  });

  it('оптимистичный выбор: файл → main, прежний main → приложение, тело — document', () => {
    const files = [file('old', 'main'), file('new', 'attachment'), file('t', 'body')];
    const next = letterWithMainDocument(
      letter(files, { kind: 'document', attachmentId: 'old' }),
      'new',
    );
    expect(next.attachments.map((f) => [f.id, f.role])).toEqual([
      ['old', 'attachment'],
      ['new', 'main'],
      ['t', 'body'],
    ]);
    expect(next.body).toEqual({ kind: 'document', attachmentId: 'new' });
  });

  it('звезда на PDF-копии тела: роль body_pdf неизменна, main сбрасывается', () => {
    const files = [file('old', 'main'), file('p', 'body_pdf')];
    const next = letterWithMainDocument(
      letter(files, { kind: 'document', attachmentId: 'old' }),
      'p',
    );
    expect(next.attachments.map((f) => [f.id, f.role])).toEqual([
      ['old', 'attachment'],
      ['p', 'body_pdf'],
    ]);
    expect(next.body).toEqual({ kind: 'document', attachmentId: 'p' });
  });
});
