import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { ProjectCodeField, ProjectType, ProjectTypeUpdateBody } from '@nodus/contracts';

import { PrismaService } from '../../core/database/prisma.service.js';
import type { TransactionClient } from '../../core/database/transaction-runner.js';

const typeSelect = { id: true, name: true, codeField: true, archivedAt: true } as const;
type Row = { id: string; name: string; codeField: string; archivedAt: Date | null };

/** Справочник типов проектов «Автоматизации» (#52; шаблоны — следующие issues). */
@Injectable()
export class ProjectTypesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private toDto(row: Row): ProjectType {
    return {
      id: row.id,
      name: row.name,
      codeField: row.codeField as ProjectCodeField,
      archivedAt: row.archivedAt?.toISOString() ?? null,
    };
  }

  async list(includeArchived: boolean): Promise<ProjectType[]> {
    const rows = await this.prisma.projectType.findMany({
      select: typeSelect,
      where: includeArchived ? {} : { archivedAt: null },
      orderBy: [{ name: 'asc' }],
    });
    return rows.map((row) => this.toDto(row));
  }

  async findActive(id: string): Promise<ProjectType | null> {
    const row = await this.prisma.projectType.findFirst({
      select: typeSelect,
      where: { id, archivedAt: null },
    });
    return row ? this.toDto(row) : null;
  }

  /** Тип без фильтра архива: правка полей проекта живёт и у архивного типа. */
  async findById(id: string): Promise<ProjectType | null> {
    const row = await this.prisma.projectType.findUnique({ select: typeSelect, where: { id } });
    return row ? this.toDto(row) : null;
  }

  async nameTaken(name: string): Promise<boolean> {
    const row = await this.prisma.projectType.findFirst({ select: { id: true }, where: { name } });
    return row !== null;
  }

  async create(tx: TransactionClient, name: string): Promise<ProjectType> {
    const row = await tx.projectType.create({
      select: typeSelect,
      data: { id: randomUUID(), name },
    });
    return this.toDto(row);
  }

  /** Правка типа: имя и/или политика поля «Шифр» (null — тип не найден). */
  async update(
    tx: TransactionClient,
    id: string,
    patch: ProjectTypeUpdateBody,
  ): Promise<ProjectType | null> {
    const result = await tx.projectType.updateMany({ where: { id }, data: patch });
    if (result.count === 0) return null;
    const row = await tx.projectType.findUnique({ select: typeSelect, where: { id } });
    return row ? this.toDto(row) : null;
  }

  async setArchived(
    tx: TransactionClient,
    id: string,
    archived: boolean,
  ): Promise<ProjectType | null> {
    const result = await tx.projectType.updateMany({
      where: { id },
      data: { archivedAt: archived ? new Date() : null },
    });
    if (result.count === 0) return null;
    const row = await tx.projectType.findUnique({ select: typeSelect, where: { id } });
    return row ? this.toDto(row) : null;
  }

  /** Живых проектов типа (архив типа разрешён — проекты сохраняют ссылку;
   *  счётчик для вкладки «Типы проектов»). */
  async activeProjectCount(id: string): Promise<number> {
    return this.prisma.project.count({ where: { typeId: id, status: { not: 'archived' } } });
  }
}
