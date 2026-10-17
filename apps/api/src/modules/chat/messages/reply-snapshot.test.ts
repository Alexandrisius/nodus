import { describe, expect, it } from 'vitest';

import { REPLY_SNIPPET_MAX, buildReplySnapshot, isQuoteOf } from './reply-snapshot.js';

function original(
  overrides: Partial<{
    authorId: string;
    text: string;
    deleted: boolean;
    attachmentKind: 'image' | 'file' | 'sticker' | null;
    stickerFileId: string | null;
    stickerEmoji: string | null;
    stickerMime: string | null;
  }> = {},
) {
  return {
    authorId: 'orig-1',
    text: 'Исходный текст',
    deleted: false,
    attachmentKind: null,
    stickerFileId: null,
    stickerEmoji: null,
    stickerMime: null,
    ...overrides,
  };
}

describe('buildReplySnapshot', () => {
  it('живой оригинал: текст до 160 включительно не режется', () => {
    const text = 'а'.repeat(160);
    expect(buildReplySnapshot(original({ text }), null)).toEqual({
      authorId: 'orig-1',
      text,
      quoteText: null,
      attachmentKind: null,
      stickerFileId: null,
      stickerEmoji: null,
      stickerMime: null,
    });
  });

  it('живой оригинал: 161 символ → усечение до 160 (кириллица не ломается)', () => {
    const snapshot = buildReplySnapshot(original({ text: 'я'.repeat(160) + 'х' }), null);
    expect(snapshot.text).toBe('я'.repeat(160)); // 161-й символ ('х') отрезан
    expect(snapshot.text).toHaveLength(REPLY_SNIPPET_MAX);
    expect(buildReplySnapshot(original({ text: 'б'.repeat(161) }), null).text).toBe(
      'б'.repeat(160),
    );
  });

  it('частичная цитата: фрагмент как есть, пустая/нулла → null, длинная → усечение', () => {
    expect(buildReplySnapshot(original(), 'текст').quoteText).toBe('текст');
    expect(buildReplySnapshot(original(), null).quoteText).toBeNull();
    expect(buildReplySnapshot(original(), undefined).quoteText).toBeNull();
    expect(buildReplySnapshot(original(), '').quoteText).toBeNull();
    const long = original({ text: 'ц'.repeat(300) });
    expect(buildReplySnapshot(long, 'ц'.repeat(200)).quoteText).toHaveLength(REPLY_SNIPPET_MAX);
  });

  it('подделка (#346): «цитата» не из текста оригинала отбрасывается — ответ на всё сообщение', () => {
    const snap = buildReplySnapshot(
      original({ text: 'Сдам отчёт в пятницу' }),
      'Сдам отчёт никогда',
    );
    expect(snap.quoteText).toBeNull();
    expect(snap.text).toBe('Сдам отчёт в пятницу');
  });

  it('isQuoteOf: выделение из пузыря — подписи чипов вместо токенов, пробелы/переносы нормализуются', () => {
    const text = 'Привет, @[Артём](user:11111111-1111-1111-1111-111111111111)!\nГлянь  макет';
    expect(isQuoteOf(text, 'Артём!')).toBe(true);
    expect(isQuoteOf(text, 'Артём! Глянь макет')).toBe(true);
    expect(isQuoteOf(text, '@[Артём](user:11111111-1111-1111-1111-111111111111)!')).toBe(true);
    expect(isQuoteOf(text, 'Глянь договор')).toBe(false);
    expect(isQuoteOf(text, '   ')).toBe(false);
  });

  it('вид вложения прокидывается как есть', () => {
    expect(buildReplySnapshot(original({ attachmentKind: 'image' }), null).attachmentKind).toBe(
      'image',
    );
    expect(buildReplySnapshot(original({ attachmentKind: 'file' }), null).attachmentKind).toBe(
      'file',
    );
    expect(buildReplySnapshot(original({ attachmentKind: null }), null).attachmentKind).toBeNull();
  });

  it('оригинал-стикер: fileId/эмодзи/mime для мини-глифа цитаты (#288)', () => {
    expect(
      buildReplySnapshot(
        original({
          attachmentKind: 'sticker',
          stickerFileId: 'file-1',
          stickerEmoji: '🙂',
          stickerMime: 'image/webp',
        }),
        null,
      ),
    ).toEqual({
      authorId: 'orig-1',
      text: 'Исходный текст',
      quoteText: null,
      attachmentKind: 'sticker',
      stickerFileId: 'file-1',
      stickerEmoji: '🙂',
      stickerMime: 'image/webp',
    });
  });

  it('цитата без текста оригинала: text пуст, частичной цитаты быть не может (#346)', () => {
    expect(buildReplySnapshot(original({ text: '' }), 'фрагмент')).toEqual({
      authorId: 'orig-1',
      text: '',
      quoteText: null,
      attachmentKind: null,
      stickerFileId: null,
      stickerEmoji: null,
      stickerMime: null,
    });
  });

  it('удалённый оригинал: автор сохранён, содержимое затёрто (включая стикер-глиф)', () => {
    expect(
      buildReplySnapshot(
        original({
          deleted: true,
          attachmentKind: 'sticker',
          stickerFileId: 'file-1',
          stickerEmoji: '🙂',
          stickerMime: 'image/webp',
        }),
        'цитата',
      ),
    ).toEqual({
      authorId: 'orig-1',
      text: '',
      quoteText: null,
      attachmentKind: null,
      stickerFileId: null,
      stickerEmoji: null,
      stickerMime: null,
    });
  });

  it('несуществующий оригинал: authorId null', () => {
    expect(buildReplySnapshot(null, 'цитата')).toEqual({
      authorId: null,
      text: '',
      quoteText: null,
      attachmentKind: null,
      stickerFileId: null,
      stickerEmoji: null,
      stickerMime: null,
    });
  });
});
