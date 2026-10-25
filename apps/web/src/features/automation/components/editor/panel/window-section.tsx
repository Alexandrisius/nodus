import { useState } from 'react';
import type { WorkflowDraftDocument, WorkflowDraftTransition } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { Button } from '@nodus/ui/components/button';
import { Checkbox } from '@nodus/ui/components/checkbox';
import { Input } from '@nodus/ui/components/input';

import { useRouteDocStore } from '../../../model/route-doc-store.js';
import {
  WINDOW_FIELDS,
  sectionOf,
  setLabel,
  setRequired,
  setTimeMode,
  setWindowEnabled,
  setWindowTitle,
  toggleSection,
  toggleWindowField,
} from '../../../model/transition-form.js';
import { setMinFiles, validatorOf } from '../../../model/transition-rules.js';
import { TransitionWindow } from '../../../../../shared/workflow/transition-window/transition-window.js';
import { PanelField, SwitchRow } from './panel-kit.js';
import {
  GateCheck,
  ModeChoices,
  RequiredCheck,
  SectionToggle,
  previewTransition,
} from './window-section-rows.js';

/**
 * Раздел «Окно при нажатии» инспектора кнопки (#380): тумблер окна,
 * заголовок, шесть разделов в фиксированном порядке. «Обязательно» у
 * времени/итога/файлов правит ГЕЙТЫ (Р3: обязательность — только
 * валидаторы), у причины и сообщений — собственную настройку раздела.
 */
export function WindowSection({
  transition,
  document: doc,
  readOnly,
}: {
  transition: WorkflowDraftTransition;
  document: WorkflowDraftDocument;
  readOnly: boolean;
}) {
  const form = transition.form;
  const [previewOpen, setPreviewOpen] = useState(false);
  const patch = (next: Partial<WorkflowDraftTransition['form']>) =>
    useRouteDocStore.getState().patchTransition(transition.id, { form: { ...form, ...next } });
  const toggle = (kind: Parameters<typeof toggleSection>[1]) => patch(toggleSection(form, kind));

  return (
    <>
      <SwitchRow
        title={ui.automation.window.enable}
        hint={ui.automation.window.titleHint}
        checked={form.enabled}
        disabled={readOnly}
        onChange={(checked) => patch(setWindowEnabled(form, checked))}
      />
      {form.enabled ? (
        <>
          <PanelField label={ui.automation.window.titleLabel} hint={ui.automation.window.titleHint}>
            <Input
              value={form.title ?? ''}
              maxLength={60}
              readOnly={readOnly}
              placeholder={transition.name || ui.automation.window.titlePlaceholder}
              onChange={(e) => patch(setWindowTitle(form, e.target.value))}
            />
          </PanelField>

          <SectionToggle
            kind="fields"
            transition={transition}
            readOnly={readOnly}
            onToggle={() => toggle('fields')}
          >
            <div className="flex flex-col gap-1.5">
              {WINDOW_FIELDS.map((field) => {
                const section = sectionOf(form, 'fields');
                const checked = section?.fields.includes(field) ?? false;
                return (
                  <label key={field} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={checked}
                      disabled={readOnly || (checked && (section?.fields.length ?? 0) === 1)}
                      onCheckedChange={() => patch(toggleWindowField(form, field))}
                    />
                    {ui.automation.requirableFields[field]}
                  </label>
                );
              })}
              <p className="text-xs text-muted-foreground">{ui.automation.window.fieldsHint}</p>
            </div>
          </SectionToggle>

          <SectionToggle
            kind="time"
            transition={transition}
            readOnly={readOnly}
            onToggle={() => toggle('time')}
          >
            <div className="flex flex-col gap-2">
              <ModeChoices
                value={sectionOf(form, 'time')?.mode ?? 'if_empty'}
                disabled={readOnly}
                options={[
                  {
                    value: 'if_empty',
                    label: ui.automation.window.modeIfEmpty,
                    hint: ui.automation.window.modeIfEmptyHint,
                  },
                  {
                    value: 'always',
                    label: ui.automation.window.modeAlways,
                    hint: ui.automation.window.modeAlwaysHint,
                  },
                ]}
                onChange={(mode) => patch(setTimeMode(form, mode))}
              />
              <GateCheck transition={transition} kind="time_logged" disabled={readOnly} />
            </div>
          </SectionToggle>

          <SectionToggle
            kind="result"
            transition={transition}
            readOnly={readOnly}
            onToggle={() => toggle('result')}
          >
            <GateCheck transition={transition} kind="result_present" disabled={readOnly} />
          </SectionToggle>

          <SectionToggle
            kind="result_files"
            transition={transition}
            readOnly={readOnly}
            onToggle={() => toggle('result_files')}
          >
            <div className="flex flex-col gap-2">
              <PanelField label={ui.automation.window.label}>
                <Input
                  value={sectionOf(form, 'result_files')?.label ?? ''}
                  maxLength={60}
                  readOnly={readOnly}
                  placeholder={ui.automation.window.labelPlaceholder}
                  onChange={(e) => patch(setLabel(form, 'result_files', e.target.value))}
                />
              </PanelField>
              <PanelField
                label={ui.automation.window.minFiles}
                hint={ui.automation.window.filesHint}
              >
                <Input
                  type="number"
                  min={0}
                  max={5}
                  value={validatorOf(transition.rules, 'result_files')?.min ?? 0}
                  readOnly={readOnly}
                  aria-label={ui.automation.window.minFiles}
                  onChange={(e) =>
                    useRouteDocStore.getState().patchTransition(transition.id, {
                      rules: setMinFiles(transition.rules, Number(e.target.value)),
                    })
                  }
                />
              </PanelField>
            </div>
          </SectionToggle>

          <SectionToggle
            kind="result_messages"
            transition={transition}
            readOnly={readOnly}
            onToggle={() => toggle('result_messages')}
          >
            <RequiredCheck
              checked={sectionOf(form, 'result_messages')?.required ?? false}
              disabled={readOnly}
              onChange={(checked) => patch(setRequired(form, 'result_messages', checked))}
            />
          </SectionToggle>

          <SectionToggle
            kind="comment"
            transition={transition}
            readOnly={readOnly}
            onToggle={() => toggle('comment')}
          >
            <div className="flex flex-col gap-2">
              <PanelField label={ui.automation.window.label}>
                <Input
                  value={sectionOf(form, 'comment')?.label ?? ''}
                  maxLength={60}
                  readOnly={readOnly}
                  placeholder={ui.automation.window.labelPlaceholder}
                  onChange={(e) => patch(setLabel(form, 'comment', e.target.value))}
                />
              </PanelField>
              <RequiredCheck
                checked={sectionOf(form, 'comment')?.required ?? false}
                disabled={readOnly}
                onChange={(checked) => patch(setRequired(form, 'comment', checked))}
              />
              <p className="text-xs text-muted-foreground">{ui.automation.window.commentHint}</p>
            </div>
          </SectionToggle>

          <Button type="button" variant="outline" onClick={() => setPreviewOpen(true)}>
            {ui.automation.window.preview}
          </Button>
          <TransitionWindow
            open={previewOpen}
            mode="preview"
            transition={previewTransition(transition, doc)}
            context={null}
            onCancel={() => setPreviewOpen(false)}
            onSubmit={() => {}}
          />
        </>
      ) : null}
    </>
  );
}
