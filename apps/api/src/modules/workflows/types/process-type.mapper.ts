import type {
  LetterDirection,
  ProcessCategory,
  ProcessType,
  ProcessTypeIcon,
  StageColor,
} from '@nodus/contracts';

/** Строка `process_types` → DTO контракта (+ маршрут из схемы по умолчанию). */
export function processTypeDto(
  row: {
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
  },
  workflowId: string,
): ProcessType {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category as ProcessCategory,
    direction: (row.direction as LetterDirection | null) ?? null,
    icon: row.icon as ProcessTypeIcon,
    color: row.color as StageColor,
    description: row.description,
    creatable: row.creatable,
    isSystem: row.isSystem,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    workflowId,
  };
}
