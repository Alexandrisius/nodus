import { describe, expect, it } from 'vitest';
import type { ChatMessage, MessageAttachment } from '@nodus/contracts';

import { replyDraftFrom, toReplyPreview } from './reply-snapshot.js';

/** Экстракция мини-глифа стикера в черновик ответа (#288, референс Telegram):
 *  цитата-на-стикер несёт url/эмодзи/mime оригинала; у остальных видов —
 *  null. Круг ReplyDraft → ReplyPreview замкнут (temp-пузырь видит глиф). */

const stickerAttachment: MessageAttachment = {
  id: 'att-st',
  fileId: 'file-st-1',
  name: 'sticker.webp',
  size: 24_000,
  mime: 'image/webp',
  kind: 'sticker',
  url: '/api/v1/files/file-st-1/content?exp=1&sig=x',
  thumbnailUrl: null,
  previewKind: 'image',
  pdfUrl: null,
  width: 512,
  height: 512,
  sticker: { packId: 'p-1', packTitle: 'Пак', packScope: 'personal', emojis: ['🔥', '😀'] },
};

const message = (attachments: MessageAttachment[]): ChatMessage => ({
  id: 'orig-1',
  conversationId: 'conv-1',
  seq: 1,
  clientMessageId: 'client-1',
  author: { id: 'u2', displayName: 'Мария Соколова', avatarUrl: null },
  text: '',
  replyToId: null,
  reply: null,
  deletedAt: null,
  pinned: false,
  forwardedFrom: null,
  threadRootId: null,
  threadRepliesCount: 0,
  reactions: [],
  attachments,
  editedAt: null,
  readAt: null,
  readBy: [],
  urgent: false,
  mentionedUserIds: [],
  linkPreview: null,
  createdAt: '2026-10-14T09:00:00Z',
});

describe('replyDraftFrom — экстракция стикер-глифа (#288)', () => {
  it('стикер-оригинал: url/первый эмодзи/mime в черновик', () => {
    const draft = replyDraftFrom(message([stickerAttachment]), null);
    expect(draft.attachmentKind).toBe('sticker');
    expect(draft.stickerUrl).toBe(stickerAttachment.url);
    expect(draft.stickerEmoji).toBe('🔥');
    expect(draft.stickerMime).toBe('image/webp');
  });

  it('не-стикер (фото): все три поля null', () => {
    const photo: MessageAttachment = {
      ...stickerAttachment,
      kind: 'image',
      sticker: undefined,
      mime: 'image/png',
    };
    const draft = replyDraftFrom(message([photo]), null);
    expect(draft.attachmentKind).toBe('image');
    expect(draft.stickerUrl).toBeNull();
    expect(draft.stickerEmoji).toBeNull();
    expect(draft.stickerMime).toBeNull();
  });

  it('круг ReplyDraft → ReplyPreview: temp-пузырь несёт глиф для оптимистичной цитаты', () => {
    const preview = toReplyPreview(replyDraftFrom(message([stickerAttachment]), null));
    expect(preview).toMatchObject({
      attachmentKind: 'sticker',
      stickerUrl: stickerAttachment.url,
      stickerEmoji: '🔥',
      stickerMime: 'image/webp',
      deleted: false,
      obliterated: false,
    });
  });
});
