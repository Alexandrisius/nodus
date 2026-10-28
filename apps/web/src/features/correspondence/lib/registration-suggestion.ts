import { useEffect, useRef } from 'react';
import type { LetterDetail } from '@nodus/contracts';

import { useCounterpartyCard } from '../../../shared/counterparties/queries.js';
import type { RegistrationDraft } from './registration-draft.js';

/**
 * Подстановка контрагента и подписанта по адресу отправителя (#56, Р6, В2):
 * ровно один активный контакт справочника с адресом письма. Карточка
 * справочника догружается после монтирования формы — заполняем ПУСТЫЕ поля
 * один раз; выбор Вики (в т.ч. очистка) не перетирается.
 */
export function useSuggestedCounterparty(
  letter: LetterDetail,
  value: RegistrationDraft,
  onChange: (next: RegistrationDraft) => void,
): { suggestion: LetterDetail['counterpartySuggestion']; fromSuggestion: boolean } {
  const suggestion = letter.counterpartySuggestion;
  const { data: suggestedCard } = useCounterpartyCard(suggestion?.counterpartyId ?? '');
  const prefilled = useRef(false);

  useEffect(() => {
    if (prefilled.current || !suggestion || !suggestedCard || value.counterparty) {
      if (value.counterparty) prefilled.current = true;
      return;
    }
    prefilled.current = true;
    const person = suggestedCard.contactPersons.find((p) => p.id === suggestion.signerId);
    onChange({
      ...value,
      counterparty: { id: suggestedCard.id, name: suggestedCard.shortName },
      signer:
        person && !person.archivedAt
          ? { id: person.id, fullName: person.fullName, position: person.position }
          : value.signer,
    });
  }, [suggestion, suggestedCard, value, onChange]);

  return {
    suggestion,
    fromSuggestion:
      Boolean(suggestion) &&
      value.counterparty?.id === suggestion?.counterpartyId &&
      letter.counterparty === null,
  };
}
