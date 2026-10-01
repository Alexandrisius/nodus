import { Injectable } from '@nestjs/common';
import type { HomeSummary } from '@nodus/contracts';

import { PrismaService } from '../../core/database/prisma.service.js';
import { pickUpcomingBirthdays } from './birthdays.js';

/**
 * Витрина Главной (#100): один агрегат `/home/summary`. Метрики — только из
 * реальных источников; модуль проектов и трекинг времени ещё не живут в
 * бэке — там честные нули/пустые массивы до их появления (клиент пустые
 * блоки не рендерит, вердикт владельца 01.10).
 */
@Injectable()
export class HomeService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(): Promise<HomeSummary> {
    const [employeeCount, birthdayUsers] = await Promise.all([
      this.prisma.user.count({ where: { status: 'active' } }),
      this.prisma.user.findMany({
        where: { status: 'active', birthDate: { not: null } },
        select: { id: true, displayName: true, avatarUrl: true, birthDate: true },
      }),
    ]);
    return {
      stats: { employeeCount, projectsDone: 0, dataNodes: 0 },
      birthdays: pickUpcomingBirthdays(
        birthdayUsers.filter((u): u is typeof u & { birthDate: Date } => u.birthDate !== null),
      ),
      labor: { weeks: [], topOvertime: [] },
    };
  }
}
