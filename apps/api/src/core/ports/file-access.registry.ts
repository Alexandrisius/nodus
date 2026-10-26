import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';

import type { FileAccessContributor } from './file-access.port.js';

/**
 * Реестр контрибьюторов прав файлов (#55, F1): заменяет multi-токен
 * `FILE_ACCESS_CONTRIBUTORS`, который нельзя было расширить вторым
 * потребителем без правки каждого модуля (в Nest нет Angular-multi).
 *
 * Контрибьютор объявляет статический маркер `static readonly
 * fileAccessContext` (`chat`, `letter`) — DiscoveryService находит его среди
 * провайдеров приложения (тот же приём, что `eventType` у обработчиков и
 * `workflowCategory` у адаптеров). files не импортирует модули-потребители:
 * он спрашивает реестр, а те лишь регистрируют провайдер у себя.
 */
@Injectable()
export class FileAccessRegistry implements OnModuleInit {
  private items: FileAccessContributor[] = [];

  constructor(private readonly discovery: DiscoveryService) {}

  onModuleInit(): void {
    this.items = this.discovery
      .getProviders()
      .map((wrapper) => wrapper.instance as unknown)
      .filter(isContributor);
  }

  /** Контрибьюторы контекстов (порядок обхода провайдеров Nest). */
  contributors(): readonly FileAccessContributor[] {
    return this.items;
  }
}

/** Провайдер похож на контрибьютора: маркер контекста + метод проверки. */
function isContributor(instance: unknown): instance is FileAccessContributor {
  if (instance === null || typeof instance !== 'object') return false;
  const candidate = instance as { fileAccessContext?: unknown; check?: unknown };
  return typeof candidate.fileAccessContext === 'string' && typeof candidate.check === 'function';
}
