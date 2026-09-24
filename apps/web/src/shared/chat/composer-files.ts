import { ui } from '@nodus/contracts';
import { toast } from 'sonner';

import { EMPTY_DRAFT, useChatDrafts, type PendingAttachment } from './chat-drafts.js';
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
  sourceFiles.delete(localId);
  useChatDrafts.getState().removeAttachment(draftKey, localId);
}
