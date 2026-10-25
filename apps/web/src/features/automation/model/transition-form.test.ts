import { describe, expect, it } from 'vitest';
import { ui, type WorkflowDraftTransition } from '@nodus/contracts';

import {
  hasFilesSection,
  sectionOf,
  setLabel,
  setRequired,
  setTimeMode,
  setWindowEnabled,
  setWindowTitle,
  toggleSection,
  toggleWindowField,
} from './transition-form.js';

const empty: WorkflowDraftTransition['form'] = { enabled: false, sections: [] };

describe('правки окна в редакторе (#380)', () => {
  it('тумблер и заголовок (пустой — по умолчанию название кнопки)', () => {
    expect(setWindowEnabled(empty, true)).toMatchObject({ enabled: true });
    expect(setWindowTitle(empty, 'Завершение').title).toBe('Завершение');
    expect(setWindowTitle(empty, '   ').title).toBeUndefined();
    expect(setWindowTitle(empty, 'я'.repeat(70)).title).toHaveLength(60);
  });

  it('раздел включается с осмысленными значениями и в фиксированном порядке', () => {
    let form = toggleSection(empty, 'comment');
    form = toggleSection(form, 'result');
    form = toggleSection(form, 'fields');
    expect(form.sections.map((s) => s.kind)).toEqual(['fields', 'result', 'comment']);
    expect(sectionOf(form, 'comment')).toMatchObject({
      label: ui.automation.window.sections.comment,
      required: true,
    });
    expect(sectionOf(form, 'fields')).toMatchObject({ fields: ['deadline'] });
    expect(toggleSection(form, 'result').sections.map((s) => s.kind)).toEqual([
      'fields',
      'comment',
    ]);
  });

  it('подписи и обязательность причины/сообщений', () => {
    let form = toggleSection(empty, 'comment');
    form = setLabel(form, 'comment', 'Причина отмены');
    form = setRequired(form, 'comment', false);
    expect(sectionOf(form, 'comment')).toMatchObject({
      label: 'Причина отмены',
      required: false,
    });
  });

  it('поля: последнее не снимается, порядок — канон окна', () => {
    let form = toggleSection(empty, 'fields');
    form = toggleWindowField(form, 'assignee');
    form = toggleWindowField(form, 'deadline');
    expect(sectionOf(form, 'fields')?.fields).toEqual(['assignee']);
    expect(toggleWindowField(form, 'assignee')).toEqual(form);
  });

  it('режим трудозатрат и наличие раздела файлов', () => {
    let form = toggleSection(empty, 'time');
    expect(sectionOf(form, 'time')?.mode).toBe('if_empty');
    form = setTimeMode(form, 'always');
    expect(sectionOf(form, 'time')?.mode).toBe('always');
    expect(hasFilesSection(form)).toBe(false);
    expect(hasFilesSection(toggleSection(form, 'result_files'))).toBe(true);
  });
});
