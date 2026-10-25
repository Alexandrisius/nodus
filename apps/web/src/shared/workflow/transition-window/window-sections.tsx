import type { EffectiveSection } from '@nodus/contracts';

import type { TimeEntryDraft } from '../../tasks/time-entry-fields.js';
import type { WindowDraft } from './use-window-draft.js';
import type { TransitionWindowContext, WindowFieldValues } from './window-context.js';
import { CommentSection } from './sections/comment-section.js';
import { FieldsSection } from './sections/fields-section.js';
import { ResultFilesSection } from './sections/result-files-section.js';
import { ResultMessagesSection } from './sections/result-messages-section.js';
import { ResultSection } from './sections/result-section.js';
import { TimeSection } from './sections/time-section.js';

/** Всё, что нужно разделу окна: контекст, черновик и правки черновика. */
export interface WindowSectionApi {
  context: TransitionWindowContext;
  draft: WindowDraft;
  disabled: boolean;
  /** Первое пустое обязательное поле получает фокус (окно открылось). */
  focusResult?: boolean;
  focusComment?: boolean;
  setFields: (fields: WindowFieldValues) => void;
  setTime: (time: TimeEntryDraft) => void;
  setResultText: (text: string) => void;
  setComment: (text: string) => void;
  addFiles: (messageIds: string[]) => void;
  toggleFile: (messageId: string) => void;
  toggleMessage: (messageId: string) => void;
}

/** Реестр разделов: вид → компонент. Исчерпывающий switch — новый вид
 *  раздела (#381 questions, #436 next_task) ломает компиляцию, а не тихо
 *  исчезает из окна (закрытый реестр ADR-0020). */
export function WindowSection({
  section,
  api,
}: {
  section: EffectiveSection;
  api: WindowSectionApi;
}) {
  switch (section.kind) {
    case 'fields':
      return (
        <FieldsSection
          section={section}
          context={api.context}
          draft={api.draft}
          setFields={api.setFields}
          disabled={api.disabled}
        />
      );
    case 'time':
      return (
        <TimeSection
          section={section}
          draft={api.draft}
          setTime={api.setTime}
          disabled={api.disabled}
          spentMinutes={api.context.spentMinutes}
        />
      );
    case 'result':
      return (
        <ResultSection
          value={api.draft.resultText}
          onChange={api.setResultText}
          disabled={api.disabled}
          autoFocus={api.focusResult}
        />
      );
    case 'result_files':
      return (
        <ResultFilesSection
          section={section}
          conversationId={api.context.conversationId}
          draft={api.draft}
          addFiles={api.addFiles}
          toggleFile={api.toggleFile}
          disabled={api.disabled}
        />
      );
    case 'result_messages':
      return (
        <ResultMessagesSection
          conversationId={api.context.conversationId}
          draft={api.draft}
          toggleMessage={api.toggleMessage}
          disabled={api.disabled}
        />
      );
    case 'comment':
      return (
        <CommentSection
          label={section.label}
          value={api.draft.comment}
          onChange={api.setComment}
          disabled={api.disabled}
          required={section.required}
          autoFocus={api.focusComment}
        />
      );
  }
}
