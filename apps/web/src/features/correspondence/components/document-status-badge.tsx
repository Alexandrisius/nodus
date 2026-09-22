import type { LetterListItem } from '@nodus/contracts';
import { ui } from '@nodus/contracts';
import { NodeChip } from '@nodus/ui/components/node-chip';

import { documentStateOf, type DocumentState } from '../lib/letter-document.js';

const stateTone: Record<DocumentState, 'muted' | 'info' | 'success' | 'danger'> = {
  in_work: 'info',
  overdue: 'danger',
  executed: 'success',
  archived: 'muted',
};

const stateLabel: Record<DocumentState, string> = {
  in_work: ui.letters.documentStatus.in_work,
  overdue: ui.letters.overdue,
  executed: ui.letters.documentStatus.executed,
  archived: ui.letters.documentStatus.archived,
};

/** Статус ДОКУМЕНТА (у письма без регистрации статуса нет — null):
 *  в работе / просрочено (производное) / исполнено / в деле. */
export function DocumentStatusBadge({ letter }: { letter: LetterListItem }) {
  const state = documentStateOf(letter);
  if (!state) return null;
  return <NodeChip tone={stateTone[state]}>{stateLabel[state]}</NodeChip>;
}
