import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ErrorCode,
  Permission,
  taskDetailSchema,
  taskListItemSchema,
  type ProcessType,
  type WorkflowDetail,
} from '@nodus/contracts';

import { TokenService } from '../../src/modules/auth/token.service.js';
import { setupChatFixture, type ChatTestFixture, type ChatUser } from './chat-fixtures.js';

/**
 * Формы создания и состав карточки по типу (#432) на живом HTTP + БД:
 * публикация формы версией, создание по типу (обязательность, скрытые
 * значения, `not_in_type`), доступ к типу (роли подразделения, «Стандартный»,
 * смена типа), каталог стадий и `layout` для незрячего типа, очистка
 * обязательного, точечные привязки атрибутов.
 *
 * Набор не трогает системный маршрут: тип создаётся копией «Стандартного»
 * и живёт в схеме «тип → маршрут»; уборка удаляет его целиком.
 */
describe.skipIf(!process.env.DATABASE_URL)(
  'type forms and card by type (integration, #432)',
  () => {
    let fx: ChatTestFixture<'admin' | 'alice' | 'bob'>;
    let admin: ChatUser;
    let alice: ChatUser;
    let bob: ChatUser;
    let standardId = '';
    let typeId = '';
    let workflowId = '';
    let fieldBound = '';
    let fieldUnbound = '';
    let roleId = '';
    let departmentId = '';
    let taskId = '';
    const taskIds: string[] = [];

    const FIELD = (suffix: string) => `Поле ${suffix} ${fx.runId}`;

    beforeAll(async () => {
      fx = await setupChatFixture(['admin', 'alice', 'bob']);
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
      admin = await sign(fx.users.admin, [
        Permission.TASK_CREATE,
        Permission.TASK_MANAGE_ANY,
        Permission.WORKFLOW_MANAGE,
        Permission.CUSTOM_FIELD_MANAGE,
        Permission.DIRECTORY_READ,
      ]);
      alice = await sign(fx.users.alice, [Permission.TASK_CREATE]);
      bob = await sign(fx.users.bob, [Permission.TASK_CREATE]);
      // Роль «Администратор» — по КОДУ роли, а не по правам токена (Р6):
      // администратор видит и создаёт по любому типу, даже закрытому.
      const adminRole = await fx.prisma.role.findFirst({ where: { code: 'admin' } });
      if (!adminRole) throw new Error('Seed role admin not found');
      await fx.prisma.userRole.upsert({
        where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
        update: {},
        create: { userId: admin.id, roleId: adminRole.id },
      });

      const types = (await (
        await fx.api(admin, 'GET', '/workflows/types?archived=include')
      ).json()) as ProcessType[] | { code: string };
      if (!Array.isArray(types)) throw new Error(`GET /workflows/types → ${JSON.stringify(types)}`);
      standardId = types.find((type) => type.code === 'task')!.id;

      const created = await fx.api(admin, 'POST', '/workflows/types', {
        body: {
          name: `IT-форма ${fx.runId}`,
          icon: 'zap',
          color: 'info',
          base: { kind: 'copy', typeId: standardId },
        },
        key: `it-432-type-${fx.runId}`,
      });
      expect(created.status).toBe(201);
      const type = (await created.json()) as ProcessType;
      typeId = type.id;
      workflowId = type.workflowId;
      // Новый тип рождается скрытым (creatable=false): включаем создание.
      const enabled = await fx.api(admin, 'PATCH', `/workflows/types/${typeId}`, {
        body: { creatable: true },
        key: `it-432-enable-${fx.runId}`,
      });
      expect(enabled.status).toBe(200);

      // Атрибут, привязанный к типу, и атрибут без привязок (нигде не виден).
      const bound = await fx.api(admin, 'POST', '/custom-fields/definitions', {
        body: { scope: 'task', type: 'number', name: FIELD('часы'), typeIds: [typeId] },
        key: `it-432-field-a-${fx.runId}`,
      });
      expect(bound.status).toBe(201);
      fieldBound = ((await bound.json()) as { id: string }).id;
      const unbound = await fx.api(admin, 'POST', '/custom-fields/definitions', {
        body: { scope: 'task', type: 'text', name: FIELD('чужое') },
        key: `it-432-field-b-${fx.runId}`,
      });
      expect(unbound.status).toBe(201);
      fieldUnbound = ((await unbound.json()) as { id: string }).id;
    }, 180_000);

    afterAll(async () => {
      if (!fx) return;
      await fx.prisma.task.deleteMany({ where: { id: { in: taskIds } } }).catch(() => undefined);
      await fx.prisma.fieldDefinitionType.deleteMany({
        where: { definitionId: { in: [fieldBound, fieldUnbound].filter(Boolean) } },
      });
      await fx.prisma.fieldDefinition.deleteMany({
        where: { id: { in: [fieldBound, fieldUnbound].filter(Boolean) } },
      });
      if (typeId) {
        await fx.prisma.workflowSchemeEntry.deleteMany({ where: { processTypeId: typeId } });
        await fx.prisma.processType.deleteMany({ where: { id: typeId } });
      }
      if (workflowId) {
        await fx.prisma.workflowTransition.deleteMany({ where: { workflowId } });
        await fx.prisma.workflowStage.deleteMany({ where: { workflowId } });
        await fx.prisma.workflow.deleteMany({ where: { id: workflowId } });
      }
      if (roleId) await fx.prisma.role.deleteMany({ where: { id: roleId } });
      if (departmentId) {
        await fx.prisma.user.updateMany({
          where: { departmentId },
          data: { departmentId: null },
        });
        await fx.prisma.department.deleteMany({ where: { id: departmentId } });
      }
      await fx.cleanup();
    }, 120_000);

    /** Форма типа: описание, обязательный срок, скрытые приоритет и
     *  ответственный, обязательные соисполнители и атрибут типа. */
    const creationForm = () => ({
      fields: [
        { key: 'description', label: 'Что сделать', required: false, preset: null },
        { key: 'deadline', label: null, required: true, preset: null },
        { key: 'priority', label: null, required: false, preset: 'high' },
        { key: 'assignee', label: null, required: false, preset: bob.id },
        { key: 'coexecutors', label: null, required: true, preset: null },
        { key: `cf.${fieldBound}`, label: 'Часы', required: false, preset: null },
      ],
      chips: ['checklist'],
    });

    async function publishForm(): Promise<{ version: number; detail: WorkflowDetail }> {
      const detail = (await (
        await fx.api(admin, 'GET', `/workflows/${workflowId}`)
      ).json()) as WorkflowDetail;
      const res = await fx.api(admin, 'POST', `/workflows/${workflowId}/publish`, {
        body: {
          baseVersion: detail.version,
          document: { ...detail.document, creation: creationForm() },
          migrations: [],
        },
        key: `it-432-pub-${fx.runId}-${detail.version}`,
      });
      expect(res.status).toBe(200);
      const published = (await res.json()) as { version: number; scheduledMoves: number };
      expect(published.scheduledMoves).toBe(0);
      return { version: published.version, detail };
    }

    async function createTask(body: Record<string, unknown>) {
      return fx.api(admin, 'POST', '/tasks', {
        body: { title: `IT-432 ${fx.runId}`, typeId, ...body },
        key: `it-432-task-${fx.runId}-${Math.random().toString(36).slice(2)}`,
      });
    }

    it('публикация формы: версия выросла, переносов нет, деталь отдаёт creation', async () => {
      const before = (await (
        await fx.api(admin, 'GET', `/workflows/${workflowId}`)
      ).json()) as WorkflowDetail;
      const { version } = await publishForm();
      expect(version).toBe(before.version + 1);

      const detail = (await (
        await fx.api(admin, 'GET', `/workflows/${workflowId}`)
      ).json()) as WorkflowDetail;
      expect(detail.document.creation?.fields.map((slot) => slot.key)).toEqual(
        creationForm().fields.map((slot) => slot.key),
      );
      expect(detail.document.creation?.chips).toEqual(['checklist']);
    });

    it('создание по типу: 422 с перечнем → 201; скрытые значения важнее ввода', async () => {
      const missing = await createTask({ description: 'x' });
      expect(missing.status).toBe(422);
      expect(await missing.json()).toMatchObject({
        code: ErrorCode.PROCESS_TYPE_FIELDS_REQUIRED,
        details: { typeId, fields: ['deadline', 'coexecutors'], reason: 'create' },
      });

      const created = await createTask({
        description: 'Проверить смету',
        deadline: '2026-12-01T00:00:00.000Z',
        priority: 'low',
        coexecutorIds: [alice.id],
      });
      expect(created.status).toBe(201);
      const task = (await created.json()) as {
        id: string;
        priority: string;
        assignee: { id: string };
      };
      taskIds.push(task.id);
      taskId = task.id;
      // Скрытые значения формы: приоритет и ответственный — из пресета, не из ввода.
      expect(task.priority).toBe('high');
      expect(task.assignee.id).toBe(bob.id);
    });

    it('значение непривязанного атрибута — 422 not_in_type; очистка разрешена', async () => {
      const denied = await createTask({
        deadline: '2026-12-01T00:00:00.000Z',
        coexecutorIds: [alice.id],
        customFields: { [fieldUnbound]: 'чужое' },
      });
      expect(denied.status).toBe(422);
      expect(await denied.json()).toMatchObject({
        code: ErrorCode.CUSTOM_FIELD_VALUE_INVALID,
        details: { issues: [{ fieldId: fieldUnbound, reason: 'not_in_type' }] },
      });

      const cleared = await fx.api(admin, 'PATCH', `/tasks/${taskId}`, {
        body: { customFields: { [fieldUnbound]: null } },
        key: `it-432-clear-${fx.runId}`,
      });
      expect(cleared.status).toBe(200);
    });

    it('обязательное нельзя очистить: срок в карточке и последний соисполнитель', async () => {
      const deadline = await fx.api(admin, 'PATCH', `/tasks/${taskId}`, {
        body: { deadline: null },
        key: `it-432-dl-${fx.runId}`,
      });
      expect(deadline.status).toBe(422);
      expect(await deadline.json()).toMatchObject({
        code: ErrorCode.PROCESS_TYPE_FIELDS_REQUIRED,
        details: { fields: ['deadline'], reason: 'clear' },
      });

      const participant = await fx.api(
        admin,
        'DELETE',
        `/tasks/${taskId}/participants/${alice.id}`,
        {
          key: `it-432-part-${fx.runId}`,
        },
      );
      expect(participant.status).toBe(422);
      expect(await participant.json()).toMatchObject({
        code: ErrorCode.PROCESS_TYPE_FIELDS_REQUIRED,
        details: { fields: ['coexecutors'], reason: 'clear' },
      });
    });

    it('пресет уволенного сотрудника — 422 PRESET_INVALID', async () => {
      await fx.prisma.user.update({ where: { id: bob.id }, data: { status: 'deactivated' } });
      try {
        const res = await createTask({
          deadline: '2026-12-01T00:00:00.000Z',
          coexecutorIds: [alice.id],
        });
        expect(res.status).toBe(422);
        expect(await res.json()).toMatchObject({
          code: ErrorCode.PROCESS_TYPE_PRESET_INVALID,
          details: { typeId, fields: ['assignee'] },
        });
      } finally {
        await fx.prisma.user.update({ where: { id: bob.id }, data: { status: 'active' } });
      }
    });

    it('карточка: layout по типу виден участнику, даже если тип ему не виден', async () => {
      const detail = await fx.api(bob, 'GET', `/tasks/${taskId}`);
      expect(detail.status).toBe(200);
      const task = taskDetailSchema.parse(await detail.json());
      expect(task.layout.requiredKeys).toEqual(['deadline', 'coexecutors']);
      expect(task.layout.roleLabels).toEqual({});
      expect(task.layout.hiddenBlocks).toEqual([]);
    });

    it('доступ: роль подразделения видит и создаёт, без роли — 403 и нет в списке', async () => {
      roleId = (
        await fx.prisma.role.create({
          data: { code: `it-432-${fx.runId}`, name: `Роль ${fx.runId}`, isSystem: false },
          select: { id: true },
        })
      ).id;
      departmentId = (
        await fx.prisma.department.create({
          data: { name: `Отдел ${fx.runId}`, kind: 'management', isActive: true },
          select: { id: true },
        })
      ).id;
      await fx.prisma.departmentRole.create({ data: { departmentId, roleId } });
      await fx.prisma.user.update({ where: { id: alice.id }, data: { departmentId } });

      const config = await fx.api(admin, 'PATCH', `/workflows/types/${typeId}/config`, {
        body: { access: { view: [roleId], create: [roleId] } },
        key: `it-432-config-${fx.runId}`,
      });
      expect(config.status).toBe(200);

      const visible = (await (
        await fx.api(alice, 'GET', '/workflows/types')
      ).json()) as ProcessType[];
      const mine = visible.find((type) => type.id === typeId);
      expect(mine?.viewer).toEqual({ canView: true, canCreate: true });

      const hidden = (await (await fx.api(bob, 'GET', '/workflows/types')).json()) as ProcessType[];
      expect(hidden.some((type) => type.id === typeId)).toBe(false);

      const denied = await fx.api(bob, 'POST', '/tasks', {
        body: { title: `IT-432 ${fx.runId}`, typeId },
        key: `it-432-deny-${fx.runId}`,
      });
      expect(denied.status).toBe(403);
      expect(await denied.json()).toMatchObject({
        code: ErrorCode.PROCESS_TYPE_FORBIDDEN,
        details: { typeId, reason: 'view' },
      });

      // Администратор может всегда — даже при закрытом доступе.
      const byAdmin = await createTask({
        deadline: '2026-12-01T00:00:00.000Z',
        coexecutorIds: [alice.id],
      });
      expect(byAdmin.status).toBe(201);
      taskIds.push(((await byAdmin.json()) as { id: string }).id);
    });

    it('creatable=false: создают только администраторы; «Стандартный» закрыть нельзя', async () => {
      const off = await fx.api(admin, 'PATCH', `/workflows/types/${typeId}`, {
        body: { creatable: false },
        key: `it-432-off-${fx.runId}`,
      });
      expect(off.status).toBe(200);

      const denied = await fx.api(alice, 'POST', '/tasks', {
        body: { title: `IT-432 ${fx.runId}`, typeId },
        key: `it-432-off-task-${fx.runId}`,
      });
      expect(denied.status).toBe(403);
      expect(await denied.json()).toMatchObject({
        code: ErrorCode.PROCESS_TYPE_FORBIDDEN,
        details: { reason: 'not_creatable' },
      });

      const standard = await fx.api(admin, 'PATCH', `/workflows/types/${standardId}`, {
        body: { creatable: false },
        key: `it-432-std-${fx.runId}`,
      });
      expect(standard.status).toBe(409);
      expect(await standard.json()).toMatchObject({
        code: ErrorCode.PROCESS_TYPE_SYSTEM_LOCKED,
        details: { reason: 'default_type' },
      });
      const standardAccess = await fx.api(admin, 'PATCH', `/workflows/types/${standardId}/config`, {
        body: { access: { view: [roleId], create: null } },
        key: `it-432-std-cfg-${fx.runId}`,
      });
      expect(standardAccess.status).toBe(409);

      // Возвращаем создание по типу для следующих шагов набора.
      await fx.api(admin, 'PATCH', `/workflows/types/${typeId}`, {
        body: { creatable: true },
        key: `it-432-on-${fx.runId}`,
      });
    });

    it('смена типа без доступа к целевому — 403; каталог стадий не раскрывает тип', async () => {
      const own = await fx.api(bob, 'POST', '/tasks', {
        body: { title: `IT-432 ${fx.runId}` },
        key: `it-432-bob-task-${fx.runId}`,
      });
      expect(own.status).toBe(201);
      const ownTask = (await own.json()) as { id: string };
      taskIds.push(ownTask.id);

      const change = await fx.api(bob, 'POST', `/tasks/${ownTask.id}/type`, {
        body: { typeId },
        key: `it-432-change-${fx.runId}`,
      });
      expect(change.status).toBe(403);
      expect(await change.json()).toMatchObject({ code: ErrorCode.PROCESS_TYPE_FORBIDDEN });

      const stages = (await (await fx.api(bob, 'GET', '/tasks/stages')).json()) as {
        typeId?: string;
        typeName?: string;
      }[];
      expect(stages.some((stage) => stage.typeName === `IT-форма ${fx.runId}`)).toBe(false);
    });

    it('привязки: повтор идемпотентен, снятие используемой — 409, событие и аудит', async () => {
      const again = await fx.api(
        admin,
        'PUT',
        `/custom-fields/definitions/${fieldBound}/types/${typeId}`,
        {
          key: `it-432-bind-${fx.runId}`,
        },
      );
      expect(again.status).toBe(200);
      expect(((await again.json()) as { typeIds: string[] }).typeIds).toEqual([typeId]);

      // Атрибут стоит в опубликованной форме создания — снять привязку нельзя.
      const denied = await fx.api(
        admin,
        'DELETE',
        `/custom-fields/definitions/${fieldBound}/types/${typeId}`,
        { key: `it-432-unbind-${fx.runId}` },
      );
      expect(denied.status).toBe(409);
      expect(await denied.json()).toMatchObject({ code: ErrorCode.CUSTOM_FIELD_IN_USE });

      const audit = await fx.prisma.auditLog.findFirst({
        where: { action: 'custom_field.bind', entityId: fieldBound },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit?.actorId).toBe(admin.id);

      const events = await fx.prisma.event.findMany({
        where: { aggregateType: 'field_definition', aggregateId: fieldBound },
        orderBy: { seq: 'desc' },
        take: 1,
      });
      expect(events[0]?.payload).toMatchObject({ change: 'updated', fields: ['typeIds'] });
    });

    it('умолчания — только привязанных к типу атрибутов', async () => {
      await fx.api(admin, 'PATCH', `/custom-fields/definitions/${fieldBound}`, {
        body: { defaultValue: { kind: 'static', value: 3 } },
        key: `it-432-default-${fx.runId}`,
      });
      const created = await createTask({
        deadline: '2026-12-01T00:00:00.000Z',
        coexecutorIds: [alice.id],
      });
      expect(created.status).toBe(201);
      const task = taskListItemSchema.parse(await created.json());
      taskIds.push(task.id);
      expect(task.customFields[fieldBound]).toBe(3);
      expect(task.customFields[fieldUnbound]).toBeUndefined();
    });
  },
);
