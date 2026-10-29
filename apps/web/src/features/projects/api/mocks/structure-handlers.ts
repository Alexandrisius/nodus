import { http, HttpResponse } from 'msw';
import {
  ErrorCode,
  NODE_LIMITS,
  Permission,
  batchCreateProjectNodesBodySchema,
  createProjectNodeBodySchema,
  moveProjectNodeBodySchema,
  nodeLevelCreateBodySchema,
  nodeLevelUpdateBodySchema,
  updateProjectNodeBodySchema,
  type NodeLevel,
  type ProjectNode,
} from '@nodus/contracts';

import { getMockActor } from '../../../../shared/mocks/mock-actor.js';
import {
  accessOf,
  canSeeProject,
  myMembershipOf,
} from '../../../../shared/mocks/data/project-views.js';
import { findDemoProjectRow } from '../../../../shared/mocks/data/projects.js';
import {
  childNodeRows,
  demoNodeLevels,
  demoNodeRows,
  descendantIdsOf,
  directTasksOf,
  findDemoNodeRow,
  nodeCodeTaken,
  nodeDepthOf,
  nodesOfProject,
  projectNodeDto,
  type DemoNodeRow,
} from '../../../../shared/mocks/data/project-nodes.js';

/** Моки структуры проекта (#467): дерево узлов демо-мира и справочник видов
 *  уровней. Узлы БЕЗ архивации: пустой удаляется, непустой — 409. Регистрация
 *  в projects-handlers ДО projectReadHandlers: буквальный /projects/node-levels
 *  иначе уйдёт в параметрический /projects/:id (gotcha порядка MSW). */

const invalid = () =>
  HttpResponse.json(
    { code: ErrorCode.VALIDATION_FAILED, message: 'Invalid body' },
    { status: 422 },
  );
const forbidden = () =>
  HttpResponse.json({ code: ErrorCode.FORBIDDEN, message: 'Forbidden' }, { status: 403 });
const nodeNotFound = () =>
  HttpResponse.json({ code: ErrorCode.NOT_FOUND, message: 'Node not found' }, { status: 404 });
const conflict = (code: ErrorCode, message: string) =>
  HttpResponse.json({ code, message }, { status: 409 });

/** Проект + право управления структурой (руководитель/помощник/manage);
 *  строковый вердикт сужается typeof — без объектных union. */
function manageableProject(id: string): 'forbidden' | 'notfound' | DemoProjectRowGuard {
  const actor = getMockActor();
  const row = findDemoProjectRow(id);
  if (!row || !canSeeProject(row, actor)) return 'notfound';
  return accessOf(row, myMembershipOf(row.id, actor.id), actor.permissions).canManage
    ? { row }
    : 'forbidden';
}
type DemoProjectRowGuard = { row: NonNullable<ReturnType<typeof findDemoProjectRow>> };

function guardResponse(verdict: 'forbidden' | 'notfound') {
  return verdict === 'forbidden' ? forbidden() : nodeNotFound();
}

/** Родитель узла: null (корень) или узел этого же проекта. */
function checkedParent(projectId: string, parentId: string | null | undefined) {
  if (parentId === undefined || parentId === null) return { parent: null };
  const parent = findDemoNodeRow(parentId);
  if (!parent || parent.projectId !== projectId) return 'notfound';
  return { parent };
}

function levelOf(levelId: string): NodeLevel | undefined {
  return demoNodeLevels.find((level) => level.id === levelId);
}

/** Лимит глубины с учётом высоты переносимого поддерева. */
function subtreeHeight(row: DemoNodeRow): number {
  const children = demoNodeRows.filter((entry) => entry.parentId === row.id);
  return 1 + Math.max(0, ...children.map(subtreeHeight));
}

function appendNode(
  projectId: string,
  parentId: string | null,
  levelId: string,
  name: string,
  code: string | null,
): DemoNodeRow {
  const row: DemoNodeRow = {
    id: crypto.randomUUID(),
    projectId,
    parentId,
    levelId,
    name,
    code,
    createdAt: new Date().toISOString(),
  };
  demoNodeRows.push(row);
  return row;
}

export const structureHandlers = [
  // ===== Виды уровней (справочник «Автоматизации», право project.setup.manage) =====

  http.get('/api/v1/projects/node-levels', ({ request }) => {
    const includeArchived = new URL(request.url).searchParams.get('includeArchived') === 'true';
    return HttpResponse.json(
      demoNodeLevels.filter((level) => includeArchived || level.archivedAt === null),
    );
  }),

  http.post('/api/v1/projects/node-levels', async ({ request }) => {
    if (!getMockActor().permissions.includes(Permission.PROJECT_SETUP_MANAGE)) return forbidden();
    const parsed = nodeLevelCreateBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return invalid();
    const key = (name: string) => name.trim().toLowerCase();
    if (demoNodeLevels.some((level) => key(level.name) === key(parsed.data.name))) {
      return conflict(ErrorCode.PROJECT_NODE_LEVEL_NAME_TAKEN, 'Level name is already taken');
    }
    const level: NodeLevel = { id: crypto.randomUUID(), archivedAt: null, ...parsed.data };
    demoNodeLevels.push(level);
    return HttpResponse.json(level, { status: 201 });
  }),

  http.patch('/api/v1/projects/node-levels/:id', async ({ params, request }) => {
    if (!getMockActor().permissions.includes(Permission.PROJECT_SETUP_MANAGE)) return forbidden();
    const parsed = nodeLevelUpdateBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return invalid();
    const level = demoNodeLevels.find((entry) => entry.id === String(params.id));
    if (!level) return nodeNotFound();
    const nextName = parsed.data.name;
    if (
      nextName &&
      demoNodeLevels.some(
        (entry) =>
          entry.id !== level.id &&
          entry.name.trim().toLowerCase() === nextName.trim().toLowerCase(),
      )
    ) {
      return conflict(ErrorCode.PROJECT_NODE_LEVEL_NAME_TAKEN, 'Level name is already taken');
    }
    if (nextName) level.name = nextName;
    if (parsed.data.icon) level.icon = parsed.data.icon;
    if (parsed.data.color) level.color = parsed.data.color;
    return HttpResponse.json(level);
  }),

  /** Архивация вида (узлы архивного вида создавать нельзя, существующие живут). */
  http.delete('/api/v1/projects/node-levels/:id', ({ params }) => {
    if (!getMockActor().permissions.includes(Permission.PROJECT_SETUP_MANAGE)) return forbidden();
    const level = demoNodeLevels.find((entry) => entry.id === String(params.id));
    if (!level) return nodeNotFound();
    level.archivedAt = new Date().toISOString();
    return HttpResponse.json(level);
  }),

  // ===== Дерево узлов проекта =====

  http.get('/api/v1/projects/:id/structure', ({ params }) => {
    const row = findDemoProjectRow(String(params.id));
    const actor = getMockActor();
    if (!row || !canSeeProject(row, actor)) return nodeNotFound();
    return HttpResponse.json({
      nodes: nodesOfProject(row.id).map(projectNodeDto),
      levels: demoNodeLevels,
    });
  }),

  http.post('/api/v1/projects/:id/nodes', async ({ params, request }) => {
    const guard = manageableProject(String(params.id));
    if (typeof guard === 'string') return guardResponse(guard);
    const parsed = createProjectNodeBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return invalid();
    const body = parsed.data;
    const parent = checkedParent(guard.row.id, body.parentId);
    if (typeof parent === 'string') return nodeNotFound();
    const level = levelOf(body.levelId);
    if (!level) return nodeNotFound();
    if (level.archivedAt) {
      return conflict(ErrorCode.PROJECT_NODE_LEVEL_ARCHIVED, 'Level is archived');
    }
    if (body.code && nodeCodeTaken(body.code, guard.row.id, null)) {
      return conflict(ErrorCode.PROJECT_NODE_CODE_TAKEN, 'Node code is already taken');
    }
    if (nodesOfProject(guard.row.id).length >= NODE_LIMITS.nodesPerProject) {
      return conflict(ErrorCode.PROJECT_NODE_LIMIT_REACHED, 'Node limit reached');
    }
    if ((parent.parent ? nodeDepthOf(parent.parent) + 1 : 0) + 1 > NODE_LIMITS.depth) {
      return conflict(ErrorCode.PROJECT_NODE_INVALID, 'Depth limit reached');
    }
    const row = appendNode(
      guard.row.id,
      body.parentId ?? null,
      body.levelId,
      body.name,
      body.code ?? null,
    );
    return HttpResponse.json(projectNodeDto(row), { status: 201 });
  }),

  http.post('/api/v1/projects/:id/nodes/batch', async ({ params, request }) => {
    const guard = manageableProject(String(params.id));
    if (typeof guard === 'string') return guardResponse(guard);
    const parsed = batchCreateProjectNodesBodySchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) return invalid();
    const body = parsed.data;
    const parent = checkedParent(guard.row.id, body.parentId);
    if (typeof parent === 'string') return nodeNotFound();
    const level = levelOf(body.levelId);
    if (!level) return nodeNotFound();
    if (level.archivedAt) {
      return conflict(ErrorCode.PROJECT_NODE_LEVEL_ARCHIVED, 'Level is archived');
    }
    if (nodesOfProject(guard.row.id).length + body.names.length > NODE_LIMITS.nodesPerProject) {
      return conflict(ErrorCode.PROJECT_NODE_LIMIT_REACHED, 'Node limit reached');
    }
    const nodes: ProjectNode[] = body.names.map((name) =>
      projectNodeDto(appendNode(guard.row.id, body.parentId ?? null, body.levelId, name, null)),
    );
    return HttpResponse.json({ nodes }, { status: 201 });
  }),

  http.patch('/api/v1/projects/:id/nodes/:nodeId', async ({ params, request }) => {
    const guard = manageableProject(String(params.id));
    if (typeof guard === 'string') return guardResponse(guard);
    const parsed = updateProjectNodeBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return invalid();
    const body = parsed.data;
    const node = findDemoNodeRow(String(params.nodeId));
    if (!node || node.projectId !== guard.row.id) return nodeNotFound();
    if (body.levelId) {
      const level = levelOf(body.levelId);
      if (!level) return nodeNotFound();
      if (level.archivedAt) {
        return conflict(ErrorCode.PROJECT_NODE_LEVEL_ARCHIVED, 'Level is archived');
      }
      node.levelId = body.levelId;
    }
    if (body.name) node.name = body.name;
    if (body.code !== undefined) {
      if (body.code !== null && nodeCodeTaken(body.code, guard.row.id, node.id)) {
        return conflict(ErrorCode.PROJECT_NODE_CODE_TAKEN, 'Node code is already taken');
      }
      node.code = body.code;
    }
    return HttpResponse.json(projectNodeDto(node));
  }),

  http.post('/api/v1/projects/:id/nodes/:nodeId/move', async ({ params, request }) => {
    const guard = manageableProject(String(params.id));
    if (typeof guard === 'string') return guardResponse(guard);
    const parsed = moveProjectNodeBodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return invalid();
    const body = parsed.data;
    const node = findDemoNodeRow(String(params.nodeId));
    if (!node || node.projectId !== guard.row.id) return nodeNotFound();
    const parent = checkedParent(guard.row.id, body.parentId);
    if (typeof parent === 'string') return nodeNotFound();
    if (
      body.parentId !== null &&
      (body.parentId === node.id || descendantIdsOf(node.id).has(body.parentId))
    ) {
      return conflict(ErrorCode.PROJECT_NODE_CYCLE, 'Cannot move node into itself');
    }
    const newDepth = body.parentId && parent.parent ? nodeDepthOf(parent.parent) + 1 : 0;
    if (newDepth + subtreeHeight(node) - 1 > NODE_LIMITS.depth) {
      return conflict(ErrorCode.PROJECT_NODE_INVALID, 'Depth limit reached');
    }
    if (
      body.parentId !== null &&
      childNodeRows(body.parentId, guard.row.id).length >= NODE_LIMITS.childrenPerParent
    ) {
      return conflict(ErrorCode.PROJECT_NODE_LIMIT_REACHED, 'Children limit reached');
    }
    const anchorOf = (id: string | null | undefined) =>
      id ? demoNodeRows.find((row) => row.id === id && row.parentId === body.parentId) : undefined;
    const before = anchorOf(body.beforeId);
    const after = anchorOf(body.afterId);
    if ((body.beforeId && !before) || (body.afterId && !after)) return invalid();
    // Порядок сиблингов = порядок в массиве: вынимаем и вставляем по якорю,
    // без якоря — последним ребёнком родителя.
    demoNodeRows.splice(demoNodeRows.indexOf(node), 1);
    node.parentId = body.parentId;
    if (before) demoNodeRows.splice(demoNodeRows.indexOf(before), 0, node);
    else if (after) demoNodeRows.splice(demoNodeRows.indexOf(after) + 1, 0, node);
    else {
      const children = childNodeRows(body.parentId, guard.row.id).filter(
        (row) => row.id !== node.id,
      );
      const last = children[children.length - 1];
      if (last) demoNodeRows.splice(demoNodeRows.indexOf(last) + 1, 0, node);
      else demoNodeRows.push(node);
    }
    return HttpResponse.json(projectNodeDto(node));
  }),

  http.delete('/api/v1/projects/:id/nodes/:nodeId', ({ params }) => {
    const guard = manageableProject(String(params.id));
    if (typeof guard === 'string') return guardResponse(guard);
    const node = findDemoNodeRow(String(params.nodeId));
    if (!node || node.projectId !== guard.row.id) return nodeNotFound();
    const hasChildren = demoNodeRows.some((row) => row.parentId === node.id);
    if (hasChildren || directTasksOf(node.id).length > 0) {
      return conflict(ErrorCode.PROJECT_NODE_NOT_EMPTY, 'Node is not empty');
    }
    demoNodeRows.splice(demoNodeRows.indexOf(node), 1);
    return new HttpResponse(null, { status: 204 });
  }),
];
