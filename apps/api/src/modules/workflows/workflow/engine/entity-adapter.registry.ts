import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';

import type { WorkflowEntityAdapter } from '../../../../core/ports/workflow-entity.port.js';

/** Провайдер-адаптер сущности: категория — статический маркер (как `eventType`
 *  у обработчиков событий). */
export interface WorkflowEntityAdapterClass {
  readonly workflowCategory: string;
}

/**
 * Реестр адаптеров сущностей (ADR-0024): при bootstrap обходит провайдеры
 * приложения через DiscoveryService и складывает адаптеры по категории.
 * Почему не @Global-токен (как FILE_ACCESS_CONTRIBUTORS): токен не
 * складывается из двух модулей, а адаптеру нужны доменные провайдеры своего
 * модуля. Две категории с одним адаптером — ошибка сборки графа: движок не
 * должен угадывать, кто из них главный.
 */
@Injectable()
export class WorkflowEntityRegistry implements OnApplicationBootstrap {
  private readonly adapters = new Map<string, WorkflowEntityAdapter>();

  constructor(private readonly discovery: DiscoveryService) {}

  onApplicationBootstrap(): void {
    for (const wrapper of this.discovery.getProviders()) {
      const instance = wrapper.instance as Partial<WorkflowEntityAdapter> | null;
      const category = (instance?.constructor as WorkflowEntityAdapterClass | undefined)
        ?.workflowCategory;
      if (!category || typeof instance?.lock !== 'function') continue;
      if (this.adapters.has(category)) {
        throw new Error(`Workflow entity adapter for category "${category}" is already registered`);
      }
      this.adapters.set(category, instance as WorkflowEntityAdapter);
    }
  }

  get(category: string): WorkflowEntityAdapter {
    const adapter = this.adapters.get(category);
    if (!adapter) throw new Error(`No workflow entity adapter for category "${category}"`);
    return adapter;
  }

  has(category: string): boolean {
    return this.adapters.has(category);
  }
}
