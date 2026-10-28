import { useState } from 'react';
import type { LetterDetail, LetterRegistrationField } from '@nodus/contracts';

import type { WindowSectionControl } from '../../../../shared/workflow/transition-window/window-sections.js';
import { useReceiptMethods } from '../../api/letters-queries.js';
import { todayIso } from '../../lib/letter-format.js';
import {
  defaultReceiptMethodId,
  draftIssues,
  initialDraft,
  registrationInputOf,
  registrationReasonText,
  type RegistrationDraft,
} from '../../lib/registration-draft.js';
import { MainDocumentSection } from './main-document-section.js';
import { RegistrationFields } from './registration-fields.js';
import { RegistrationSummary } from './registration-summary.js';

/**
 * Раздел «Регистрация» окна перехода карточки (#55, Р1): та же форма, что
 * в конвейере; окно получает только валидный ввод (`ctl.setRegistration`) —
 * главная кнопка окна активна, когда форма готова. Ошибка сервера (422)
 * подсвечивает поле.
 */
export function RegistrationSection({
  letter,
  ctl,
  serverIssue,
}: {
  letter: LetterDetail;
  ctl: WindowSectionControl;
  serverIssue: { field: string; reason: string } | null;
}) {
  const { data: methods = [] } = useReceiptMethods();
  const [draft, setDraft] = useState<RegistrationDraft>(() => initialDraft(letter, methods));
  // Справочник мог прийти позже черновика — умолчание способа по источнику (Р14).
  const value =
    draft.receiptMethodId === null && methods.length > 0
      ? { ...draft, receiptMethodId: defaultReceiptMethodId(letter.source, methods) }
      : draft;

  // Рамки полей — только ПОСЛЕ попытки регистрации (сервер вернул 422):
  // до попытки обязательность несут звёздочки, поля спокойны (28.10).
  const attempted = serverIssue !== null;
  const invalidKeys: Partial<Record<LetterRegistrationField, string>> = {};
  if (attempted) {
    for (const issue of draftIssues(value, todayIso())) {
      invalidKeys[issue.field] = registrationReasonText[issue.reason];
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <RegistrationFields
        letter={letter}
        value={value}
        invalidKeys={invalidKeys}
        autoFocus
        onChange={(next) => {
          setDraft(next);
          ctl.setRegistration(registrationInputOf(next, todayIso()));
        }}
      />
      <MainDocumentSection letter={letter} />
      <RegistrationSummary letter={letter} />
    </div>
  );
}
