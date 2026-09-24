import type { ChatMessage, MessageAttachment } from '@nodus/contracts';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { chatDraftsEnvelopeSchema, zodPersistMerge } from '../lib/persist-zod.js';
import { replyDraftFrom, type ReplyDraft } from './reply-snapshot.js';

export type { ReplyDraft } from './reply-snapshot.js';

/**
 * Черновики композера per-conversation (#87, вердикт владельца 24.09:
 * индикатор черновика нужен сейчас). Ключ — draftKey композера
 * (`conversation:<id>` / `feed:<id>` / `thread:<rootId>`): текст, контекст
 * ответа/правки и трей вложений НЕ теряются при переключении бесед.
 * Персист: только текст и серализуемый контекст (reply/edit) — вложения
 * живут в памяти сессии (канон research: ни один мессенджер не восстанавливает
 * файлы черновика после перезагрузки). Пустой черновик удаляется из стора —
 * индикатор в списке бесед гаснет.
 */

export interface PendingAttachment {
  localId: string;
  fileName: string;
  mime: string;
  size: number;
  /** 0..1 — для кольца/бара прогресса. */
  progress: number;
  status: 'uploading' | 'ready' | 'error';
  /** Заполняется по завершении загрузки (attachmentIds отправки). */
  attachment: MessageAttachment | null;
  /** Превью трей (локальный objectURL изображения). */
  objectUrl: string | null;
}

export interface EditDraft {
  messageId: string;
  originalText: string;
}

export interface ChatDraft {
  text: string;
  reply: ReplyDraft | null;
  edit: EditDraft | null;
  /** Текст композера до входа в режим правки — восстанавливается отменой. */
  preEditText: string | null;
  attachments: PendingAttachment[];
}

export const EMPTY_DRAFT: ChatDraft = {
  text: '',
  reply: null,
  edit: null,
  preEditText: null,
  attachments: [],
};

interface DraftsState {
  drafts: Record<string, ChatDraft>;
  setText: (key: string, text: string) => void;
  /** Режимы ответа и правки взаимоисключающие (канон tdesktop: один _editMsgId). */
  setReply: (key: string, message: ChatMessage, quoteText?: string | null) => void;
  cancelReply: (key: string) => void;
  setEdit: (key: string, message: ChatMessage) => void;
  cancelEdit: (key: string) => void;
  /** Правка сохранена/отправлена: режим снят, восстановлен исходный текст. */
  finishEdit: (key: string) => void;
  addAttachments: (key: string, items: PendingAttachment[]) => void;
  patchAttachment: (key: string, localId: string, patch: Partial<PendingAttachment>) => void;
  removeAttachment: (key: string, localId: string) => void;
  clear: (key: string) => void;
}

function prune(draft: ChatDraft): ChatDraft | null {
  const empty = draft.text === '' && !draft.reply && !draft.edit && draft.attachments.length === 0;
  return empty ? null : draft;
}

function patchDraft(
  drafts: Record<string, ChatDraft>,
  key: string,
  fn: (draft: ChatDraft) => ChatDraft,
): Record<string, ChatDraft> {
  const next = fn(drafts[key] ?? EMPTY_DRAFT);
  const pruned = prune(next);
  const result = { ...drafts };
  if (pruned) result[key] = pruned;
  else delete result[key];
  return result;
}

export const useChatDrafts = create<DraftsState>()(
  persist(
    (set) => ({
      drafts: {},
      setText: (key, text) =>
        set((s) => ({ drafts: patchDraft(s.drafts, key, (d) => ({ ...d, text })) })),
      setReply: (key, message, quoteText) =>
        set((s) => ({
          drafts: patchDraft(s.drafts, key, (d) => ({
            ...d,
            // Вход в ответ из режима правки — правка отменяется (текст правки
            // не теряется: tdesktop-поведение не подтверждено, выбираем
            // безопасное — снимаем режим, preEdit восстанавливается).
            edit: null,
            preEditText: d.edit ? d.preEditText : null,
            text: d.edit ? (d.preEditText ?? '') : d.text,
            reply: replyDraftFrom(message, quoteText),
          })),
        })),
      cancelReply: (key) =>
        set((s) => ({ drafts: patchDraft(s.drafts, key, (d) => ({ ...d, reply: null })) })),
      setEdit: (key, message) =>
        set((s) => ({
          drafts: patchDraft(s.drafts, key, (d) => ({
            ...d,
            reply: null,
            edit: { messageId: message.id, originalText: message.text },
            preEditText: d.edit ? d.preEditText : d.text,
            text: message.text,
          })),
        })),
      cancelEdit: (key) =>
        set((s) => ({
          drafts: patchDraft(s.drafts, key, (d) =>
            d.edit ? { ...d, edit: null, text: d.preEditText ?? '', preEditText: null } : d,
          ),
        })),
      finishEdit: (key) =>
        set((s) => ({
          drafts: patchDraft(s.drafts, key, (d) => ({
            ...d,
            edit: null,
            text: d.preEditText ?? '',
            preEditText: null,
          })),
        })),
      addAttachments: (key, items) =>
        set((s) => ({
          drafts: patchDraft(s.drafts, key, (d) => ({
            ...d,
            attachments: [...d.attachments, ...items],
          })),
        })),
      patchAttachment: (key, localId, patch) =>
        set((s) => ({
          drafts: patchDraft(s.drafts, key, (d) => ({
            ...d,
            attachments: d.attachments.map((a) => (a.localId === localId ? { ...a, ...patch } : a)),
          })),
        })),
      removeAttachment: (key, localId) =>
        set((s) => ({
          drafts: patchDraft(s.drafts, key, (d) => ({
            ...d,
            attachments: d.attachments.filter((a) => a.localId !== localId),
          })),
        })),
      clear: (key) => set((s) => ({ drafts: patchDraft(s.drafts, key, () => EMPTY_DRAFT) })),
    }),
    {
      name: 'nodus-chat-drafts-v1',
      storage: createJSONStorage(() => localStorage),
      // Вложения (File/objectURL) не сериализуются — только текст и контекст.
      partialize: (s) => ({
        drafts: Object.fromEntries(
          Object.entries(s.drafts).map(([key, d]) => [
            key,
            { text: d.text, reply: d.reply, edit: d.edit, preEditText: d.preEditText },
          ]),
        ),
      }),
      version: 1,
      // После rehydrate в черновиках НЕТ attachments (не персистятся) —
      // нормализация обязательна, иначе draft.attachments.some() падает
      // (баг найден скриншот-прогоном 24.09: белый экран после F5).
      merge: (persisted, current) => {
        const merged = zodPersistMerge<DraftsState>(chatDraftsEnvelopeSchema)(persisted, current);
        return {
          ...merged,
          drafts: Object.fromEntries(
            Object.entries(merged.drafts).map(([key, d]) => [
              key,
              { ...d, attachments: d.attachments ?? [] },
            ]),
          ),
        };
      },
    },
  ),
);

/** Черновик беседы для индикатора в списке: текст ленты или канала (feed). */
export function selectConversationDraftText(
  drafts: Record<string, ChatDraft>,
  conversationId: string,
): string {
  return (
    drafts[`conversation:${conversationId}`]?.text || drafts[`feed:${conversationId}`]?.text || ''
  );
}
