import { describe, expect, it } from 'vitest';
import type { EffectiveSection } from '@nodus/contracts';

import { buildExecuteBody } from './build-execute-body.js';
import { emptyDraft, type WindowDraft } from './use-window-draft.js';
import type { TransitionWindowContext } from './window-context.js';

const context: TransitionWindowContext = {
  entityId: 't1',
  conversationId: 'c1',
  currentStageName: 'В работе',
  fields: {
    description: 'Старое',
    deadline: '2026-10-30T10:00:00.000Z',
    assigneeId: 'bob',
    plannedMinutes: 60,
  },
  spentMinutes: 0,
  lastResult: { text: 'Прошлый итог', messageIds: ['m-old'] },
  access: { canEdit: true, canLogTime: true, canCheck: true },
  submission: null,
  scope: 'entity',
};

const draft = (patch: Partial<WindowDraft> = {}): WindowDraft => ({
  ...emptyDraft(context),
  ...patch,
});

const sections = (...kinds: EffectiveSection[]): EffectiveSection[] => kinds;

describe('buildExecuteBody (#380)', () => {
  it('отправляет только изменённые поля и не дублирует неизменённый итог', () => {
    const body = buildExecuteBody({
      sections: sections({ kind: 'fields', fields: ['description', 'deadline'], origin: 'form' }),
      context,
      draft: draft({
        fields: {
          ...context.fields,
          description: 'Новое',
          deadline: '2026-11-01T10:00:00.000Z',
        },
      }),
    });
    expect(body).toEqual({
      form: {
        fields: { description: 'Новое', deadline: '2026-11-01T10:00:00.000Z' },
      },
    });
  });

  it('без раздела «Итог» текст берётся из прежней ревизии, переносятся её сообщения', () => {
    const body = buildExecuteBody({
      sections: sections({ kind: 'result_files', label: 'Акт', origin: 'form' }),
      context,
      draft: draft({ resultText: 'игнор', files: ['m-new'] }),
    });
    expect(body.form?.result).toEqual({
      text: 'Прошлый итог',
      messageIds: ['m-old', 'm-new'],
    });
  });

  it('итог не менялся — не отправляется; пустое тело — {}', () => {
    const body = buildExecuteBody({
      sections: sections({ kind: 'result', origin: 'form' }),
      context,
      draft: draft({ resultText: 'Прошлый итог' }),
    });
    expect(body).toEqual({});
  });

  it('время: режим if_empty при уже списанных минутах не отправляется', () => {
    const body = buildExecuteBody({
      sections: sections({ kind: 'time', mode: 'if_empty', origin: 'form' }),
      context: { ...context, spentMinutes: 30 },
      draft: draft({ time: { amount: '1ч', comment: '', daysAgo: 0 } }),
    });
    expect(body).toEqual({});
  });

  it('причина и время уходят; пустая причина — нет', () => {
    const body = buildExecuteBody({
      sections: sections(
        { kind: 'time', mode: 'always', origin: 'form' },
        { kind: 'comment', label: 'Причина', required: true, origin: 'form' },
      ),
      context,
      draft: draft({ time: { amount: '45м', comment: '', daysAgo: 0 }, comment: '  ' }),
    });
    expect(body.form?.time?.minutes).toBe(45);
    expect(body.form?.comment).toBeUndefined();
  });
});
