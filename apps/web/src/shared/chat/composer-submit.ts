import type { SendChatVars } from './api.js';
import type { ComposerSubmit } from './chat-composer.js';
import { toReplyPreview } from './reply-snapshot.js';

/** ComposerSubmit → SendChatVars: готовые вложения → attachmentIds + превью
 *  для оптимистичного temp-сообщения; черновик ответа → поля цитаты. */
export function toSendVars(submit: ComposerSubmit): SendChatVars {
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
