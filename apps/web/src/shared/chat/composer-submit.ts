import type { SendChatVars } from './api.js';
import type { ComposerSubmit } from './chat-composer.js';
import { toReplyPreview } from './reply-snapshot.js';

/** ComposerSubmit → SendChatVars: готовые вложения → attachmentIds + превью
 *  для оптимистичного temp-сообщения; черновик ответа → поля цитаты.
 *  Стикер (#143) — приоритетная ветка: отдельное сообщение без текста,
 *  черновик композера не съедается (keepDraft). */
export function toSendVars(submit: ComposerSubmit): SendChatVars {
  if (submit.sticker) {
    return {
      text: '',
      stickerId: submit.sticker.stickerId,
      attachments: [submit.sticker.attachment],
      replyToId: null,
      quoteText: null,
      reply: null,
      keepDraft: true,
    };
  }
  const ready = submit.attachments.flatMap((a) => (a.attachment ? [a.attachment] : []));
  return {
    text: submit.text,
    attachmentIds: ready.map((a) => a.id),
    attachments: ready,
    replyToId: submit.reply?.messageId ?? null,
    quoteText: submit.reply?.quoteText ?? null,
    reply: submit.reply ? toReplyPreview(submit.reply) : null,
  };
}
