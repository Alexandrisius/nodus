import type { WorkflowDraftDocument, WorkflowDraftTransition } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { TransitionWindow } from '../../../../../shared/workflow/transition-window/transition-window.js';
import type { TransitionWindowContext } from '../../../../../shared/workflow/transition-window/window-context.js';
import { previewTransition } from './window-section-rows.js';

/** Контекст превью: «Откуда» — статус, из которого идёт кнопка; данных нет. */
function previewContext(
  t: WorkflowDraftTransition,
  doc: WorkflowDraftDocument,
  customFieldDefinitions: TransitionWindowContext['customFieldDefinitions'],
): TransitionWindowContext {
  return {
    entityId: '',
    conversationId: null,
    currentStageName:
      doc.stages.find((s) => s.id === t.fromStageId)?.name ?? ui.automation.anyStatus,
    fields: {
      description: '',
      deadline: null,
      assigneeId: null,
      plannedMinutes: null,
      customFields: {},
    },
    spentMinutes: 0,
    lastResult: null,
    access: { canEdit: false, canLogTime: false, canCheck: false },
    submission: null,
    scope: 'entity',
    // Превью окна в редакторе показывает и поля процесса (#431): значения
    // пустые, определения — живые для области маршрута.
    customFieldDefinitions,
    customFieldRefs: [],
  };
}

/** Превью окна перехода из инспектора кнопки (#380): настоящий TransitionWindow
 *  по центру экрана — как его увидит сотрудник; данных нет, разделы живые. */
export function WindowPreview({
  open,
  transition,
  document: doc,
  definitions,
  onClose,
}: {
  open: boolean;
  transition: WorkflowDraftTransition;
  document: WorkflowDraftDocument;
  definitions: TransitionWindowContext['customFieldDefinitions'];
  onClose: () => void;
}) {
  return (
    <TransitionWindow
      open={open}
      mode="preview"
      transition={previewTransition(transition, doc)}
      context={previewContext(transition, doc, definitions)}
      onCancel={onClose}
      onSubmit={() => {}}
    />
  );
}
