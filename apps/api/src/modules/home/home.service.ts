import { Injectable } from '@nestjs/common';
import type { HomeSummary } from '@nodus/contracts';

import { pickUpcomingBirthdays } from './birthdays.js';
import { HomeRepository } from './home.repository.js';

/**
 * Витрина Главной (#100): один агрегат `/home/summary`. Метрики — только из
 * реальных источников; модуль проектов и трекинг времени ещё не живут в
 * бэке — там честные нули/пустые массивы до их появления (клиент пустые
 * блоки не рендерит, вердикт владельца 01.10).
 */
@Injectable()
export class HomeService {
  constructor(private readonly repository: HomeRepository) {}

  async getSummary(): Promise<HomeSummary> {
    const [employeeCount, birthdayUsers] = await Promise.all([
      this.repository.countActiveEmployees(),
      this.repository.findActiveWithBirthDate(),
    ]);
    return {
      stats: { employeeCount, projectsDone: 0, dataNodes: 0 },
      birthdays: pickUpcomingBirthdays(birthdayUsers),
      labor: { weeks: [], topOvertime: [] },
    };
  }
}
