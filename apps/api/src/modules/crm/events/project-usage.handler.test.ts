import { PROJECT_EVENTS } from '@nodus/contracts';
import { describe, expect, it, vi } from 'vitest';

import { ProjectCreatedUsageHandler, ProjectUpdatedUsageHandler } from './project-usage.handler.js';

const PROJECT = '00000000-0000-4000-8000-000000000401';
const CP = '00000000-0000-4000-8000-000000000402';

const event = (type: string, payload: Record<string, unknown>) =>
  ({ id: 'e1', type, payload, actorId: null }) as never;

function usages() {
  return {
    upsertProject: vi.fn(async () => void 0),
    deleteProject: vi.fn(async () => void 0),
  };
}

describe('проекция «проекты контрагента» (#52, Р13)', () => {
  it('создание с заказчиком пишет строку; без заказчика — тишина', async () => {
    const repo = usages();
    await new ProjectCreatedUsageHandler(repo as never).handle(
      event(PROJECT_EVENTS.CREATED, { projectId: PROJECT, clientId: CP }),
    );
    expect(repo.upsertProject).toHaveBeenCalledWith({
      sourceId: PROJECT,
      counterpartyId: CP,
    });

    repo.upsertProject.mockClear();
    await new ProjectCreatedUsageHandler(repo as never).handle(
      event(PROJECT_EVENTS.CREATED, { projectId: PROJECT, clientId: null }),
    );
    expect(repo.upsertProject).not.toHaveBeenCalled();
  });

  it('смена заказчика — upsert; снятие — строка убрана; без clientId — тишина', async () => {
    const repo = usages();
    const handler = new ProjectUpdatedUsageHandler(repo as never);

    await handler.handle(
      event(PROJECT_EVENTS.UPDATED, { projectId: PROJECT, fields: ['clientId'], clientId: CP }),
    );
    expect(repo.upsertProject).toHaveBeenCalledWith({ sourceId: PROJECT, counterpartyId: CP });

    await handler.handle(
      event(PROJECT_EVENTS.UPDATED, {
        projectId: PROJECT,
        fields: ['clientId'],
        clientId: null,
        previousClientId: CP,
      }),
    );
    expect(repo.deleteProject).toHaveBeenCalledWith(PROJECT);

    repo.upsertProject.mockClear();
    await handler.handle(event(PROJECT_EVENTS.UPDATED, { projectId: PROJECT, fields: ['status'] }));
    expect(repo.upsertProject).not.toHaveBeenCalled();
    expect(repo.deleteProject).toHaveBeenCalledTimes(1);
  });
});
