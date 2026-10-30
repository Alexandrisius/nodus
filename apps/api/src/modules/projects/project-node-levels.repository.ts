import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { NodeLevel, NodeLevelIcon, ProjectColor } from '@nodus/contracts';

import { PrismaService } from '../../core/database/prisma.service.js';
import type { TransactionClient } from '../../core/database/transaction-runner.js';

const levelSelect = { id: true, name: true, icon: true, color: true, archivedAt: true } as const;
type LevelRow = { id: string; name: string; icon: string; color: string; archivedAt: Date | null };

export interface NodeLevelPatch {
  name?: string;
  icon?: string;
  color?: string;
}

/**
 * Таблица `node_levels` — виды уровней (ярлыки узлов структуры, #467).
 * Справочник «Автоматизации»: чтение — всем, правка — project.setup.manage
 * (гвард контроллера); удаление = архивация. Уникальность имени
 * lower(btrim(name)) — выраженный индекс в миграции, проверка здесь raw-SQL
 * (Prisma выражения не декларирует, канон projects_code_key).
 */
@Injectable()
export class NodeLevelsRepository {
  constructor(private readonly prisma: PrismaService) {}

  toDto(row: LevelRow): NodeLevel {
    return {
      id: row.id,
      name: row.name,
      icon: row.icon as NodeLevelIcon,
      color: row.color as ProjectColor,
      archivedAt: row.archivedAt?.toISOString() ?? null,
    };
  }

  /** Все виды: живые по имени, архивные в конце (подсказка окна создания). */
  async list(): Promise<NodeLevel[]> {
    const rows = await this.prisma.nodeLevel.findMany({
      select: levelSelect,
      orderBy: [{ archivedAt: { sort: 'asc', nulls: 'first' } }, { name: 'asc' }],
    });
    return rows.map((row) => this.toDto(row));
  }

  async findById(id: string): Promise<NodeLevel | null> {
    const row = await this.prisma.nodeLevel.findUnique({ select: levelSelect, where: { id } });
    return row ? this.toDto(row) : null;
  }

  async findActive(id: string): Promise<NodeLevel | null> {
    const row = await this.prisma.nodeLevel.findFirst({
      select: levelSelect,
      where: { id, archivedAt: null },
    });
    return row ? this.toDto(row) : null;
  }

  /** Живые виды по id (валидация подсказки типа проекта). */
  async activeByIds(ids: readonly string[]): Promise<NodeLevel[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.nodeLevel.findMany({
      select: levelSelect,
      where: { id: { in: [...ids] }, archivedAt: null },
    });
    return rows.map((row) => this.toDto(row));
  }

  /** Имя занято без учёта регистра и краёв (зеркало уникального индекса). */
  async nameTaken(name: string, excludeId: string | null): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM node_levels
      WHERE lower(btrim(name)) = lower(btrim(${name}))
        AND (${excludeId}::uuid IS NULL OR id <> ${excludeId}::uuid)
      LIMIT 1`;
    return rows.length > 0;
  }

  async create(
    tx: TransactionClient,
    data: { name: string; icon: string; color: string },
  ): Promise<NodeLevel> {
    const row = await tx.nodeLevel.create({
      select: levelSelect,
      data: { id: randomUUID(), ...data },
    });
    return this.toDto(row);
  }

  async update(
    tx: TransactionClient,
    id: string,
    patch: NodeLevelPatch,
  ): Promise<NodeLevel | null> {
    const updated = await tx.nodeLevel.updateMany({ where: { id }, data: patch });
    if (updated.count === 0) return null;
    const row = await tx.nodeLevel.findUnique({ select: levelSelect, where: { id } });
    return row ? this.toDto(row) : null;
  }

  async setArchived(
    tx: TransactionClient,
    id: string,
    archived: boolean,
  ): Promise<NodeLevel | null> {
    const updated = await tx.nodeLevel.updateMany({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
    });
    if (updated.count === 0) return null;
    const row = await tx.nodeLevel.findUnique({ select: levelSelect, where: { id } });
    return row ? this.toDto(row) : null;
  }
}
