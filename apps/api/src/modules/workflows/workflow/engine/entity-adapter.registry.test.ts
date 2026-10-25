import { describe, expect, it } from 'vitest';
import { Injectable, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';

import type {
  WorkflowActorSubject,
  WorkflowEntityAdapter,
} from '../../../../core/ports/workflow-entity.port.js';
import { WorkflowEntityRegistry } from './entity-adapter.registry.js';

/** Поддельный адаптер: реестр ищет провайдеры по статическому маркеру. */
@Injectable()
class FakeTaskAdapter implements WorkflowEntityAdapter {
  static readonly workflowCategory = 'task';
  readonly category = FakeTaskAdapter.workflowCategory;

  lock(): Promise<void> {
    return Promise.resolve();
  }

  subject(): Promise<WorkflowActorSubject> {
    return Promise.reject(new Error('not used'));
  }

  applyStage(): Promise<void> {
    return Promise.resolve();
  }

  countByStages(): Promise<Record<string, number>> {
    return Promise.resolve({});
  }

  migrateStage(): Promise<number> {
    return Promise.resolve(0);
  }

  restateStage(): Promise<number> {
    return Promise.resolve(0);
  }
}

@Module({
  imports: [DiscoveryModule],
  providers: [FakeTaskAdapter, WorkflowEntityRegistry],
})
class ProbeModule {}

describe('WorkflowEntityRegistry (#428, ADR-0024)', () => {
  it('находит адаптер по static workflowCategory при bootstrap', async () => {
    const app = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
    await app.init();
    const registry = app.get(WorkflowEntityRegistry);
    expect(registry.has('task')).toBe(true);
    expect(registry.get('task')).toBeInstanceOf(FakeTaskAdapter);
    expect(() => registry.get('letter')).toThrow(/No workflow entity adapter/);
    await app.close();
  });
});
