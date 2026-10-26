import {
  customFieldKey,
  effectiveWindowSections,
  requiredWindowSections,
  transitionFormSchema,
  type EffectiveSection,
  type TransitionForm,
  type TransitionFormInput,
} from '@nodus/contracts';

import type { WorkflowTransitionRules } from '@nodus/contracts';

/**
 * Окно перехода на сервере (#380): разбор формы из БД и сверка введённого
 * с эффективным окном. Неизвестный вид раздела — ошибка (закрытый реестр
 * ADR-0020: правило в данных без исполнителя в коде — ложная безопасность).
 */

/** Разбор формы из БД: `{}` → выключенное окно. */
export function parseForm(raw: unknown): TransitionForm {
  return transitionFormSchema.parse(raw ?? {});
}

export interface FormInputCheck {
  /** Пропущенные обязательные разделы/ключи (коды контракта). */
  missing: string[];
  /** Введено то, чего нет в эффективном окне. */
  unexpected: string[];
}

const FIELD_KEYS = {
  description: 'description',
  deadline: 'deadline',
  assigneeId: 'assignee',
  plannedMinutes: 'plannedMinutes',
} satisfies Partial<Record<keyof NonNullable<TransitionFormInput['fields']>, string>>;

/** Разрешённое и обязательное содержимое окна по эффективным разделам. */
export function checkFormInput(
  sections: readonly EffectiveSection[],
  input: TransitionFormInput,
): FormInputCheck {
  const allowed = new Set<string>();
  const missing: string[] = [];

  for (const section of sections) {
    switch (section.kind) {
      // Раздел «Регистрация» (#55): содержимое проверяет адаптер письма —
      // движок лишь требует сам объект и не пускает ключ в чужие окна.
      case 'registration':
        allowed.add('registration');
        if (!input.registration) missing.push('registration');
        break;
      case 'fields':
        for (const field of section.fields) allowed.add(`fields.${field}`);
        break;
      case 'time':
        allowed.add('time');
        break;
      case 'result':
      case 'result_files':
        allowed.add('result');
        allowed.add('result.text');
        allowed.add('result.messageIds');
        break;
      case 'result_messages':
        allowed.add('result');
        allowed.add('result.text');
        allowed.add('result.messageIds');
        if (section.required && (input.result?.messageIds.length ?? 0) === 0) {
          missing.push('result_messages');
        }
        break;
      case 'comment':
        allowed.add('comment');
        if (section.required && !input.comment?.trim()) missing.push('comment');
        break;
    }
  }

  const unexpected: string[] = [];
  if (input.fields) {
    for (const key of Object.keys(input.fields)) {
      // Значения кастомных атрибутов (#431, Р7): клиент шлёт их вложенной
      // картой `fields.customFields.<id>`, окно и гейт адресуют ключом
      // `cf.<id>` — сверяем по приведённому ключу.
      if (key === 'customFields') {
        for (const fieldId of Object.keys(input.fields.customFields ?? {})) {
          if (!allowed.has(`fields.${customFieldKey(fieldId)}`)) {
            unexpected.push(`fields.customFields.${fieldId}`);
          }
        }
        continue;
      }
      const mapped = FIELD_KEYS[key as keyof typeof FIELD_KEYS];
      if (!mapped || !allowed.has(`fields.${mapped}`)) unexpected.push(`fields.${key}`);
    }
  }
  if (input.time && !allowed.has('time')) unexpected.push('time');
  if (input.result && !allowed.has('result')) unexpected.push('result');
  if (input.comment && !allowed.has('comment')) unexpected.push('comment');
  if (input.registration && !allowed.has('registration')) unexpected.push('registration');

  return { missing, unexpected };
}

/** Эффективные разделы кнопки + обязательные (для 422 на DnD без формы). */
export function windowOf(
  form: TransitionForm | null | undefined,
  rules: Pick<WorkflowTransitionRules, 'validators'>,
): { sections: EffectiveSection[]; required: string[] } {
  const sections = effectiveWindowSections(form?.enabled ? form : null, rules);
  return { sections, required: requiredWindowSections(sections) };
}
