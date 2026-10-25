import { useState } from 'react';

import { EMPTY_TIME_ENTRY, type TimeEntryDraft } from '../../tasks/time-entry-fields.js';
import type { TransitionWindowContext, WindowFieldValues } from './window-context.js';

/** Черновик окна: введённое пользователем до отправки. */
export interface WindowDraft {
  fields: WindowFieldValues;
  time: TimeEntryDraft;
  /** Текст итога (префилл — последняя ревизия). */
  resultText: string;
  /** Сообщения-файлы, выбранные в разделе «Файлы итога». */
  files: string[];
  /** Сообщения, отмеченные как отчёт в разделе «Сообщения». */
  messages: string[];
  /** id прежней ревизии итога: переносятся, пока пользователь их не заменил. */
  carried: string[];
  comment: string;
}

export function emptyDraft(context: TransitionWindowContext): WindowDraft {
  return {
    fields: { ...context.fields },
    time: { ...EMPTY_TIME_ENTRY },
    resultText: context.lastResult?.text ?? '',
    files: [],
    messages: [],
    carried: [...(context.lastResult?.messageIds ?? [])],
    comment: '',
  };
}

/** Все id сообщений итога, которые уйдут в ревизию (для lookup и подсчёта файлов). */
export function draftMessageIds(draft: WindowDraft): string[] {
  return [...new Set([...draft.carried, ...draft.files, ...draft.messages])];
}

/**
 * Состояние черновика окна перехода. Префилл — текущие значения полей и
 * последняя ревизия итога; разделы только меняют черновик, сервер решает
 * (пессимистичная отправка). Переключение выбранного файла в пикере —
 * добавление/снятие его сообщения.
 */
export function useWindowDraft(context: TransitionWindowContext | null) {
  const [draft, setDraft] = useState<WindowDraft>(() =>
    context
      ? emptyDraft(context)
      : {
          fields: { description: '', deadline: null, assigneeId: null, plannedMinutes: null },
          time: { ...EMPTY_TIME_ENTRY },
          resultText: '',
          files: [],
          messages: [],
          carried: [],
          comment: '',
        },
  );

  const patch = (next: Partial<WindowDraft>) => setDraft((prev) => ({ ...prev, ...next }));

  return {
    draft,
    setFields: (fields: WindowFieldValues) => patch({ fields }),
    setTime: (time: TimeEntryDraft) => patch({ time }),
    setResultText: (resultText: string) => patch({ resultText }),
    setComment: (comment: string) => patch({ comment }),
    toggleFile: (messageId: string) =>
      setDraft((prev) => ({
        ...prev,
        files: prev.files.includes(messageId)
          ? prev.files.filter((id) => id !== messageId)
          : [...prev.files, messageId],
        // Выбор из чата заменяет прежний перенос этого id (не дублируем).
        carried: prev.carried.filter((id) => id !== messageId),
      })),
    toggleMessage: (messageId: string) =>
      setDraft((prev) => ({
        ...prev,
        messages: prev.messages.includes(messageId)
          ? prev.messages.filter((id) => id !== messageId)
          : [...prev.messages, messageId],
        carried: prev.carried.filter((id) => id !== messageId),
      })),
    addFiles: (messageIds: string[]) =>
      setDraft((prev) => ({
        ...prev,
        files: [...new Set([...prev.files, ...messageIds])],
        carried: prev.carried.filter((id) => !messageIds.includes(id)),
      })),
    reset: () => context && setDraft(emptyDraft(context)),
  };
}
