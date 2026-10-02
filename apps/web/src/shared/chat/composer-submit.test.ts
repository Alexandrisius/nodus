import { describe, expect, it } from 'vitest';

import type { StickerSubmitPayload } from './sticker-api.js';
import { toSendVars } from './composer-submit.js';

/** ComposerSubmit → SendChatVars (#143): стикер — приоритетная ветка
 *  (отдельное сообщение без текста, черновик не съедается); обычный путь
 *  (текст/вложения/цитата) не меняется. */

const STICKER: StickerSubmitPayload = {
  stickerId: '11111111-1111-4111-8111-111111111111',
  attachment: {
    id: '22222222-2222-4222-8222-222222222222',
    fileId: '11111111-1111-4111-8111-111111111111',
    name: 'sticker.png',
    size: 1000,
    mime: 'image/png',
    kind: 'sticker',
    url: '/stickers/demo/1.png',
    thumbnailUrl: null,
    previewKind: 'image',
    pdfUrl: null,
    width: 512,
    height: 512,
    sticker: {
      packId: '33333333-3333-4333-8333-333333333333',
      packTitle: 'Nodus',
      packScope: 'corporate',
      emojis: ['🔥'],
    },
  },
};

describe('toSendVars: стикер-ветка (#143)', () => {
  it('стикер → stickerId + превью-вложение, текст пуст, keepDraft', () => {
    const vars = toSendVars({
      text: 'набранный текст остаётся в композере',
      attachments: [],
      reply: null,
      edit: null,
      sticker: STICKER,
    });
    expect(vars).toMatchObject({
      text: '',
      stickerId: STICKER.stickerId,
      keepDraft: true,
      replyToId: null,
    });
    expect(vars.attachments).toEqual([STICKER.attachment]);
    expect(vars.attachmentIds).toBeUndefined();
  });

  it('без стикера — прежний путь (текст/вложения/цитата)', () => {
    const vars = toSendVars({ text: 'привет', attachments: [], reply: null, edit: null });
    expect(vars.text).toBe('привет');
    expect(vars.stickerId).toBeUndefined();
    expect(vars.keepDraft).toBeUndefined();
  });
});
