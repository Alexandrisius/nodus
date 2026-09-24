import { describe, expect, it } from 'vitest';

import { REPLY_SNIPPET_MAX, buildReplySnapshot } from './reply-snapshot.js';

function original(
  overrides: Partial<{
    authorId: string;
    text: string;
    deleted: boolean;
    attachmentKind: 'image' | 'file' | null;
  }> = {},
) {
  return {
    authorId: 'orig-1',
    text: 'Исходный текст',
    deleted: false,
    attachmentKind: null,
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

  it('частичная цитата: значение как есть, пустая/нулла → null, длинная → усечение', () => {
    expect(buildReplySnapshot(original(), 'фрагмент').quoteText).toBe('фрагмент');
    expect(buildReplySnapshot(original(), null).quoteText).toBeNull();
    expect(buildReplySnapshot(original(), undefined).quoteText).toBeNull();
    expect(buildReplySnapshot(original(), '').quoteText).toBeNull();
    expect(buildReplySnapshot(original(), 'ц'.repeat(200)).quoteText).toHaveLength(
      REPLY_SNIPPET_MAX,
    );
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

  it('цитата без текста оригинала: text пуст, quoteText сохранён', () => {
    expect(buildReplySnapshot(original({ text: '' }), 'фрагмент')).toEqual({
      authorId: 'orig-1',
      text: '',
      quoteText: 'фрагмент',
      attachmentKind: null,
    });
  });

  it('удалённый оригинал: автор сохранён, содержимое затёрто', () => {
    expect(
      buildReplySnapshot(original({ deleted: true, attachmentKind: 'image' }), 'цитата'),
    ).toEqual({ authorId: 'orig-1', text: '', quoteText: null, attachmentKind: null });
  });

  it('несуществующий оригинал: authorId null', () => {
    expect(buildReplySnapshot(null, 'цитата')).toEqual({
      authorId: null,
      text: '',
      quoteText: null,
      attachmentKind: null,
    });
  });
});
