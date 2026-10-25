import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { TransactionRunner } from '../../../core/database/transaction-runner.js';
import { PersonalBoardsRepository } from './personal-boards.repository.js';
import { PERSONAL_TEMPLATE_REVISION } from './personal-template.js';

/**
 * Засев шаблона «Моего плана» (ADR-0008) — данные задач во временном
 * исключении ADR-0024 (личные маршруты в таблицах «Процессов» до #438/#439).
 * Семантика «засев один раз», как у системного каталога: применяется, пока
 * шаблон не правили руками (`customizedAt IS NULL`) и его ревизия меньше
 * текущей; настроенное не трогается никогда. Идемпотентен; гонка двух
 * стартов разрешается уникальным `code`.
 */
@Injectable()
export class PersonalTemplateBootstrap implements OnApplicationBootstrap {
  constructor(
    private readonly txRunner: TransactionRunner,
    private readonly boards: PersonalBoardsRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PersonalTemplateBootstrap.name);
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.ensure();
    } catch (error) {
      if ((error as { code?: string }).code !== 'P2002') throw error;
      await this.ensure(); // параллельный старт создал первым — дочитываем
    }
  }

  async ensure(): Promise<void> {
    await this.txRunner.run((tx) => this.boards.seedTemplate(tx));
    this.logger.info(
      'tasks: шаблон «Моего плана» на месте (ревизия %d)',
      PERSONAL_TEMPLATE_REVISION,
    );
  }
}
