import { http, HttpResponse } from 'msw';
import type {
  CreateCustomFieldBody,
  CustomFieldDefinition,
  CustomFieldScope,
  ReorderCustomFieldsBody,
  UpdateCustomFieldBody,
} from '@nodus/contracts';
import {
  createCustomFieldBodySchema,
  CUSTOM_FIELD_LIMITS,
  ErrorCode,
  isCompatibleTypeChange,
  reorderCustomFieldsBodySchema,
  updateCustomFieldBodySchema,
} from '@nodus/contracts';

import { projectsAvailable } from '../../api/projects-available.js';
import { dictionaryById } from '../../mocks/data/dictionaries.js';
import { demoCustomFieldDefinitions, demoFieldById } from '../../mocks/data/custom-fields.js';

/** Мок-сервер реестра полей (#431): правила те же, что у бэкенда —
 *  имя среди активных, лимит области, белый список смены типа, справочник
 *  неизменен, «Проект» доступен только в мок-мире проектов. */

const SCOPE_ORDER: CustomFieldScope[] = ['task', 'letter', 'project', 'counterparty'];

function dto(definition: CustomFieldDefinition): CustomFieldDefinition {
  const dictionary = definition.settings.dictionaryId
    ? dictionaryById(definition.settings.dictionaryId)
    : definition.type === 'money' && definition.settings.currencyId
      ? dictionaryById('d1000000-0000-4000-8000-000000000001')
      : undefined;
  return {
    ...definition,
    dictionary: dictionary
      ? {
          id: dictionary.id,
          code: dictionary.code,
          name: dictionary.name,
          isSystem: dictionary.isSystem,
        }
      : null,
  };
}

function error(code: string, message: string, status: number, details?: unknown) {
  return HttpResponse.json({ code, message, ...(details ? { details } : {}) }, { status });
}

function nameTaken(scope: CustomFieldScope, name: string, exceptId?: string): boolean {
  const key = name.trim().toLowerCase();
  return demoCustomFieldDefinitions.some(
    (entry) =>
      entry.scope === scope &&
      entry.archivedAt === null &&
      entry.id !== exceptId &&
      entry.name.trim().toLowerCase() === key,
  );
}

function activeCount(scope: CustomFieldScope): number {
  return demoCustomFieldDefinitions.filter(
    (entry) => entry.scope === scope && entry.archivedAt === null,
  ).length;
}

export const customFieldsHandlers = [
  http.get('/api/v1/custom-fields/definitions', ({ request }) => {
    const url = new URL(request.url);
    const scope = url.searchParams.get('scope') as CustomFieldScope | null;
    const archived = url.searchParams.get('archived');
    const items = demoCustomFieldDefinitions
      .filter((entry) => (scope ? entry.scope === scope : true))
      .filter((entry) => (archived === 'only' ? entry.archivedAt !== null : true))
      .sort(
        (a, b) =>
          SCOPE_ORDER.indexOf(a.scope) - SCOPE_ORDER.indexOf(b.scope) ||
          a.sortOrder - b.sortOrder ||
          a.id.localeCompare(b.id),
      )
      .map(dto);
    return HttpResponse.json(items);
  }),

  http.post('/api/v1/custom-fields/definitions', async ({ request }) => {
    const parsed = createCustomFieldBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return error(ErrorCode.VALIDATION_FAILED, 'Invalid body', 422, parsed.error.issues);
    }
    const body: CreateCustomFieldBody = parsed.data;
    if (body.type === 'project' && !projectsAvailable()) {
      return error(ErrorCode.CUSTOM_FIELD_TYPE_UNAVAILABLE, 'Project fields unavailable', 422);
    }
    if (body.settings.dictionaryId && !dictionaryById(body.settings.dictionaryId)) {
      return error(ErrorCode.VALIDATION_FAILED, 'Dictionary not found', 422);
    }
    if (nameTaken(body.scope, body.name)) {
      return error(ErrorCode.CUSTOM_FIELD_NAME_TAKEN, 'Name is taken', 409);
    }
    if (activeCount(body.scope) >= CUSTOM_FIELD_LIMITS.perScope) {
      return error(ErrorCode.CUSTOM_FIELD_LIMIT_REACHED, 'Field limit reached', 409);
    }
    const now = new Date().toISOString();
    const maxOrder = Math.max(
      -1,
      ...demoCustomFieldDefinitions
        .filter((entry) => entry.scope === body.scope)
        .map((entry) => entry.sortOrder),
    );
    const definition: CustomFieldDefinition = {
      id: crypto.randomUUID(),
      scope: body.scope,
      type: body.type,
      name: body.name,
      hint: body.hint ?? null,
      settings: body.settings,
      dictionary: null,
      defaultValue: body.defaultValue ?? null,
      reportIndexed: body.reportIndexed,
      sortOrder: maxOrder + 1,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    demoCustomFieldDefinitions.push(definition);
    return HttpResponse.json(dto(definition), { status: 201 });
  }),

  // Порядок — ДО '/definitions/:id' (gotcha msw-query: буквальный путь раньше).
  http.put('/api/v1/custom-fields/definitions/order', async ({ request }) => {
    const parsed = reorderCustomFieldsBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return error(ErrorCode.VALIDATION_FAILED, 'Invalid body', 422);
    }
    const body: ReorderCustomFieldsBody = parsed.data;
    const active = demoCustomFieldDefinitions.filter(
      (entry) => entry.scope === body.scope && entry.archivedAt === null,
    );
    const ids = new Set(active.map((entry) => entry.id));
    if (body.ids.length !== ids.size || body.ids.some((id) => !ids.has(id))) {
      return error(ErrorCode.CONFLICT, 'Order is stale', 409);
    }
    body.ids.forEach((id, index) => {
      const definition = demoFieldById(id);
      if (definition) definition.sortOrder = index;
    });
    return new HttpResponse(null, { status: 204 });
  }),

  http.patch('/api/v1/custom-fields/definitions/:id', async ({ params, request }) => {
    const definition = demoFieldById(String(params.id));
    if (!definition) return error(ErrorCode.NOT_FOUND, 'Field not found', 404);
    const parsed = updateCustomFieldBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return error(ErrorCode.VALIDATION_FAILED, 'Invalid body', 422, parsed.error.issues);
    }
    const body: UpdateCustomFieldBody = parsed.data;
    if (definition.archivedAt !== null) {
      return error(ErrorCode.CUSTOM_FIELD_ARCHIVED, 'Field is archived', 409);
    }
    if (body.type && !isCompatibleTypeChange(definition.type, body.type)) {
      return error(
        ErrorCode.CUSTOM_FIELD_TYPE_CHANGE_INCOMPATIBLE,
        'Type change is incompatible',
        409,
        {
          from: definition.type,
          to: body.type,
        },
      );
    }
    if (body.name && nameTaken(definition.scope, body.name, definition.id)) {
      return error(ErrorCode.CUSTOM_FIELD_NAME_TAKEN, 'Name is taken', 409);
    }
    if (body.name !== undefined) definition.name = body.name;
    if (body.hint !== undefined) definition.hint = body.hint;
    if (body.type !== undefined) definition.type = body.type;
    if (body.reportIndexed !== undefined) definition.reportIndexed = body.reportIndexed;
    if (body.defaultValue !== undefined) definition.defaultValue = body.defaultValue;
    if (body.settings !== undefined)
      definition.settings = { ...definition.settings, ...body.settings };
    definition.updatedAt = new Date().toISOString();
    return HttpResponse.json(dto(definition));
  }),

  http.post('/api/v1/custom-fields/definitions/:id/archive', ({ params }) => {
    const definition = demoFieldById(String(params.id));
    if (!definition) return error(ErrorCode.NOT_FOUND, 'Field not found', 404);
    if (definition.archivedAt === null) {
      definition.archivedAt = new Date().toISOString();
      definition.updatedAt = definition.archivedAt;
    }
    return HttpResponse.json(dto(definition));
  }),

  http.post('/api/v1/custom-fields/definitions/:id/restore', ({ params }) => {
    const definition = demoFieldById(String(params.id));
    if (!definition) return error(ErrorCode.NOT_FOUND, 'Field not found', 404);
    if (definition.archivedAt !== null) {
      if (nameTaken(definition.scope, definition.name, definition.id)) {
        return error(ErrorCode.CUSTOM_FIELD_NAME_TAKEN, 'Name is taken', 409);
      }
      if (activeCount(definition.scope) >= CUSTOM_FIELD_LIMITS.perScope) {
        return error(ErrorCode.CUSTOM_FIELD_LIMIT_REACHED, 'Field limit reached', 409);
      }
      definition.archivedAt = null;
      definition.updatedAt = new Date().toISOString();
    }
    return HttpResponse.json(dto(definition));
  }),
];
