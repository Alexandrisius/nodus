import type { LetterDetail } from '@nodus/contracts';
import { ui } from '@nodus/contracts';

import { useLetterTypes } from '../../api/letters-queries.js';
import { numberPreview } from '../../lib/letter-format.js';
import {
  missingFields,
  registrationFieldLabel,
  type RegistrationDraft,
} from '../../lib/registration-draft.js';

/** Итог формы под полями (#55): «Не хватает: …» по порядку формы и
 *  «Будет присвоен номер Вх-2026/…» — точный номер выдаст сервер. */
export function RegistrationSummary({
  letter,
  draft,
}: {
  letter: LetterDetail;
  draft: RegistrationDraft;
}) {
  const { data: types } = useLetterTypes();
  const prefix = types?.find((type) => type.id === letter.typeId)?.numbering?.prefix;
  const missing = missingFields(draft);

  return (
    <div className="flex flex-col gap-1 text-xs">
      {missing.length > 0 ? (
        <p className="text-muted-foreground" aria-live="polite">
          <span className="font-medium text-foreground">{ui.letters.pipeline.missing}</span>{' '}
          {missing.map((field) => registrationFieldLabel[field]).join(', ')}
        </p>
      ) : null}
      {prefix ? (
        <p className="text-muted-foreground">
          {ui.letters.pipeline.willAssign}{' '}
          <span className="font-mono text-foreground tabular-nums">{numberPreview(prefix)}</span>
        </p>
      ) : null}
    </div>
  );
}
