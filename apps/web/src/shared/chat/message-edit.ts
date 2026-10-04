import type { ChatMessage, MessageAttachment } from '@nodus/contracts';

import {
  EMPTY_DRAFT,
  useChatDrafts,
  type EditDraft,
  type PendingAttachment,
} from './chat-drafts.js';
import { useAttachSendDialog } from './dialog-stores.js';
import { cancelUpload, removePending } from './composer-files.js';
import { focusComposer } from './composer-focus.js';

/** Переменные мутации правки (#188): текст + опционально ПОЛНЫЙ состав
 *  вложений окна (attachmentIds undefined — состав не трогаем: правка
 *  текста из композера) и переименования (имя окна ≠ серверного имени). */
export interface EditMessageVars {
  messageId: string;
  text: string;
  attachmentIds?: string[];
  attachmentRenames?: Array<{ id: string; name: string }>;
  /** Оптимистичный состав для кэша ленты (I4): DTO с именами окна. */
  optimisticAttachments?: MessageAttachment[];
}

/** Вход в правку сообщения (#188): с вложениями — окно отправки в режиме
 *  правки (текст сообщения — подпись окна, композер очищен, отмена окна
 *  возвращает исходный черновик); без вложений — прежний инлайн-режим
 *  композера (баннер + текст). В обоих случаях прежние несвязанные загрузки
 *  черновика снимаются (правка их не наследует). */
export function startMessageEdit(scope: string, message: ChatMessage): void {
  const drafts = useChatDrafts.getState();
  const current = (drafts.drafts[scope] ?? EMPTY_DRAFT).attachments;
  for (const item of current) {
    if (item.status === 'uploading') cancelUpload(scope, item.localId);
    else removePending(scope, item.localId);
  }
  useChatDrafts.getState().setEdit(scope, message);
  if (message.attachments.length > 0) {
    // Канон #144: текст живёт в подписи окна, композер чист (отмена окна
    // вернёт preEditText через cancelEdit).
    useAttachSendDialog.getState().open(scope, message.text);
    useChatDrafts.getState().setText(scope, '');
  } else {
    focusComposer(scope);
  }
}

/** Отмена окна правки (#188): сообщение не тронуто — строки исходных
 *  вложений отвязываются только локально (сервер не звать), новые загрузки
 *  снимаются как в окне отправки; текст композера восстанавливается. */
export function cancelMessageEdit(scope: string): void {
  const drafts = useChatDrafts.getState();
  const edit = (drafts.drafts[scope] ?? EMPTY_DRAFT).edit;
  const items = (drafts.drafts[scope] ?? EMPTY_DRAFT).attachments;
  const originalIds = edit?.originalIds ?? [];
  for (const item of items) {
    if (item.attachment && originalIds.includes(item.attachment.id)) {
      useChatDrafts.getState().removeAttachment(scope, item.localId);
    } else if (item.status === 'uploading') {
      cancelUpload(scope, item.localId);
    } else {
      removePending(scope, item.localId);
    }
  }
  useChatDrafts.getState().cancelEdit(scope);
}

/** Сбор переменных правки из submit окна (#188): только готовые строки, в
 *  порядке списка; переименования — где имя окна отличается от серверного. */
export function toEditVars(submit: {
  text: string;
  attachments: PendingAttachment[];
  edit: EditDraft | null;
  editComposition?: boolean;
}): EditMessageVars | null {
  if (!submit.edit) return null;
  const vars: EditMessageVars = { messageId: submit.edit.messageId, text: submit.text };
  if (submit.editComposition) {
    const ready = submit.attachments.flatMap((item) =>
      item.attachment ? [{ item, attachment: item.attachment }] : [],
    );
    vars.attachmentIds = ready.map(({ attachment }) => attachment.id);
    vars.optimisticAttachments = ready.map(({ item, attachment }) => ({
      ...attachment,
      name: item.fileName.trim() || attachment.name,
    }));
    const renames = ready
      .filter(({ item, attachment }) => item.fileName.trim() !== attachment.name)
      .map(({ item, attachment }) => ({ id: attachment.id, name: item.fileName.trim() }))
      .filter((r) => r.name.length > 0);
    if (renames.length > 0) vars.attachmentRenames = renames;
  }
  return vars;
}
