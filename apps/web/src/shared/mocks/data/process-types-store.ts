import type { CreationForm, ProcessType } from '@nodus/contracts';
import { effectiveCreationForm } from '@nodus/contracts';

import { demoProcessTypes } from './workflows.js';
import { mockWorkflows } from './workflows-store.js';

/** Состояние мок-библиотеки типов процессов (#378, #432): изменяемая копия
 *  демо-типов и эффективная форма создания. Без актёра — DTO под зрителя
 *  собирает `process-types-dto.ts` (разрыв цикла данных и прав). */

export type DemoProcessType = Omit<ProcessType, 'viewer' | 'creationForm'>;

export const mockTypes: DemoProcessType[] = structuredClone(demoProcessTypes);

let mockSeq = 100;
export const nextId = () => `40000000-0000-4000-8000-${String((mockSeq += 1)).padStart(12, '0')}`;

/** Эффективная форма создания типа: опубликованная или по умолчанию (Р2). */
export function creationFormOf(type: DemoProcessType): CreationForm {
  return effectiveCreationForm(
    mockWorkflows.get(type.workflowId)?.document.creation,
    type.category,
  );
}
