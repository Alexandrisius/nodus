import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { api } from '../api-client.js';
import { EMPTY_DRAFT, useChatDrafts, type PendingAttachment } from './chat-drafts.js';
import { useAttachSendDialog } from './dialog-stores.js';
import { uploadAttachment, validateFiles, type UploadHandle } from './upload-attachment.js';

/**
 * Оркестрация загрузок композера (A1, #87): приём файлов (скрепка/paste/drop)
 * → валидация ДО старта (лимиты — вердикт 24.09) → карточки в трее черновика
 * → загрузка с прогрессом → status ready. Модульные реестры handle/file:
 * загрузка переживает ремоунт композера (смена беседы — канон Telegram
 * «загрузка продолжается в фоне»), retry после ошибки без повторного выбора.
 */

const handles = new Map<string, UploadHandle>();
const sourceFiles = new Map<string, File>();

export function addFiles(draftKey: string, incoming: File[]): void {
  if (incoming.length === 0) return;
  const store = useChatDrafts.getState();
  const current = store.drafts[draftKey] ?? EMPTY_DRAFT;
  const { accepted, issue } = validateFiles(incoming, current.attachments.length);
  if (issue === 'too-large') toast.error(ui.chat.attachTooLarge);
  if (issue === 'too-many') toast.error(ui.chat.attachTooMany);
  for (const file of accepted) startUpload(draftKey, file);
  // Принятые файлы видны ТОЛЬКО в окне отправки (#144): трея у строки ввода
  // больше нет — окно открывается на любое прикрепление (вердикт владельца).
  // Текст композера переезжает в подпись окна и НЕ дублируется онлайн в чате
  // (канон Telegram): вернётся в черновик отменой окна.
  if (accepted.length > 0) {
    const dialog = useAttachSendDialog.getState();
    if (!dialog.scope) {
      const initial = (useChatDrafts.getState().drafts[draftKey] ?? EMPTY_DRAFT).text;
      dialog.open(draftKey, initial);
      if (initial) useChatDrafts.getState().setText(draftKey, '');
    }
  }
}

function startUpload(draftKey: string, file: File): void {
  const localId = crypto.randomUUID();
  const isImage = file.type.startsWith('image/');
  // Blob из буфера обмена не имеет имени — подписываем «Изображение»
  // (research-канон: не «image.png»).
  const fileName = file.name || (isImage ? ui.chat.quotePhoto : ui.chat.attachDocument);
  const pending: PendingAttachment = {
    localId,
    fileName,
    mime: file.type || 'application/octet-stream',
    size: file.size,
    progress: 0,
    status: 'uploading',
    attachment: null,
    objectUrl: isImage ? URL.createObjectURL(file) : null,
  };
  sourceFiles.set(localId, file);
  useChatDrafts.getState().addAttachments(draftKey, [pending]);
  runUpload(draftKey, localId, file);
}

function runUpload(draftKey: string, localId: string, file: File): void {
  const store = () => useChatDrafts.getState();
  const handle = uploadAttachment(file, (progress) => {
    store().patchAttachment(draftKey, localId, { progress });
  });
  handles.set(localId, handle);
  handle.promise
    .then((attachment) => {
      handles.delete(localId);
      store().patchAttachment(draftKey, localId, {
        status: 'ready',
        progress: 1,
        attachment,
      });
    })
    .catch((error: unknown) => {
      handles.delete(localId);
      // Отмена — карточка уже убрана из трея, ошибка не нужна.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      store().patchAttachment(draftKey, localId, { status: 'error' });
      toast.error(ui.chat.uploadFailed);
    });
}

export function cancelUpload(draftKey: string, localId: string): void {
  handles.get(localId)?.cancel();
  handles.delete(localId);
  removePending(draftKey, localId);
}

export function retryUpload(draftKey: string, localId: string): void {
  const file = sourceFiles.get(localId);
  if (!file) return;
  useChatDrafts.getState().patchAttachment(draftKey, localId, {
    status: 'uploading',
    progress: 0,
  });
  runUpload(draftKey, localId, file);
}

export function removePending(draftKey: string, localId: string): void {
  const item = (useChatDrafts.getState().drafts[draftKey] ?? EMPTY_DRAFT).attachments.find(
    (attachment) => attachment.localId === localId,
  );
  sourceFiles.delete(localId);
  useChatDrafts.getState().removeAttachment(draftKey, localId);
  // Убранное из трея ГОТОВОЕ вложение освобождаем и на сервере (лимит 20
  // неотправленных, #57). Best-effort: сбой молча — брошенное уберёт
  // ленивая уборка сервера (48 ч).
  const attachmentId = item?.status === 'ready' ? item.attachment?.id : undefined;
  if (attachmentId) {
    void api(`/chat/attachments/${attachmentId}`, { method: 'DELETE' }).catch(() => undefined);
  }
}
