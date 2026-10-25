import { useCallback, useState } from 'react';
import type { WorkflowDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { useRouteDocStore, type SelectionRef } from '../../../model/route-doc-store.js';
import { SidePanel } from './side-panel.js';
import { StageButtonsSection } from './stage-buttons-section.js';
import { StagePanel } from './stage-panel.js';
import { TransitionPanel, type TransitionSection } from './transition-panel.js';
import { ConditionsSection, RolesSection, RulesSection } from './transition-sections.js';
import { WindowSection } from './window-section.js';

/** Раздел панели: корень или переход внутрь (у кнопки — три раздела, у
 *  статуса — «Кнопки из статуса»). */
type PanelSection = TransitionSection | 'buttons';

const SECTION_TITLE: Record<Exclude<PanelSection, 'root'>, string> = {
  roles: ui.automation.panel.sectionWhoSees,
  conditions: ui.automation.panel.sectionConditions,
  rules: ui.automation.panel.sectionRules,
  window: ui.automation.panel.sectionWindow,
  buttons: ui.automation.panel.sectionButtons,
};

const keyOf = (ref: SelectionRef) => (ref ? `${ref.kind}:${ref.id}` : null);

/**
 * Правая панель редактора (#378 ред. 2, модель Трекера): что выделено на
 * холсте — то и настраивается; у статуса и кнопки одна анатомия — поля
 * элемента, строки «›» с переходом внутрь (стек `root | раздел`, сброс к
 * корню при смене выделения), удаление внизу. На время закрытия держит
 * последнее содержимое — ширина уезжает плавно, а не пустой рамкой. Новый
 * элемент — фокус сразу в названии.
 */
export function EditorPanel({
  workflow,
  readOnly,
}: {
  workflow: WorkflowDetail;
  readOnly: boolean;
}) {
  const selection = useRouteDocStore((s) => s.selection);
  const doc = useRouteDocStore((s) => s.document);
  const freshId = useRouteDocStore((s) => s.freshId);
  const [section, setSection] = useState<PanelSection>('root');
  const [shown, setShown] = useState<SelectionRef>(selection);
  const [shownKey, setShownKey] = useState(keyOf(selection));

  // Смена выделения: раздел — к корню; закрытие — последнее содержимое
  // остаётся до конца анимации ширины (derive-during-render, без эффекта).
  const key = keyOf(selection);
  if (selection && key !== shownKey) {
    setShown(selection);
    setShownKey(key);
    setSection('root');
  }

  const stage =
    shown?.kind === 'stage' ? (doc.stages.find((s) => s.id === shown.id) ?? null) : null;
  const transition =
    shown?.kind === 'transition' ? (doc.transitions.find((t) => t.id === shown.id) ?? null) : null;
  const open = selection !== null && (stage !== null || transition !== null);

  const close = useCallback(() => useRouteDocStore.getState().select(null), []);
  const back = useCallback(() => setSection('root'), []);
  const inSection = (stage !== null || transition !== null) && section !== 'root';

  // Шапка — вид элемента или раздел; название — первое поле панели.
  const title = inSection
    ? SECTION_TITLE[section as Exclude<PanelSection, 'root'>]
    : stage
      ? ui.automation.panel.kindStage
      : ui.automation.panel.kindTransition;

  return (
    <SidePanel open={open} title={title} onClose={close} onBack={inSection ? back : undefined}>
      {stage && section === 'root' ? (
        <StagePanel
          key={stage.id}
          stage={stage}
          document={doc}
          taskCount={workflow.stageEntityCounts[stage.id] ?? 0}
          readOnly={readOnly}
          autoFocusName={freshId === stage.id}
          onOpenButtons={() => setSection('buttons')}
        />
      ) : null}
      {stage && section === 'buttons' ? (
        <StageButtonsSection stage={stage} document={doc} readOnly={readOnly} />
      ) : null}
      {transition && section === 'root' ? (
        <TransitionPanel
          key={transition.id}
          transition={transition}
          document={doc}
          readOnly={readOnly}
          autoFocusName={freshId === transition.id}
          onOpenSection={setSection}
        />
      ) : null}
      {transition && section === 'roles' ? (
        <RolesSection transition={transition} readOnly={readOnly} />
      ) : null}
      {transition && section === 'conditions' ? (
        <ConditionsSection transition={transition} readOnly={readOnly} />
      ) : null}
      {transition && section === 'rules' ? (
        <RulesSection transition={transition} document={doc} readOnly={readOnly} />
      ) : null}
      {transition && section === 'window' ? (
        <WindowSection transition={transition} document={doc} readOnly={readOnly} />
      ) : null}
    </SidePanel>
  );
}
