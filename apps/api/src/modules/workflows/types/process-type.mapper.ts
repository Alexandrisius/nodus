import type {
  LetterDirection,
  ProcessCategory,
  ProcessType,
  ProcessTypeIcon,
  StageColor,
} from '@nodus/contracts';
import {
  effectiveCreationForm,
  normalizeTypeConfig,
  typeAccessFor,
  type TypeAccessSubject,
} from '@nodus/contracts';

/** Строка `process_types` в объёме DTO (поля — ADR-0024, #378/#432). */
export interface ProcessTypeRow {
  id: string;
  code: string;
  name: string;
  category: string;
  direction: string | null;
  icon: string;
  color: string;
  description: string;
  creatable: boolean;
  isSystem: boolean;
  sortOrder: number;
  archivedAt: Date | null;
  /** Конфигурация типа (#432): состав карточки и доступ; `{}` — умолчания. */
  config: unknown;
}

/**
 * Строка `process_types` → DTO контракта (+ маршрут из схемы по умолчанию).
 * `creation` — опубликованная форма создания маршрута (#432); без неё форма
 * по умолчанию. `subject` — роли смотрящего: `viewer` считает `typeAccessFor`
 * (одна функция с вебом и моками); без субъекта (внутренние вызовы, где
 * доступ уже проверен) тип считается видимым и создаваемым по `creatable`.
 */
export function processTypeDto(
  row: ProcessTypeRow,
  workflowId: string,
  opts: { creation?: unknown; subject?: TypeAccessSubject } = {},
): ProcessType {
  const category = row.category as ProcessCategory;
  const config = normalizeTypeConfig(row.config);
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category,
    direction: (row.direction as LetterDirection | null) ?? null,
    icon: row.icon as ProcessTypeIcon,
    color: row.color as StageColor,
    description: row.description,
    creatable: row.creatable,
    isSystem: row.isSystem,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    workflowId,
    config,
    creationForm: effectiveCreationForm(opts.creation, category),
    viewer: opts.subject
      ? typeAccessFor({ config, creatable: row.creatable }, opts.subject)
      : { canView: true, canCreate: row.creatable },
  };
}
