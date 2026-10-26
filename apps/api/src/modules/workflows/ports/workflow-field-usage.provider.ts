import { Injectable } from '@nestjs/common';
import type { CustomFieldScope } from '@nodus/contracts';
import { customFieldKey } from '@nodus/contracts';

import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../core/database/prisma.service.js';
import type { WorkflowFieldUsage, WorkflowFieldUsageReader } from './workflow-field-usage.port.js';

/**
 * Реализация порта использования атрибута в процессах (#431): ищет ключ
 * `cf.<uuid>` в ОПУБЛИКОВАННЫХ документах маршрутов области — в разделах
 * окна перехода (`form.sections[kind=fields].fields`) и в валидаторах
 * «Заполнены поля» (`rules.validators[kind=fields_required].fields`).
 *
 * Черновик маршрута удаление не блокирует: публикация с неизвестным полем
 * даёт блокирующую ошибку `custom_field_unknown` (Р7) — это и есть защита
 * черновика. Оператор `?` jsonb проверяет наличие элемента массива, поэтому
 * сравнение идёт по точному ключу, без LIKE по тексту документа.
 */
@Injectable()
export class WorkflowFieldUsageProvider implements WorkflowFieldUsageReader {
  constructor(private readonly prisma: PrismaService) {}

  async workflowsUsingField(
    scope: CustomFieldScope,
    fieldId: string,
    opts: { typeId?: string } = {},
  ): Promise<WorkflowFieldUsage[]> {
    // Маршруты есть только у задач и писем (ADR-0024); прочие области — пусто.
    if (scope !== 'task' && scope !== 'letter') return [];
    const key = customFieldKey(fieldId);
    return this.prisma.$queryRaw<WorkflowFieldUsage[]>(Prisma.sql`
      SELECT DISTINCT w.id, COALESCE(pt.name, w.name) AS name
      FROM workflows w
      JOIN workflow_transitions t
        ON t.workflow_id = w.id AND t.archived_at IS NULL
      LEFT JOIN workflow_scheme_entries se ON se.workflow_id = w.id
      LEFT JOIN process_types pt ON pt.id = se.process_type_id
      WHERE w.kind = ${scope}
        AND w.published_at IS NOT NULL
        ${opts.typeId ? Prisma.sql`AND se.process_type_id = ${opts.typeId}::uuid` : Prisma.empty}
        AND (
          EXISTS (
            SELECT 1 FROM jsonb_array_elements(COALESCE(t.form->'sections', '[]'::jsonb)) s
            WHERE t.form->>'enabled' = 'true'
              AND s->>'kind' = 'fields'
              AND s->'fields' ? ${key}
          )
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(COALESCE(t.rules->'validators', '[]'::jsonb)) v
            WHERE v->>'kind' = 'fields_required'
              AND v->'fields' ? ${key}
          )
        )
      UNION
      -- Форма создания (#432): атрибут стоит в окне узла «Создание».
      SELECT DISTINCT w.id, COALESCE(pt.name, w.name) AS name
      FROM workflows w
      JOIN workflow_scheme_entries se ON se.workflow_id = w.id
      JOIN process_types pt ON pt.id = se.process_type_id
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(w.creation->'fields', '[]'::jsonb)) f
      WHERE w.kind = ${scope}
        AND w.published_at IS NOT NULL
        ${opts.typeId ? Prisma.sql`AND se.process_type_id = ${opts.typeId}::uuid` : Prisma.empty}
        AND f->>'key' = ${key}
      ORDER BY name
    `);
  }
}
