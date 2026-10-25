import type { ProcessType, WorkflowDetail, WorkflowDocument } from '@nodus/contracts';
import {
  ErrorCode,
  checkWorkflowDocument,
  createProcessTypeBodySchema,
  publishWorkflowBodySchema,
  saveWorkflowLayoutBodySchema,
  updateProcessTypeBodySchema,
  hasBlockingProblems,
} from '@nodus/contracts';
import { http, HttpResponse } from 'msw';

import { demoCustomFieldDefinitions } from '../../../../shared/mocks/data/custom-fields.js';
import { demoSubtasks, demoTasks } from '../../../../shared/mocks/data/tasks.js';
import {
  demoProcessTypes,
  demoWorkflowDetails,
  quickDocument,
} from '../../../../shared/mocks/data/workflows.js';
import { resolvePublishedDocument } from './publish-resolve.js';

/** Моки «Автоматизации» (#378): библиотека типов, чтение/публикация
 *  маршрутов (проверки, конфликт версий, переносы), смена типа задачи.
 *  Тела валидируются схемами contracts (мок ≠ контракту = баг). */

const mockTypes: ProcessType[] = structuredClone(demoProcessTypes);
const workflows = new Map<string, WorkflowDetail>();

function stageCountDemo(id: string): number {
  const demoCounts: Record<string, number> = {
    '20000000-0000-4000-8000-000000000001': 3,
    '20000000-0000-4000-8000-000000000003': 5,
    '20000000-0000-4000-8000-000000000004': 2,
    '20000000-0000-4000-8000-000000000005': 12,
    '20000000-0000-4000-8000-000000000006': 2,
    '20000000-0000-4000-8000-000000000007': 1,
  };
  return demoCounts[id] ?? 0;
}

for (const [id, detail] of Object.entries(demoWorkflowDetails)) {
  workflows.set(
    id,
    structuredClone({
      ...detail,
      stageEntityCounts: Object.fromEntries(
        detail.document.stages.map((s) => [s.id, stageCountDemo(s.id)]),
      ),
    }),
  );
}

const invalid = (status: number, code: keyof typeof ErrorCode, details?: unknown) =>
  HttpResponse.json({ code: ErrorCode[code], message: code, details }, { status });
const validationFailed = () =>
  HttpResponse.json(
    { code: ErrorCode.VALIDATION_FAILED, message: 'Invalid body' },
    { status: 422 },
  );
const notFound = () =>
  HttpResponse.json({ code: ErrorCode.NOT_FOUND, message: 'Not found' }, { status: 404 });

let mockSeq = 100;
const nextId = () => `40000000-0000-4000-8000-${String((mockSeq += 1)).padStart(12, '0')}`;

/** Копия маршрута с НОВЫМИ id стадий/переходов (коды — null: это не
 *  системный каталог). */
function cloneDocument(source: WorkflowDocument): WorkflowDocument {
  const remap = new Map<string, string>();
  const stages = source.stages.map((s) => {
    const id = nextId();
    remap.set(s.id, id);
    return { ...s, id, code: null };
  });
  const transitions = source.transitions.map((t) => ({
    ...t,
    id: nextId(),
    code: null,
    fromStageId: t.fromStageId ? remap.get(t.fromStageId)! : null,
    toStageId: remap.get(t.toStageId)!,
  }));
  return { stages, transitions };
}

function simpleDocument(): WorkflowDocument {
  // Архивный демо-маршрут: те же стартовые статусы и кнопки, что у «Быстрого»
  // (Ожидает → В работе → Завершена) — документ не дублирует литералы.
  return {
    stages: quickDocument.stages,
    transitions: [
      quickDocument.transitions.find((t) => t.code === 'start')!,
      quickDocument.transitions.find((t) => t.code === 'complete')!,
    ],
  };
}

function findTask(id: unknown) {
  return (
    demoTasks.find((t) => t.id === id) ??
    Object.values(demoSubtasks)
      .flat()
      .find((t) => t.id === id)
  );
}

export const automationHandlers = [
  // --- Библиотека типов -----------------------------------------------------

  http.get('/api/v1/workflows/types', ({ request }) => {
    const params = new URL(request.url).searchParams;
    const archived = params.get('archived');
    const category = params.get('category');
    const scoped = category ? mockTypes.filter((t) => t.category === category) : mockTypes;
    if (archived === 'only') return HttpResponse.json(scoped.filter((t) => t.archivedAt));
    if (archived === 'include') return HttpResponse.json(scoped);
    return HttpResponse.json(scoped.filter((t) => !t.archivedAt));
  }),

  http.post('/api/v1/workflows/types', async ({ request }) => {
    const parsed = createProcessTypeBodySchema.safeParse(await request.json());
    if (!parsed.success) return validationFailed();
    const { name, category, direction, icon, color, description, base } = parsed.data;
    if (mockTypes.some((t) => !t.archivedAt && t.name === name))
      return invalid(409, 'PROCESS_TYPE_NAME_TAKEN');
    const baseType = base.kind === 'copy' ? mockTypes.find((t) => t.id === base.typeId) : null;
    const workflowId = nextId();
    const document =
      baseType && workflows.get(baseType.workflowId)
        ? cloneDocument(workflows.get(baseType.workflowId)!.document)
        : simpleDocument();
    workflows.set(workflowId, {
      id: workflowId,
      typeIds: [],
      version: 1,
      publishedAt: null,
      publishedBy: null,
      document,
      stageEntityCounts: Object.fromEntries(document.stages.map((s) => [s.id, 0])),
    });
    const type: ProcessType = {
      id: nextId(),
      // Код генерирует сервер; в UI не показывается.
      code: `custom-${String(mockSeq)}`,
      name,
      icon,
      color,
      description: description ?? '',
      creatable: false,
      category,
      direction: direction ?? null,
      isSystem: false,
      sortOrder: mockTypes.length,
      archivedAt: null,
      workflowId,
    };
    mockTypes.push(type);
    const detail = workflows.get(workflowId)!;
    detail.typeIds = [type.id];
    return HttpResponse.json(type, { status: 201 });
  }),

  http.patch('/api/v1/workflows/types/:id', async ({ request, params }) => {
    const parsed = updateProcessTypeBodySchema.safeParse(await request.json());
    if (!parsed.success) return validationFailed();
    const type = mockTypes.find((t) => t.id === params.id);
    if (!type) return notFound();
    if (
      parsed.data.name !== undefined &&
      mockTypes.some((t) => t.id !== type.id && !t.archivedAt && t.name === parsed.data.name)
    ) {
      return invalid(409, 'PROCESS_TYPE_NAME_TAKEN');
    }
    Object.assign(type, parsed.data);
    return HttpResponse.json(type);
  }),

  http.post('/api/v1/workflows/types/:id/archive', ({ params }) => {
    const type = mockTypes.find((t) => t.id === params.id);
    if (!type) return notFound();
    if (type.isSystem) return invalid(409, 'PROCESS_TYPE_SYSTEM_LOCKED');
    type.archivedAt = new Date().toISOString();
    return HttpResponse.json(type);
  }),

  http.post('/api/v1/workflows/types/:id/restore', ({ params }) => {
    const type = mockTypes.find((t) => t.id === params.id);
    if (!type) return notFound();
    type.archivedAt = null;
    return HttpResponse.json(type);
  }),

  // --- Маршрут: чтение и публикация ----------------------------------------

  http.get('/api/v1/workflows/:id', ({ params }) => {
    const detail = workflows.get(String(params.id));
    return detail ? HttpResponse.json(structuredClone(detail)) : notFound();
  }),

  http.post('/api/v1/workflows/:id/publish', async ({ request, params }) => {
    const detail = workflows.get(String(params.id));
    if (!detail) return notFound();
    const parsed = publishWorkflowBodySchema.safeParse(await request.json());
    if (!parsed.success) return validationFailed();
    const { baseVersion, document, migrations } = parsed.data;

    if (baseVersion !== detail.version) {
      return invalid(409, 'WORKFLOW_VERSION_CONFLICT');
    }
    // Кастомные поля в окне и гейтах (#431): факты области — из реестра мока
    // (категория маршрута = область полей: task/letter).
    const scope =
      demoProcessTypes.find((type) => type.workflowId === detail.id)?.category ?? 'task';
    const facts = {
      active: new Set(
        demoCustomFieldDefinitions
          .filter((entry) => entry.scope === scope && entry.archivedAt === null)
          .map((entry) => entry.id),
      ),
      archived: new Set(
        demoCustomFieldDefinitions
          .filter((entry) => entry.scope === scope && entry.archivedAt !== null)
          .map((entry) => entry.id),
      ),
    };
    const problems = checkWorkflowDocument(document, { customFields: facts });
    if (hasBlockingProblems(problems)) {
      return invalid(422, 'WORKFLOW_INVALID', { problems });
    }
    // Архивируемые стадии с задачами требуют переноса (мок считает по
    // счётчикам документа; перенос «выполняется» мгновенно).
    const archivedWithTasks = detail.document.stages
      .filter((old) => !document.stages.some((s) => s.id === old.id))
      .map((old) => ({ stageId: old.id, count: detail.stageEntityCounts[old.id] ?? 0 }))
      .filter((row) => row.count > 0);
    if (archivedWithTasks.length > 0) {
      const covered = new Set(migrations.map((m) => m.fromStageId));
      const missing = archivedWithTasks.filter((row) => !covered.has(row.stageId));
      if (missing.length > 0) {
        return invalid(422, 'WORKFLOW_MIGRATION_REQUIRED', { stages: missing });
      }
    }

    const scheduledMoves = archivedWithTasks.reduce((sum, row) => sum + row.count, 0);
    const resolved = resolvePublishedDocument(document, migrations, nextId);
    // Счётчики: оставшиеся статусы сохраняют задачи, цели переносов — получают.
    const counts = Object.fromEntries(
      resolved.document.stages.map((s) => [s.id, detail.stageEntityCounts[s.id] ?? 0]),
    );
    for (const m of resolved.migrations) {
      counts[m.toStageId] =
        (counts[m.toStageId] ?? 0) + (detail.stageEntityCounts[m.fromStageId] ?? 0);
    }
    detail.document = resolved.document;
    detail.version += 1;
    detail.publishedAt = new Date().toISOString();
    detail.stageEntityCounts = counts;
    return HttpResponse.json({
      version: detail.version,
      publishedAt: detail.publishedAt,
      scheduledMoves,
    });
  }),

  // Расстановка холста — без новой версии; слияние по элементам, только
  // живые статусы и кнопки (как на сервере).
  http.put('/api/v1/workflows/:id/layout', async ({ request, params }) => {
    const detail = workflows.get(String(params.id));
    if (!detail) return notFound();
    const parsed = saveWorkflowLayoutBodySchema.safeParse(await request.json());
    if (!parsed.success) return validationFailed();
    const current = detail.document.layout ?? { stages: {}, transitions: {} };
    const stageIds = new Set(detail.document.stages.map((s) => s.id));
    const transitionIds = new Set(detail.document.transitions.map((t) => t.id));
    const merged = {
      stages: Object.fromEntries(
        Object.entries({ ...current.stages, ...parsed.data.layout.stages }).filter(([id]) =>
          stageIds.has(id),
        ),
      ),
      transitions: Object.fromEntries(
        Object.entries({ ...current.transitions, ...parsed.data.layout.transitions }).filter(
          ([id]) => transitionIds.has(id),
        ),
      ),
    };
    detail.document = { ...detail.document, layout: merged };
    return HttpResponse.json({ layout: merged });
  }),

  // --- Смена типа задачи ----------------------------------------------------

  http.post('/api/v1/tasks/:id/type', async ({ request, params }) => {
    const body = (await request.json()) as { typeId?: string; stageId?: string };
    const task = findTask(params.id);
    const type = mockTypes.find((t) => t.id === body.typeId);
    if (!task || !type) return notFound();
    const detail = workflows.get(type.workflowId);
    if (!detail) return notFound();
    // Как сервер: тот же статус есть в новом маршруте — остаётся; иначе
    // stageId обязателен (422 WORKFLOW_MIGRATION_REQUIRED).
    const stages = detail.document.stages;
    const stageDoc =
      stages.find((s) => s.id === task.stage.id) ?? stages.find((s) => s.id === body.stageId);
    if (!stageDoc) {
      return HttpResponse.json(
        { code: ErrorCode.WORKFLOW_MIGRATION_REQUIRED, message: 'stageId is required' },
        { status: 422 },
      );
    }
    task.type = { id: type.id, code: type.code, name: type.name, category: type.category };
    task.stage = {
      id: stageDoc.id,
      name: stageDoc.name,
      order: stageDoc.sortOrder,
      systemState: stageDoc.systemState,
      color: stageDoc.color,
    };
    // Контракт POST /tasks/:id/type — строка задачи (TaskListItem).
    return HttpResponse.json(task);
  }),
];
