/* eslint-disable nodus-internal/max-lines-warn -- единый сценарий кастомных атрибутов (#431) */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  apiErrorResponseSchema,
  CUSTOM_FIELD_EVENTS,
  customFieldDefinitionSchema,
  customFieldUsageSchema,
  dictionaryItemSchema,
  dictionarySchema,
  ErrorCode,
  executeTransitionResultSchema,
  Permission,
  taskDetailSchema,
  taskListItemSchema,
  workflowTransitionSchema,
  type WorkflowTransition,
} from '@nodus/contracts';
import { z } from 'zod';

import { EventDispatcher } from '../../src/core/events/event-dispatcher.js';
import { TokenService } from '../../src/modules/auth/token.service.js';
import { setupChatFixture, type ChatTestFixture, type ChatUser } from './chat-fixtures.js';
import { dispatchOwnEvent, eventIdOf } from './outbox-test-utils.js';

/**
 * Кастомные атрибуты на живом HTTP (#431, ADR-0029): реестр определений,
 * права, значения в задачах с причинами отказа, умолчание «подразделение
 * автора» (снимок), удаление со стиранием значений и блокировкой маршрутом,
 * окно перехода и гейт по ключу `cf.<id>`, справочники вариантов.
 */
describe.skipIf(!process.env.DATABASE_URL)(
  'custom fields: реестр, значения, окно (integration, #431)',
  () => {
    let fx: ChatTestFixture<'alice' | 'bob'>;
    let admin: ChatUser;
    let plain: ChatUser;
    let dispatcher: EventDispatcher;
    const definitionIds: string[] = [];
    const dictionaryIds: string[] = [];
    const taskIds: string[] = [];
    const departmentIds: string[] = [];

    beforeAll(async () => {
      fx = await setupChatFixture(['alice', 'bob']);
      for (const key of ['tasks', 'chat']) {
        await fx.prisma.featureFlag.upsert({
          where: { key },
          update: { enabled: true },
          create: { key, enabled: true },
        });
      }
      const tokens = fx.app.get(TokenService);
      const sign = async (user: ChatUser, permissions: string[]): Promise<ChatUser> => ({
        ...user,
        token: await tokens.signAccessToken(
          { id: user.id, email: user.email, displayName: user.displayName, permissions },
          'integration-test-session',
        ),
      });
      admin = await sign(fx.users.alice, [
        Permission.TASK_CREATE,
        Permission.TASK_MANAGE_ANY,
        Permission.CUSTOM_FIELD_MANAGE,
        Permission.DICTIONARY_MANAGE,
      ]);
      plain = await sign(fx.users.bob, [Permission.TASK_CREATE]);
      dispatcher = fx.app.get(EventDispatcher);
      // Детерминизм против прошлых прогонов: формы системных кнопок сброшены.
      const standard = await fx.prisma.workflow.findUnique({ where: { code: 'task.default' } });
      if (standard) {
        await fx.prisma.workflowTransition.updateMany({
          where: { workflowId: standard.id },
          data: { form: {}, rules: {} },
        });
      }
    }, 120_000);

    afterAll(async () => {
      if (fx) {
        if (taskIds.length > 0) {
          await fx.prisma.task.deleteMany({ where: { id: { in: taskIds } } });
        }
        await fx.prisma.event.deleteMany({
          where: { aggregateType: 'field_definition', aggregateId: { in: definitionIds } },
        });
        await fx.prisma.event.deleteMany({
          where: { aggregateType: 'dictionary', aggregateId: { in: dictionaryIds } },
        });
        await fx.prisma.fieldDefinition.deleteMany({ where: { id: { in: definitionIds } } });
        await fx.prisma.dictionaryItem.deleteMany({
          where: { dictionaryId: { in: dictionaryIds } },
        });
        await fx.prisma.dictionary.deleteMany({ where: { id: { in: dictionaryIds } } });
        if (departmentIds.length > 0) {
          await fx.prisma.department.deleteMany({ where: { id: { in: departmentIds } } });
        }
      }
      await fx?.cleanup();
    });

    async function createField(
      body: Record<string, unknown>,
    ): Promise<ReturnType<typeof customFieldDefinitionSchema.parse>> {
      const res = await fx.api(admin, 'POST', '/custom-fields/definitions', {
        body,
        key: `it-cf-${crypto.randomUUID()}`,
      });
      expect(res.status, await res.clone().text()).toBe(201);
      const definition = customFieldDefinitionSchema.parse(await res.json());
      definitionIds.push(definition.id);
      return definition;
    }

    /** «Взять в работу»: кнопка «Завершить» доступна только из работы. */
    async function startTask(taskId: string): Promise<void> {
      const buttons = z
        .array(workflowTransitionSchema)
        .parse(await (await fx.api(admin, 'GET', `/tasks/${taskId}/transitions`)).json());
      const start = buttons.find((t) => t.name === 'Взять в работу');
      if (!start) return;
      const res = await fx.api(admin, 'POST', `/tasks/${taskId}/transitions/${start.id}`, {
        body: {},
        key: `it-cf-start-${crypto.randomUUID()}`,
      });
      expect(res.status, await res.clone().text()).toBe(200);
    }

    async function createTask(): Promise<string> {
      const res = await fx.api(admin, 'POST', '/tasks', {
        body: { title: `Проба ${fx.runId} атрибуты`, assigneeId: admin.id },
        key: `it-cf-task-${crypto.randomUUID()}`,
      });
      expect(res.status, await res.clone().text()).toBe(201);
      const task = taskListItemSchema.parse(await res.json());
      taskIds.push(task.id);
      return task.id;
    }

    it('реестр: право, создание, правка, имя и смена типа', async () => {
      const denied = await fx.api(plain, 'POST', '/custom-fields/definitions', {
        body: { scope: 'task', type: 'text', name: `Проба ${fx.runId} запрет` },
        key: `it-cf-deny-${fx.runId}`,
      });
      expect(denied.status).toBe(403);

      const field = await createField({
        scope: 'task',
        type: 'text',
        name: `  Проба ${fx.runId} № накладной  `,
      });
      expect(field.name).toBe(`Проба ${fx.runId} № накладной`);
      expect(field.hidden).toBe(false);

      // Идемпотентность: повтор того же ключа — тот же атрибут, не дубль.
      const key = `it-cf-idem-${fx.runId}`;
      const body = { scope: 'task', type: 'text', name: `Проба ${fx.runId} идемпотентность` };
      const first = await fx.api(admin, 'POST', '/custom-fields/definitions', { body, key });
      const second = await fx.api(admin, 'POST', '/custom-fields/definitions', { body, key });
      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      const firstDto = customFieldDefinitionSchema.parse(await first.json());
      const secondDto = customFieldDefinitionSchema.parse(await second.json());
      expect(secondDto.id).toBe(firstDto.id);
      definitionIds.push(firstDto.id);

      const taken = await fx.api(admin, 'POST', '/custom-fields/definitions', {
        body: { scope: 'task', type: 'text', name: `проба ${fx.runId} № НАКЛАДНОЙ` },
        key: `it-cf-taken-${fx.runId}`,
      });
      expect(taken.status).toBe(409);
      expect(apiErrorResponseSchema.parse(await taken.json()).code).toBe(
        ErrorCode.CUSTOM_FIELD_NAME_TAKEN,
      );

      const incompatible = await fx.api(admin, 'PATCH', `/custom-fields/definitions/${field.id}`, {
        body: { type: 'number' },
        key: `it-cf-type-${fx.runId}`,
      });
      expect(incompatible.status).toBe(409);
      expect(apiErrorResponseSchema.parse(await incompatible.json()).code).toBe(
        ErrorCode.CUSTOM_FIELD_TYPE_CHANGE_INCOMPATIBLE,
      );

      const widened = await fx.api(admin, 'PATCH', `/custom-fields/definitions/${field.id}`, {
        body: { type: 'long_text' },
        key: `it-cf-widen-${fx.runId}`,
      });
      expect(widened.status).toBe(200);
      expect(customFieldDefinitionSchema.parse(await widened.json()).type).toBe('long_text');

      const list = await fx.api(plain, 'GET', '/custom-fields/definitions?scope=task');
      expect(list.status).toBe(200);
      const items = z.array(customFieldDefinitionSchema).parse(await list.json());
      expect(items.some((item) => item.id === field.id)).toBe(true);

      // Событие изменения — в outbox того же агрегата (I9).
      const events = await fx.prisma.event.findMany({
        where: { aggregateType: 'field_definition', aggregateId: field.id },
        select: { type: true, payload: true },
        orderBy: { seq: 'asc' },
      });
      expect(events[0]?.type).toBe(CUSTOM_FIELD_EVENTS.DEFINITION_CHANGED);
      expect(events.map((event) => (event.payload as { change: string }).change)).toEqual([
        'created',
        'updated',
      ]);
    });

    it('значения: 200 и 422 по каждой причине, событие с cf-ключом', async () => {
      const text = await createField({
        scope: 'task',
        type: 'text',
        name: `Проба ${fx.runId} текст`,
      });
      const person = await createField({
        scope: 'task',
        type: 'user',
        name: `Проба ${fx.runId} сотрудник`,
      });
      const taskId = await createTask();

      const unknown = await fx.api(admin, 'PATCH', `/tasks/${taskId}`, {
        body: { customFields: { [crypto.randomUUID()]: 'x' } },
        key: `it-cf-unknown-${fx.runId}`,
      });
      expect(unknown.status).toBe(422);
      const unknownError = apiErrorResponseSchema.parse(await unknown.json());
      expect(unknownError.code).toBe(ErrorCode.CUSTOM_FIELD_VALUE_INVALID);
      expect((unknownError.details as { issues: { reason: string }[] }).issues[0]?.reason).toBe(
        'unknown',
      );

      const invalid = await fx.api(admin, 'PATCH', `/tasks/${taskId}`, {
        body: { customFields: { [text.id]: 42 } },
        key: `it-cf-invalid-${fx.runId}`,
      });
      expect(invalid.status).toBe(422);
      expect(
        (
          apiErrorResponseSchema.parse(await invalid.json()).details as {
            issues: { reason: string }[];
          }
        ).issues[0]?.reason,
      ).toBe('invalid');

      const notFound = await fx.api(admin, 'PATCH', `/tasks/${taskId}`, {
        body: { customFields: { [person.id]: crypto.randomUUID() } },
        key: `it-cf-notfound-${fx.runId}`,
      });
      expect(notFound.status).toBe(422);
      expect(
        (
          apiErrorResponseSchema.parse(await notFound.json()).details as {
            issues: { reason: string }[];
          }
        ).issues[0]?.reason,
      ).toBe('not_found');

      const ok = await fx.api(admin, 'PATCH', `/tasks/${taskId}`, {
        body: { customFields: { [text.id]: 'Значение', [person.id]: plain.id } },
        key: `it-cf-ok-${fx.runId}`,
      });
      expect(ok.status, await ok.clone().text()).toBe(200);
      const detail = taskDetailSchema.parse(
        await (await fx.api(admin, 'GET', `/tasks/${taskId}`)).json(),
      );
      expect(detail.customFields[text.id]).toBe('Значение');
      expect(detail.customFields[person.id]).toBe(plain.id);
      // Ссылки для показа: сотрудник назван, без похода в справочник с клиента.
      expect(detail.customFieldRefs.find((ref) => ref.id === plain.id)).toMatchObject({
        kind: 'user',
        name: plain.displayName,
        archived: false,
      });

      // Событие правки: ключ `cf.<id>` и перечень изменений (Р12).
      const updated = await fx.prisma.event.findFirstOrThrow({
        where: { type: 'task.updated', aggregateId: taskId },
        orderBy: { seq: 'desc' },
        select: { payload: true },
      });
      const payload = updated.payload as {
        fields: string[];
        customFieldChanges: { fieldId: string; to: unknown }[];
      };
      expect(payload.fields).toContain(`cf.${text.id}`);
      expect(payload.customFieldChanges).toContainEqual(
        expect.objectContaining({ fieldId: text.id, to: 'Значение' }),
      );

      // Очистка значения: null убирает ключ, а не пишет null (Р1).
      const cleared = await fx.api(admin, 'PATCH', `/tasks/${taskId}`, {
        body: { customFields: { [text.id]: null } },
        key: `it-cf-clear-${fx.runId}`,
      });
      expect(cleared.status).toBe(200);
      const after = taskDetailSchema.parse(
        await (await fx.api(admin, 'GET', `/tasks/${taskId}`)).json(),
      );
      expect(after.customFields).not.toHaveProperty(text.id);
    });

    it('умолчание «подразделение автора» — снимок на момент создания', async () => {
      const first = await fx.prisma.department.create({
        data: { name: `Проба ${fx.runId} отдел А`, kind: 'management' },
        select: { id: true },
      });
      const second = await fx.prisma.department.create({
        data: { name: `Проба ${fx.runId} отдел Б`, kind: 'management' },
        select: { id: true },
      });
      departmentIds.push(first.id, second.id);
      await fx.prisma.user.update({ where: { id: admin.id }, data: { departmentId: first.id } });

      const field = await createField({
        scope: 'task',
        type: 'department',
        name: `Проба ${fx.runId} подразделение`,
        defaultValue: { kind: 'author_department' },
      });
      const taskId = await createTask();
      const detail = taskDetailSchema.parse(
        await (await fx.api(admin, 'GET', `/tasks/${taskId}`)).json(),
      );
      expect(detail.customFields[field.id]).toBe(first.id);
      expect(detail.customFieldRefs.find((ref) => ref.id === first.id)).toMatchObject({
        kind: 'department',
        name: `Проба ${fx.runId} отдел А`,
      });

      // Перевод сотрудника не пересчитывает снимок (Р5).
      await fx.prisma.user.update({ where: { id: admin.id }, data: { departmentId: second.id } });
      const reread = taskDetailSchema.parse(
        await (await fx.api(admin, 'GET', `/tasks/${taskId}`)).json(),
      );
      expect(reread.customFields[field.id]).toBe(first.id);
    });

    it('удаление: маршрут блокирует, значения стираются, событие убирает ключ', async () => {
      const field = await createField({
        scope: 'task',
        type: 'text',
        name: `Проба ${fx.runId} удаляемый`,
      });
      const taskId = await createTask();
      const detail = taskDetailSchema.parse(
        await (await fx.api(admin, 'GET', `/tasks/${taskId}`)).json(),
      );
      const workflowId = detail.workflowId;
      await fx.api(admin, 'PATCH', `/tasks/${taskId}`, {
        body: { customFields: { [field.id]: 'будет стёрто' } },
        key: `it-cf-del-value-${fx.runId}`,
      });

      const usage = await fx.api(admin, 'GET', `/custom-fields/definitions/${field.id}/usage`);
      expect(usage.status).toBe(200);
      expect(customFieldUsageSchema.parse(await usage.json())).toMatchObject({
        valueCount: 1,
        workflows: [],
      });

      // Атрибут в окне перехода опубликованного маршрута — удаление запрещено.
      const transition = await fx.prisma.workflowTransition.findFirstOrThrow({
        where: { workflowId, name: 'Завершить', archivedAt: null },
      });
      await fx.prisma.workflowTransition.update({
        where: { id: transition.id },
        data: {
          form: {
            enabled: true,
            sections: [{ kind: 'fields', fields: [`cf.${field.id}`] }],
          } as never,
        },
      });
      const blocked = await fx.api(admin, 'DELETE', `/custom-fields/definitions/${field.id}`, {
        key: `it-cf-del-blocked-${fx.runId}`,
      });
      expect(blocked.status).toBe(409);
      const blockedError = apiErrorResponseSchema.parse(await blocked.json());
      expect(blockedError.code).toBe(ErrorCode.CUSTOM_FIELD_IN_USE);
      expect((blockedError.details as { workflows: { id: string }[] }).workflows[0]?.id).toBe(
        workflowId,
      );

      await fx.prisma.workflowTransition.update({
        where: { id: transition.id },
        data: { form: {} as never },
      });
      const removed = await fx.api(admin, 'DELETE', `/custom-fields/definitions/${field.id}`, {
        key: `it-cf-del-${fx.runId}`,
      });
      expect(removed.status, await removed.clone().text()).toBe(204);

      // Значения стирает обработчик события задачи (своё событие, не «проход»).
      const eventId = await eventIdOf(fx.prisma, {
        type: CUSTOM_FIELD_EVENTS.DEFINITION_CHANGED,
        aggregateId: field.id,
      });
      await dispatchOwnEvent(dispatcher, fx.prisma, eventId);
      const row = await fx.prisma.task.findUniqueOrThrow({
        where: { id: taskId },
        select: { customFields: true },
      });
      expect(row.customFields).not.toHaveProperty(field.id);
    });

    it('окно и гейт: поле процесса разблокирует переход, скрытое в окне — не видно', async () => {
      const field = await createField({
        scope: 'task',
        type: 'text',
        name: `Проба ${fx.runId} поле окна`,
      });
      const taskId = await createTask();
      await startTask(taskId);
      const detail = taskDetailSchema.parse(
        await (await fx.api(admin, 'GET', `/tasks/${taskId}`)).json(),
      );
      const key = `cf.${field.id}`;
      const transition = await fx.prisma.workflowTransition.findFirstOrThrow({
        where: { workflowId: detail.workflowId, name: 'Завершить', archivedAt: null },
      });
      await fx.prisma.workflowTransition.update({
        where: { id: transition.id },
        data: {
          form: { enabled: true, sections: [{ kind: 'fields', fields: [key] }] } as never,
          rules: {
            conditions: [],
            validators: [{ kind: 'fields_required', fields: [key] }],
            postFunctions: [],
          } as never,
        },
      });

      const button = (
        z
          .array(workflowTransitionSchema)
          .parse(
            await (await fx.api(admin, 'GET', `/tasks/${taskId}/transitions`)).json(),
          ) as WorkflowTransition[]
      ).find((t) => t.name === 'Завершить')!;

      const blocked = await fx.api(admin, 'POST', `/tasks/${taskId}/transitions/${button.id}`, {
        body: { form: {} },
        key: `it-cf-gate-blocked-${fx.runId}`,
      });
      expect(blocked.status).toBe(409);

      const done = await fx.api(admin, 'POST', `/tasks/${taskId}/transitions/${button.id}`, {
        body: { form: { fields: { customFields: { [field.id]: 'Заполнено окном' } } } },
        key: `it-cf-gate-ok-${fx.runId}`,
      });
      expect(done.status, await done.clone().text()).toBe(200);
      const result = executeTransitionResultSchema.parse(await done.json());
      expect(result.task.stage.systemState).toBe('done');

      const record = await fx.prisma.transitionRecord.findFirstOrThrow({
        where: { entityId: taskId, transitionId: button.id },
      });
      expect(record.fields).toMatchObject({ [key]: { to: 'Заполнено окном' } });

      // Скрытие: атрибут пропадает из карточки, но значения остаются.
      const hidden = await fx.api(admin, 'PATCH', `/custom-fields/definitions/${field.id}`, {
        body: { hidden: true },
        key: `it-cf-hidden-${fx.runId}`,
      });
      expect(hidden.status).toBe(200);
      expect(customFieldDefinitionSchema.parse(await hidden.json()).hidden).toBe(true);
      const card = taskDetailSchema.parse(
        await (await fx.api(admin, 'GET', `/tasks/${taskId}`)).json(),
      );
      expect(card.customFields[field.id]).toBe('Заполнено окном');

      await fx.prisma.workflowTransition.update({
        where: { id: transition.id },
        data: { form: {} as never, rules: {} as never },
      });
    });

    it('справочники: список с вариантами, дубль имени, удаление, системный защищён', async () => {
      const created = await fx.api(admin, 'POST', '/dictionaries', {
        body: { name: `Проба ${fx.runId} виды работ`, items: ['Монтаж', 'Проектирование'] },
        key: `it-dict-${fx.runId}`,
      });
      expect(created.status, await created.clone().text()).toBe(201);
      const dictionary = dictionarySchema.parse(await created.json());
      dictionaryIds.push(dictionary.id);
      expect(dictionary.code).toMatch(/^list-[0-9a-f]{8}$/);

      const items = await fx.api(admin, 'GET', `/dictionaries/${dictionary.code}/items?limit=50`);
      const page = z
        .object({ items: z.array(dictionaryItemSchema), nextCursor: z.string().nullable() })
        .parse(await items.json());
      expect(page.items.map((item) => item.name)).toEqual(['Монтаж', 'Проектирование']);

      const duplicate = await fx.api(admin, 'POST', `/dictionaries/${dictionary.code}/items`, {
        body: { name: ' монтаж ' },
        key: `it-dict-dup-${fx.runId}`,
      });
      expect(duplicate.status).toBe(409);
      expect(apiErrorResponseSchema.parse(await duplicate.json()).code).toBe(
        ErrorCode.DICTIONARY_ITEM_NAME_TAKEN,
      );

      // Атрибут-список на этом справочнике; значение удалённого варианта — 422.
      const field = await createField({
        scope: 'task',
        type: 'enum',
        name: `Проба ${fx.runId} вид работ`,
        settings: { dictionaryId: dictionary.id },
      });
      const taskId = await createTask();
      const ok = await fx.api(admin, 'PATCH', `/tasks/${taskId}`, {
        body: { customFields: { [field.id]: page.items[1]!.id } },
        key: `it-dict-value-${fx.runId}`,
      });
      expect(ok.status).toBe(200);

      const removedItem = await fx.api(
        admin,
        'DELETE',
        `/dictionaries/${dictionary.code}/items/${page.items[1]!.id}`,
        { key: `it-dict-del-item-${fx.runId}` },
      );
      expect(removedItem.status).toBe(204);
      // Значение удалённого варианта читается пустым (терпимое чтение), а
      // записать его снова нельзя: проверяются только изменённые значения (Р2).
      const cleared = await fx.api(admin, 'PATCH', `/tasks/${taskId}`, {
        body: { customFields: { [field.id]: null } },
        key: `it-dict-clear-${fx.runId}`,
      });
      expect(cleared.status).toBe(200);
      const stale = await fx.api(admin, 'PATCH', `/tasks/${taskId}`, {
        body: { customFields: { [field.id]: page.items[1]!.id } },
        key: `it-dict-stale-${fx.runId}`,
      });
      expect(stale.status).toBe(422);

      const locked = await fx.api(admin, 'PATCH', '/dictionaries/currency', {
        body: { name: 'Валюты мира' },
        key: `it-dict-locked-${fx.runId}`,
      });
      expect(locked.status).toBe(409);
      expect(apiErrorResponseSchema.parse(await locked.json()).code).toBe(
        ErrorCode.DICTIONARY_SYSTEM_LOCKED,
      );
    });
  },
);
